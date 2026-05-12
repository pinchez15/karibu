-- Migration 040: Patient timeline + latest vitals (Phase 3)
--
-- Step 3 of docs/patient-centered-architecture-plan.md.
-- Adds the read path that makes patient-first work usable: a single timeline
-- query returns a chronologically-ordered union of visits, notes, vitals,
-- and payments for one patient, with cursor-based pagination. A separate
-- helper returns the latest non-null value of each vital field with its
-- recorded_at timestamp so the UI can show "Latest known: 17.4 kg
-- (2026-04-08)" when today's measurement is missing.
--
-- Both RPCs follow the same auth pattern as 022's get_clinic_queue: explicit
-- p_patient_id, derive caller clinic from the patient row, validate
-- Clerk-authenticated callers against staff membership, allow service-role
-- callers through.

-- =============================================================================
-- 1. rpc_get_patient_timeline — chronological union of patient events
-- =============================================================================
-- event_type ∈ ('visit' | 'note' | 'vital' | 'payment')
-- event_at is the timestamp the UI orders by and uses as the cursor.
-- event_data is a JSON payload shaped per event type — small enough for
-- mobile bandwidth but rich enough to render a card without a second round
-- trip. Cursor is exclusive: pass the oldest event_at from the previous
-- page as p_cursor to fetch the next page.

CREATE OR REPLACE FUNCTION rpc_get_patient_timeline(
  p_patient_id UUID,
  p_cursor TIMESTAMPTZ DEFAULT NULL,
  p_limit INT DEFAULT 50
) RETURNS TABLE (
  event_type TEXT,
  event_at TIMESTAMPTZ,
  event_id UUID,
  event_data JSONB
) AS $$
DECLARE
  v_clinic UUID;
  v_clerk_user_id TEXT;
BEGIN
  SELECT clinic_id INTO v_clinic FROM patients WHERE id = p_patient_id;
  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'Patient not found';
  END IF;

  v_clerk_user_id := auth.jwt()->>'sub';
  IF v_clerk_user_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM staff
      WHERE clinic_id = v_clinic
        AND clerk_user_id = v_clerk_user_id
        AND is_active = TRUE
    ) THEN
      RAISE EXCEPTION 'Unauthorized for this clinic';
    END IF;
  END IF;

  RETURN QUERY
  WITH events AS (
    -- Visits (one row per visit; queue + clinical state)
    SELECT
      'visit'::TEXT AS event_type,
      COALESCE(v.checked_in_at, v.created_at) AS event_at,
      v.id AS event_id,
      jsonb_build_object(
        'visit_id', v.id,
        'status', v.status,
        'queue_status', v.queue_status,
        'department', v.department,
        'chief_complaint', v.chief_complaint,
        'diagnosis', v.diagnosis,
        'medications', v.medications,
        'follow_up_instructions', v.follow_up_instructions,
        'tests_ordered', v.tests_ordered,
        'dispensing_status', v.dispensing_status,
        'lab_status', v.lab_status,
        'lab_abnormal', v.lab_abnormal,
        'documentation_complete', v.documentation_complete,
        'visit_date', v.visit_date,
        'doctor_id', v.doctor_id
      ) AS event_data
    FROM visits v
    WHERE v.patient_id = p_patient_id

    UNION ALL

    -- Provider notes (every saved/signed/amended note, voided excluded)
    SELECT
      'note'::TEXT,
      pn.updated_at,
      pn.id,
      jsonb_build_object(
        'note_id', pn.id,
        'visit_id', pn.visit_id,
        'status', pn.status,
        'source', pn.source,
        'transcript_preview', LEFT(COALESCE(pn.transcript, ''), 280),
        'has_transcript', pn.transcript IS NOT NULL AND length(pn.transcript) > 0,
        'signed_at', pn.finalized_at,
        'signed_by', pn.finalized_by,
        'amended_at', pn.amended_at,
        'updated_at', pn.updated_at
      )
    FROM provider_notes pn
    WHERE pn.patient_id = p_patient_id
      AND pn.status != 'voided'

    UNION ALL

    -- Vitals (one row per recorded set)
    SELECT
      'vital'::TEXT,
      pv.recorded_at,
      pv.id,
      jsonb_build_object(
        'vital_id', pv.id,
        'visit_id', pv.visit_id,
        'recorded_by', pv.recorded_by,
        'weight_kg', pv.weight_kg,
        'height_cm', pv.height_cm,
        'temp_c', pv.temp_c,
        'bp_systolic', pv.bp_systolic,
        'bp_diastolic', pv.bp_diastolic,
        'pulse_bpm', pv.pulse_bpm,
        'resp_rate', pv.resp_rate,
        'spo2_pct', pv.spo2_pct,
        'muac_cm', pv.muac_cm,
        'notes', pv.notes
      )
    FROM patient_vitals pv
    WHERE pv.patient_id = p_patient_id

    UNION ALL

    -- Payments
    SELECT
      'payment'::TEXT,
      p.created_at,
      p.id,
      jsonb_build_object(
        'payment_id', p.id,
        'visit_id', p.visit_id,
        'amount_ugx', p.amount_ugx,
        'payment_method', p.payment_method,
        'receipt_number', p.receipt_number,
        'service_type', p.service_type,
        'status', p.status,
        'collected_by', p.collected_by
      )
    FROM payments p
    WHERE p.patient_id = p_patient_id
  )
  SELECT e.event_type, e.event_at, e.event_id, e.event_data
  FROM events e
  WHERE p_cursor IS NULL OR e.event_at < p_cursor
  ORDER BY e.event_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION rpc_get_patient_timeline(UUID, TIMESTAMPTZ, INT) TO anon, authenticated;

-- =============================================================================
-- 2. rpc_get_patient_latest_vitals — per-field most recent value + timestamp
-- =============================================================================
-- Each measurement field is resolved independently: weight may be from
-- today, height from a month ago, BP from last visit. The UI uses this to
-- show "Latest known" alongside today's captured values, distinguishing
-- "not captured today" from "unknown" per the plan's vitals model.

CREATE OR REPLACE FUNCTION rpc_get_patient_latest_vitals(
  p_patient_id UUID
) RETURNS TABLE (
  weight_kg NUMERIC,
  weight_kg_at TIMESTAMPTZ,
  height_cm NUMERIC,
  height_cm_at TIMESTAMPTZ,
  temp_c NUMERIC,
  temp_c_at TIMESTAMPTZ,
  bp_systolic INTEGER,
  bp_diastolic INTEGER,
  bp_at TIMESTAMPTZ,
  pulse_bpm INTEGER,
  pulse_bpm_at TIMESTAMPTZ,
  resp_rate INTEGER,
  resp_rate_at TIMESTAMPTZ,
  spo2_pct INTEGER,
  spo2_pct_at TIMESTAMPTZ,
  muac_cm NUMERIC,
  muac_cm_at TIMESTAMPTZ
) AS $$
DECLARE
  v_clinic UUID;
  v_clerk_user_id TEXT;
BEGIN
  SELECT clinic_id INTO v_clinic FROM patients WHERE id = p_patient_id;
  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'Patient not found';
  END IF;

  v_clerk_user_id := auth.jwt()->>'sub';
  IF v_clerk_user_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM staff
      WHERE clinic_id = v_clinic
        AND clerk_user_id = v_clerk_user_id
        AND is_active = TRUE
    ) THEN
      RAISE EXCEPTION 'Unauthorized for this clinic';
    END IF;
  END IF;

  -- Per-field latest non-null. Each subquery hits idx_patient_vitals_patient
  -- (patient_id, recorded_at DESC) from migration 029. BP systolic/diastolic
  -- share a single timestamp since they're captured together; the joined
  -- subquery returns both with the systolic measurement's recorded_at.
  RETURN QUERY
  SELECT
    (SELECT pv.weight_kg FROM patient_vitals pv
       WHERE pv.patient_id = p_patient_id AND pv.weight_kg IS NOT NULL
       ORDER BY pv.recorded_at DESC LIMIT 1),
    (SELECT pv.recorded_at FROM patient_vitals pv
       WHERE pv.patient_id = p_patient_id AND pv.weight_kg IS NOT NULL
       ORDER BY pv.recorded_at DESC LIMIT 1),

    (SELECT pv.height_cm FROM patient_vitals pv
       WHERE pv.patient_id = p_patient_id AND pv.height_cm IS NOT NULL
       ORDER BY pv.recorded_at DESC LIMIT 1),
    (SELECT pv.recorded_at FROM patient_vitals pv
       WHERE pv.patient_id = p_patient_id AND pv.height_cm IS NOT NULL
       ORDER BY pv.recorded_at DESC LIMIT 1),

    (SELECT pv.temp_c FROM patient_vitals pv
       WHERE pv.patient_id = p_patient_id AND pv.temp_c IS NOT NULL
       ORDER BY pv.recorded_at DESC LIMIT 1),
    (SELECT pv.recorded_at FROM patient_vitals pv
       WHERE pv.patient_id = p_patient_id AND pv.temp_c IS NOT NULL
       ORDER BY pv.recorded_at DESC LIMIT 1),

    (SELECT pv.bp_systolic FROM patient_vitals pv
       WHERE pv.patient_id = p_patient_id AND pv.bp_systolic IS NOT NULL
       ORDER BY pv.recorded_at DESC LIMIT 1),
    (SELECT pv.bp_diastolic FROM patient_vitals pv
       WHERE pv.patient_id = p_patient_id AND pv.bp_systolic IS NOT NULL
       ORDER BY pv.recorded_at DESC LIMIT 1),
    (SELECT pv.recorded_at FROM patient_vitals pv
       WHERE pv.patient_id = p_patient_id AND pv.bp_systolic IS NOT NULL
       ORDER BY pv.recorded_at DESC LIMIT 1),

    (SELECT pv.pulse_bpm FROM patient_vitals pv
       WHERE pv.patient_id = p_patient_id AND pv.pulse_bpm IS NOT NULL
       ORDER BY pv.recorded_at DESC LIMIT 1),
    (SELECT pv.recorded_at FROM patient_vitals pv
       WHERE pv.patient_id = p_patient_id AND pv.pulse_bpm IS NOT NULL
       ORDER BY pv.recorded_at DESC LIMIT 1),

    (SELECT pv.resp_rate FROM patient_vitals pv
       WHERE pv.patient_id = p_patient_id AND pv.resp_rate IS NOT NULL
       ORDER BY pv.recorded_at DESC LIMIT 1),
    (SELECT pv.recorded_at FROM patient_vitals pv
       WHERE pv.patient_id = p_patient_id AND pv.resp_rate IS NOT NULL
       ORDER BY pv.recorded_at DESC LIMIT 1),

    (SELECT pv.spo2_pct FROM patient_vitals pv
       WHERE pv.patient_id = p_patient_id AND pv.spo2_pct IS NOT NULL
       ORDER BY pv.recorded_at DESC LIMIT 1),
    (SELECT pv.recorded_at FROM patient_vitals pv
       WHERE pv.patient_id = p_patient_id AND pv.spo2_pct IS NOT NULL
       ORDER BY pv.recorded_at DESC LIMIT 1),

    (SELECT pv.muac_cm FROM patient_vitals pv
       WHERE pv.patient_id = p_patient_id AND pv.muac_cm IS NOT NULL
       ORDER BY pv.recorded_at DESC LIMIT 1),
    (SELECT pv.recorded_at FROM patient_vitals pv
       WHERE pv.patient_id = p_patient_id AND pv.muac_cm IS NOT NULL
       ORDER BY pv.recorded_at DESC LIMIT 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION rpc_get_patient_latest_vitals(UUID) TO anon, authenticated;
