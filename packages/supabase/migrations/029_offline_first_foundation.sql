-- Migration: Offline-first foundation
-- ============================================================================
-- Purpose: Decouple clinical record-keeping from AI augmentation. Adds the
-- minimum server-side surface for the Android app to push patient/visit/
-- vitals/note/summary independently of the AI structuring pipeline. Strictly
-- additive: existing tables, columns, statuses, RLS policies, and edge
-- functions all continue to work unchanged.
--
-- What this adds:
--   1. patient_vitals — longitudinal vitals keyed on patient_id (visit_id
--      nullable) so inpatient maternal monitoring can record multiple
--      readings without a separate visit per reading.
--   2. visits.documentation_complete + documentation_completed_at — durable
--      flag set when the clinician finishes writing. Independent of the
--      existing pending → review → sent → completed status machine.
--   3. patient_notes.source — discriminator so a clinician-authored fallback
--      summary (raw transcript) can be saved at point-of-care, with the AI
--      pipeline allowed to overwrite it later when invoked.
--   4. SECURITY DEFINER RPCs covering every clinical write path, role-aware
--      against the actual staff_role_check from migration 024. Bypasses the
--      doctor-only RLS in migration 009 for nurse/midwife/clinical_officer/
--      nursing_assistant. Visit RPC sidesteps the PostgREST INSERT-with-
--      RETURNING 404 we hit on direct visits POST.
--
-- What this does NOT change:
--   - visits.status enum and existing transitions
--   - provider_notes.note_content and structured_data (Inngest still writes
--     them)
--   - hmis_diagnosis_codes / visit_diagnosis_codes (reuse, not replace)
--   - Any edge function (submit-dictation et al stay; they're additive
--     in the new model — only invoked when the clinician taps the AI button)
--
-- Companion change (in apps/web/src/inngest/functions/structure-dictation.ts):
-- when writing patient_notes, set source='ai_generated' so the
-- rpc_upsert_patient_note_summary WHERE clause permits the overwrite.
-- ============================================================================

-- ============================================================================
-- 1. patient_vitals
-- ============================================================================

CREATE TABLE IF NOT EXISTS patient_vitals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  visit_id UUID REFERENCES visits(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_by UUID REFERENCES staff(id),
  weight_kg NUMERIC(5,2),
  height_cm NUMERIC(5,1),
  temp_c NUMERIC(3,1),
  bp_systolic INTEGER,
  bp_diastolic INTEGER,
  pulse_bpm INTEGER,
  resp_rate INTEGER,
  spo2_pct INTEGER,
  muac_cm NUMERIC(4,1),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_vitals_patient
  ON patient_vitals(patient_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_patient_vitals_visit
  ON patient_vitals(visit_id) WHERE visit_id IS NOT NULL;

ALTER TABLE patient_vitals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "patient_vitals_select" ON patient_vitals;
CREATE POLICY "patient_vitals_select" ON patient_vitals FOR SELECT
  USING (
    patient_id IN (
      SELECT id FROM patients WHERE clinic_id = get_current_clinic_id()
    )
  );

-- All writes go through rpc_insert_patient_vitals (SECURITY DEFINER).
-- No direct-INSERT client policy.

-- ============================================================================
-- 2. visits.documentation_complete
-- ============================================================================

ALTER TABLE visits ADD COLUMN IF NOT EXISTS documentation_complete BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS documentation_completed_at TIMESTAMPTZ;

-- ============================================================================
-- 3. patient_notes.source
-- ============================================================================

ALTER TABLE patient_notes ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'ai_generated'
  CHECK (source IN ('ai_generated', 'clinician_fallback'));

-- ============================================================================
-- 4. SECURITY DEFINER RPCs
-- ============================================================================
-- IMPORTANT: keep the role allowlists below in sync with the staff_role_check
-- constraint in 024_hc3_roles_and_departments.sql. Adding a clinical role
-- server-side without updating these RPCs silently locks that role out of
-- writes.

-- ---- rpc_create_visit -------------------------------------------------------
-- Replaces direct PostgREST INSERT into visits, which was returning 404 in
-- production despite the relaxed visits_select_policy from migration 028.
-- Matches the pattern of check_in_patient / claim_patient / assign_to_nurse.
-- p_department defaults to 'opd' to match visits.department default from 024.
CREATE OR REPLACE FUNCTION rpc_create_visit(
  p_id UUID,
  p_clinic_id UUID,
  p_patient_id UUID,
  p_doctor_id UUID DEFAULT NULL,
  p_chief_complaint TEXT DEFAULT NULL,
  p_visit_date DATE DEFAULT CURRENT_DATE,
  p_department TEXT DEFAULT 'opd'
) RETURNS VOID AS $$
DECLARE
  v_caller_clinic UUID;
BEGIN
  v_caller_clinic := get_current_clinic_id();
  IF v_caller_clinic IS NULL OR v_caller_clinic != p_clinic_id THEN
    RAISE EXCEPTION 'Unauthorized: clinic mismatch (caller=% target=%)',
      v_caller_clinic, p_clinic_id;
  END IF;

  INSERT INTO visits (
    id, clinic_id, patient_id, doctor_id, chief_complaint, visit_date,
    department, status, queue_status, priority
  ) VALUES (
    p_id, p_clinic_id, p_patient_id, p_doctor_id, p_chief_complaint, p_visit_date,
    p_department, 'pending', 'waiting', 'normal'
  )
  ON CONFLICT (id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_create_visit(UUID, UUID, UUID, UUID, TEXT, DATE, TEXT)
  TO anon, authenticated;

-- ---- rpc_upsert_provider_note ----------------------------------------------
-- Bypasses the 009-era doctor-only RLS on provider_notes. Internally checks
-- the broader 024 clinical role set. Idempotent on visit_id (matches the
-- UNIQUE NOT NULL constraint on provider_notes.visit_id from 001).
CREATE OR REPLACE FUNCTION rpc_upsert_provider_note(
  p_id UUID,
  p_visit_id UUID,
  p_transcript TEXT,
  p_status TEXT DEFAULT 'draft'
) RETURNS VOID AS $$
DECLARE
  v_visit_clinic UUID;
  v_role TEXT;
BEGIN
  SELECT clinic_id INTO v_visit_clinic FROM visits WHERE id = p_visit_id;
  IF v_visit_clinic IS NULL OR v_visit_clinic != get_current_clinic_id() THEN
    RAISE EXCEPTION 'Unauthorized: visit/clinic mismatch';
  END IF;

  v_role := get_current_staff_role();
  IF v_role NOT IN ('admin','doctor','nurse','clinical_officer','midwife','nursing_assistant') THEN
    RAISE EXCEPTION 'Unauthorized role: %', v_role;
  END IF;

  INSERT INTO provider_notes (id, visit_id, transcript, status, updated_at)
  VALUES (p_id, p_visit_id, p_transcript, p_status, NOW())
  ON CONFLICT (visit_id) DO UPDATE
    SET transcript = EXCLUDED.transcript,
        status = EXCLUDED.status,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_upsert_provider_note(UUID, UUID, TEXT, TEXT)
  TO anon, authenticated;

-- ---- rpc_upsert_patient_note_summary ---------------------------------------
-- Clinician-authored fallback for patient_notes.content. Only overwrites
-- existing rows whose source='clinician_fallback' — never clobbers an
-- AI-generated row. (Inngest's structure-dictation must be updated to set
-- source='ai_generated' when writing for the matching half of this contract.)
CREATE OR REPLACE FUNCTION rpc_upsert_patient_note_summary(
  p_id UUID,
  p_visit_id UUID,
  p_content TEXT
) RETURNS VOID AS $$
DECLARE
  v_visit_clinic UUID;
  v_role TEXT;
BEGIN
  SELECT clinic_id INTO v_visit_clinic FROM visits WHERE id = p_visit_id;
  IF v_visit_clinic IS NULL OR v_visit_clinic != get_current_clinic_id() THEN
    RAISE EXCEPTION 'Unauthorized: visit/clinic mismatch';
  END IF;

  v_role := get_current_staff_role();
  IF v_role NOT IN ('admin','doctor','nurse','clinical_officer','midwife','nursing_assistant') THEN
    RAISE EXCEPTION 'Unauthorized role: %', v_role;
  END IF;

  INSERT INTO patient_notes (id, visit_id, content, language, source, created_at, updated_at)
  VALUES (p_id, p_visit_id, p_content, 'en', 'clinician_fallback', NOW(), NOW())
  ON CONFLICT (visit_id) DO UPDATE
    SET content = EXCLUDED.content,
        source = EXCLUDED.source,
        updated_at = NOW()
    WHERE patient_notes.source = 'clinician_fallback';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_upsert_patient_note_summary(UUID, UUID, TEXT)
  TO anon, authenticated;

-- ---- rpc_insert_patient_vitals ---------------------------------------------
-- Vitals reading. Patient is required; visit is optional (inpatient
-- longitudinal pattern doesn't always map 1:1 to a visit row).
CREATE OR REPLACE FUNCTION rpc_insert_patient_vitals(
  p_id UUID,
  p_patient_id UUID,
  p_visit_id UUID DEFAULT NULL,
  p_weight_kg NUMERIC DEFAULT NULL,
  p_height_cm NUMERIC DEFAULT NULL,
  p_temp_c NUMERIC DEFAULT NULL,
  p_bp_systolic INTEGER DEFAULT NULL,
  p_bp_diastolic INTEGER DEFAULT NULL,
  p_pulse_bpm INTEGER DEFAULT NULL,
  p_resp_rate INTEGER DEFAULT NULL,
  p_spo2_pct INTEGER DEFAULT NULL,
  p_muac_cm NUMERIC DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_recorded_at TIMESTAMPTZ DEFAULT NOW()
) RETURNS VOID AS $$
DECLARE
  v_patient_clinic UUID;
  v_visit_clinic UUID;
  v_staff_id UUID;
  v_role TEXT;
BEGIN
  SELECT clinic_id INTO v_patient_clinic FROM patients WHERE id = p_patient_id;
  IF v_patient_clinic IS NULL OR v_patient_clinic != get_current_clinic_id() THEN
    RAISE EXCEPTION 'Unauthorized: patient/clinic mismatch';
  END IF;

  IF p_visit_id IS NOT NULL THEN
    SELECT clinic_id INTO v_visit_clinic FROM visits WHERE id = p_visit_id;
    IF v_visit_clinic != get_current_clinic_id() THEN
      RAISE EXCEPTION 'Unauthorized: visit/clinic mismatch';
    END IF;
  END IF;

  v_role := get_current_staff_role();
  IF v_role NOT IN ('admin','doctor','nurse','clinical_officer','midwife','nursing_assistant') THEN
    RAISE EXCEPTION 'Unauthorized role: %', v_role;
  END IF;

  v_staff_id := get_current_staff_id();

  INSERT INTO patient_vitals (
    id, patient_id, visit_id, recorded_at, recorded_by,
    weight_kg, height_cm, temp_c,
    bp_systolic, bp_diastolic, pulse_bpm, resp_rate, spo2_pct,
    muac_cm, notes
  ) VALUES (
    p_id, p_patient_id, p_visit_id, p_recorded_at, v_staff_id,
    p_weight_kg, p_height_cm, p_temp_c,
    p_bp_systolic, p_bp_diastolic, p_pulse_bpm, p_resp_rate, p_spo2_pct,
    p_muac_cm, p_notes
  )
  ON CONFLICT (id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_insert_patient_vitals(
  UUID, UUID, UUID, NUMERIC, NUMERIC, NUMERIC, INTEGER, INTEGER,
  INTEGER, INTEGER, INTEGER, NUMERIC, TEXT, TIMESTAMPTZ
) TO anon, authenticated;

-- ---- rpc_mark_documentation_complete ---------------------------------------
-- Clinician taps Save. Marks the visit as clinician-finished AND advances
-- status pending → sent (skipping the AI 'review' state). This is the only
-- status-flow change in the refactor: payment becomes reachable from the
-- non-AI path. Existing AI flow (pending → review → sent on approval) is
-- unchanged — those visits don't pass through this RPC.
CREATE OR REPLACE FUNCTION rpc_mark_documentation_complete(p_visit_id UUID)
RETURNS VOID AS $$
DECLARE
  v_visit_clinic UUID;
BEGIN
  SELECT clinic_id INTO v_visit_clinic FROM visits WHERE id = p_visit_id;
  IF v_visit_clinic IS NULL OR v_visit_clinic != get_current_clinic_id() THEN
    RAISE EXCEPTION 'Unauthorized: visit/clinic mismatch';
  END IF;

  UPDATE visits
    SET documentation_complete = TRUE,
        documentation_completed_at = NOW(),
        status = CASE WHEN status = 'pending' THEN 'sent' ELSE status END,
        updated_at = NOW()
    WHERE id = p_visit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_mark_documentation_complete(UUID)
  TO anon, authenticated;

-- ============================================================================
-- 5. Notes for downstream consumers (NOT a code change in this migration)
-- ============================================================================
-- Apps/web Inngest structure-dictation.ts: when writing patient_notes, must
-- include source='ai_generated' so rpc_upsert_patient_note_summary's
-- WHERE source='clinician_fallback' guard permits the overwrite.
--
-- Android consumers in same phase as this migration:
--   - VisitDao.getMyPendingDictations: change predicate from status='pending'
--     to documentation_complete=0 (semantics: "clinician hasn't finished
--     writing", correct under new flow).
--   - VisitDetailsScreen: add "Proceed to payment" CTA when
--     status='sent' AND documentation_complete=true.
--
-- Web consumers in same phase:
--   - VisitDetailClient.tsx + PendingDictationCard.tsx: render the dictation
--     card only when !documentation_complete; show print/payment surface
--     once status='sent' regardless of AI presence.
