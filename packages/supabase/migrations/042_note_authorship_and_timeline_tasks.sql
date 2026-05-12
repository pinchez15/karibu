-- Migration 042: note authorship + tasks in patient timeline + my-drafts filter
--
-- Closes three plan gaps from docs/patient-centered-architecture-plan.md:
--
--   1. Patient timeline (Phase 3 exit criteria) should include care_tasks.
--      Migration 040's rpc_get_patient_timeline union covered visits / notes
--      / vitals / payments only; care_tasks shipped in migration 041 but
--      doesn't appear in the longitudinal view yet.
--
--   2. rpc_worklist_my_drafts (migration 041) currently returns every clinic
--      draft because provider_notes doesn't capture authorship until sign
--      (finalized_by). We add provider_notes.created_by, set it on first
--      upsert, and filter the worklist by it when the caller is a Clerk
--      staff member.
--
--   3. Provider notes that originate as patient-only (no visit, autosave
--      from PatientNoteScreen / AddPatientNoteSheet) need an author trail
--      for audit and for the my-drafts filter. Without created_by they're
--      orphaned until sign.

-- =============================================================================
-- 1. provider_notes.created_by
-- =============================================================================
-- Set on the first INSERT path of rpc_upsert_provider_note; preserved on
-- UPDATE (autosave re-saves never clobber the author). Nullable for legacy
-- rows that pre-date this migration.

ALTER TABLE provider_notes ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES staff(id);

-- Backfill: older rows that were already signed inherit the author from
-- finalized_by (best available signal). Demo data only — pre-launch.
UPDATE provider_notes
  SET created_by = finalized_by
  WHERE created_by IS NULL AND finalized_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_provider_notes_created_by_status
  ON provider_notes(created_by, status) WHERE created_by IS NOT NULL;

-- =============================================================================
-- 2. Updated rpc_upsert_provider_note (captures created_by on INSERT)
-- =============================================================================

DROP FUNCTION IF EXISTS rpc_upsert_provider_note(UUID, UUID, TEXT, TEXT, UUID, TEXT);

CREATE OR REPLACE FUNCTION rpc_upsert_provider_note(
  p_id UUID,
  p_visit_id UUID,
  p_transcript TEXT,
  p_status TEXT DEFAULT 'draft',
  p_patient_id UUID DEFAULT NULL,
  p_source TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_caller_clinic UUID;
  v_visit_clinic UUID;
  v_role TEXT;
  v_patient_id UUID;
  v_source TEXT;
  v_staff_id UUID;
BEGIN
  v_caller_clinic := get_current_clinic_id();
  v_staff_id := get_current_staff_id();
  v_role := get_current_staff_role();
  IF v_role NOT IN ('admin','doctor','nurse','clinical_officer','midwife','nursing_assistant') THEN
    RAISE EXCEPTION 'Unauthorized role: %', v_role;
  END IF;

  IF p_patient_id IS NOT NULL THEN
    v_patient_id := p_patient_id;
    SELECT clinic_id INTO v_visit_clinic FROM patients WHERE id = v_patient_id;
    IF v_visit_clinic IS NULL OR v_visit_clinic != v_caller_clinic THEN
      RAISE EXCEPTION 'Unauthorized: patient/clinic mismatch';
    END IF;
    IF p_visit_id IS NOT NULL THEN
      SELECT clinic_id INTO v_visit_clinic FROM visits WHERE id = p_visit_id;
      IF v_visit_clinic IS NULL OR v_visit_clinic != v_caller_clinic THEN
        RAISE EXCEPTION 'Unauthorized: visit/clinic mismatch';
      END IF;
    END IF;
  ELSIF p_visit_id IS NOT NULL THEN
    SELECT clinic_id, patient_id INTO v_visit_clinic, v_patient_id FROM visits WHERE id = p_visit_id;
    IF v_visit_clinic IS NULL OR v_visit_clinic != v_caller_clinic THEN
      RAISE EXCEPTION 'Unauthorized: visit/clinic mismatch';
    END IF;
  ELSE
    RAISE EXCEPTION 'Either p_patient_id or p_visit_id is required';
  END IF;

  v_source := COALESCE(p_source, CASE WHEN p_visit_id IS NOT NULL THEN 'visit' ELSE 'general' END);

  INSERT INTO provider_notes (id, patient_id, visit_id, transcript, status, source, created_by, updated_at)
  VALUES (p_id, v_patient_id, p_visit_id, p_transcript, p_status, v_source, v_staff_id, now())
  ON CONFLICT (id) DO UPDATE
    SET patient_id = EXCLUDED.patient_id,
        visit_id = COALESCE(provider_notes.visit_id, EXCLUDED.visit_id),
        transcript = CASE
          WHEN EXCLUDED.transcript IS NOT NULL THEN EXCLUDED.transcript
          ELSE provider_notes.transcript
        END,
        status = EXCLUDED.status,
        source = COALESCE(EXCLUDED.source, provider_notes.source),
        -- created_by stays as the original author; never clobber on update.
        updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_upsert_provider_note(UUID, UUID, TEXT, TEXT, UUID, TEXT) TO anon, authenticated;

-- =============================================================================
-- 3. rpc_worklist_my_drafts filtered by created_by when Clerk-authenticated
-- =============================================================================
-- Service-role callers still pass p_staff_id explicitly. Clerk callers get
-- their own drafts only; the previous "all clinic drafts" behavior was a
-- bug (the worklist's whole point is "what do I need to finish").

CREATE OR REPLACE FUNCTION rpc_worklist_my_drafts(
  p_clinic_id UUID,
  p_staff_id UUID DEFAULT NULL
) RETURNS TABLE (
  note_id UUID,
  patient_id UUID,
  patient_name TEXT,
  visit_id UUID,
  source TEXT,
  transcript_preview TEXT,
  updated_at TIMESTAMPTZ
) AS $$
DECLARE
  v_clerk_user_id TEXT;
  v_staff_id UUID;
BEGIN
  v_clerk_user_id := auth.jwt()->>'sub';

  IF v_clerk_user_id IS NOT NULL THEN
    SELECT id INTO v_staff_id FROM staff
      WHERE clerk_user_id = v_clerk_user_id
        AND clinic_id = p_clinic_id
        AND is_active = TRUE;
    IF v_staff_id IS NULL THEN
      RAISE EXCEPTION 'Staff not authorized for this clinic';
    END IF;
  ELSE
    IF p_staff_id IS NULL THEN
      RAISE EXCEPTION 'p_staff_id required for service-role caller';
    END IF;
    v_staff_id := p_staff_id;
  END IF;

  RETURN QUERY
  SELECT
    pn.id AS note_id,
    pn.patient_id,
    trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS patient_name,
    pn.visit_id,
    pn.source,
    LEFT(COALESCE(pn.transcript, ''), 200) AS transcript_preview,
    pn.updated_at
  FROM provider_notes pn
  JOIN patients p ON p.id = pn.patient_id
  WHERE p.clinic_id = p_clinic_id
    AND pn.status = 'draft'
    AND pn.created_by = v_staff_id
  ORDER BY pn.updated_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION rpc_worklist_my_drafts(UUID, UUID) TO anon, authenticated;

-- =============================================================================
-- 4. rpc_get_patient_timeline extended with care_tasks
-- =============================================================================
-- Adds 'task' as a fifth event_type. event_at is the task's created_at;
-- completed_at / due_at / status live inside event_data so the UI can chip
-- "Open / Due / Completed" without a join. Cancelled tasks are excluded
-- (they're noise on the timeline).

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
        'created_by', pn.created_by,
        'updated_at', pn.updated_at
      )
    FROM provider_notes pn
    WHERE pn.patient_id = p_patient_id
      AND pn.status != 'voided'

    UNION ALL

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

    UNION ALL

    -- Phase 5 care_tasks (migration 041). Cancelled tasks excluded so the
    -- timeline isn't cluttered with withdrawn follow-ups.
    SELECT
      'task'::TEXT,
      ct.created_at,
      ct.id,
      jsonb_build_object(
        'task_id', ct.id,
        'visit_id', ct.visit_id,
        'task_type', ct.task_type,
        'title', ct.title,
        'description', ct.description,
        'assignee_role', ct.assignee_role,
        'assignee_id', ct.assignee_id,
        'due_at', ct.due_at,
        'status', ct.status,
        'completed_at', ct.completed_at,
        'completed_by', ct.completed_by,
        'created_by', ct.created_by
      )
    FROM care_tasks ct
    WHERE ct.patient_id = p_patient_id
      AND ct.status != 'cancelled'
  )
  SELECT e.event_type, e.event_at, e.event_id, e.event_data
  FROM events e
  WHERE p_cursor IS NULL OR e.event_at < p_cursor
  ORDER BY e.event_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION rpc_get_patient_timeline(UUID, TIMESTAMPTZ, INT) TO anon, authenticated;
