-- Replay tolerance regression checks (WP-E migration 101).
-- Run against a local Supabase DB after migrations:
--   supabase db reset && psql "$DATABASE_URL" -f packages/supabase/tests/replay_tolerance.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- Shared seed (rolled back at end)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_clinic UUID := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01';
  v_doctor UUID := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee02';
  v_lab_tech UUID := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee03';
  v_patient UUID := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee04';
BEGIN
  INSERT INTO clinics (id, name, slug, timezone)
  VALUES (v_clinic, 'WP-E Replay Clinic', 'wp-e-replay', 'Africa/Kampala');

  INSERT INTO staff (id, clerk_user_id, clinic_id, email, display_name, role, is_active, onboarding_completed_at)
  VALUES
    (v_doctor, 'wp-e-doctor', v_clinic, 'doctor@wp-e.test', 'WP-E Doctor', 'doctor', TRUE, NOW()),
    (v_lab_tech, 'wp-e-lab-tech', v_clinic, 'lab@wp-e.test', 'WP-E Lab Tech', 'lab_tech', TRUE, NOW());

  INSERT INTO patients (id, clinic_id, first_name, last_name, whatsapp_number)
  VALUES (v_patient, v_clinic, 'Replay', 'Patient', '+256700000001');
END $$;

-- Helper: simulate an authenticated Clerk JWT for role-gated RPCs.
CREATE OR REPLACE FUNCTION _wp_e_set_jwt(p_sub TEXT)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_sub, 'role', 'authenticated')::text,
    true
  );
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Case 1: Care-task replay fixed (was undefined_column on client_op_id)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_clinic UUID := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01';
  v_doctor UUID := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee02';
  v_patient UUID := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee04';
  v_op_id UUID := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee101';
  v_task_id UUID;
  v_count INT;
BEGIN
  PERFORM _wp_e_set_jwt('wp-e-doctor');

  v_task_id := rpc_create_care_task(
    v_clinic, v_patient, 'general', 'Replay task', 'desc',
    NULL, 'doctor', v_doctor, NULL, v_op_id, v_doctor
  );

  PERFORM rpc_create_care_task(
    v_clinic, v_patient, 'general', 'Replay task', 'desc',
    NULL, 'doctor', v_doctor, NULL, v_op_id, v_doctor
  );

  SELECT COUNT(*) INTO v_count FROM care_tasks
  WHERE clinic_id = v_clinic AND title = 'Replay task';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Case 1 failed: expected 1 care_tasks row, got %', v_count;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM sync_operations WHERE id = v_op_id) THEN
    RAISE EXCEPTION 'Case 1 failed: sync_operations row missing';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Case 2: Gate-before-existence — replay succeeds after visit deleted
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_clinic UUID := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01';
  v_patient UUID := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee04';
  v_visit UUID := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee201';
  v_op_id UUID := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee202';
BEGIN
  INSERT INTO visits (
    id, clinic_id, patient_id, status, queue_status, visit_date, department, lab_status
  ) VALUES (
    v_visit, v_clinic, v_patient, 'pending', 'waiting', CURRENT_DATE, 'opd', 'pending'
  );

  PERFORM _wp_e_set_jwt('wp-e-lab-tech');
  PERFORM rpc_record_lab_result(v_visit, 'Negative', FALSE, v_op_id);

  DELETE FROM visits WHERE id = v_visit;

  -- Must not raise "Visit not found" — gate short-circuits first.
  PERFORM rpc_record_lab_result(v_visit, 'Negative', FALSE, v_op_id);
END $$;

-- ---------------------------------------------------------------------------
-- Case 3: State-conflict replay — original op-id no-ops; new op-id still 400s
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_clinic UUID := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01';
  v_patient UUID := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee04';
  v_visit UUID := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee301';
  v_submit_op UUID := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee302';
  v_new_op UUID := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee303';
  v_got_exception BOOLEAN := FALSE;
BEGIN
  INSERT INTO visits (
    id, clinic_id, patient_id, status, queue_status, visit_date, department,
    dispensing_status
  ) VALUES (
    v_visit, v_clinic, v_patient, 'pending', 'waiting', CURRENT_DATE, 'opd', 'not_started'
  );

  PERFORM _wp_e_set_jwt('wp-e-doctor');
  PERFORM rpc_submit_pharmacy_order(v_visit, 'Paracetamol 500mg', NULL, v_submit_op);

  UPDATE visits SET dispensing_status = 'dispensed' WHERE id = v_visit;

  -- Replay of the original submit op-id is a no-op.
  PERFORM rpc_submit_pharmacy_order(v_visit, 'Paracetamol 500mg', NULL, v_submit_op);

  -- A new op-id against dispensed state must still raise.
  BEGIN
    PERFORM rpc_submit_pharmacy_order(v_visit, 'Paracetamol 500mg', NULL, v_new_op);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Cannot resubmit pharmacy order after full dispense%' THEN
      RAISE;
    END IF;
    v_got_exception := TRUE;
  END;

  IF NOT v_got_exception THEN
    RAISE EXCEPTION 'Case 3 failed: expected resubmit guard on new op-id';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Case 4: Old-client path — NULL op-id keeps state checks (no gate short-circuit)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_clinic UUID := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01';
  v_patient UUID := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee04';
  v_visit UUID := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee401';
  v_got_exception BOOLEAN := FALSE;
BEGIN
  INSERT INTO visits (
    id, clinic_id, patient_id, status, queue_status, visit_date, department,
    dispensing_status
  ) VALUES (
    v_visit, v_clinic, v_patient, 'pending', 'waiting', CURRENT_DATE, 'opd', 'dispensed'
  );

  PERFORM _wp_e_set_jwt('wp-e-doctor');

  BEGIN
    PERFORM rpc_submit_pharmacy_order(v_visit, 'Ibuprofen', NULL, NULL);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Cannot resubmit pharmacy order after full dispense%' THEN
      RAISE;
    END IF;
    v_got_exception := TRUE;
  END;

  IF NOT v_got_exception THEN
    RAISE EXCEPTION 'Case 4 failed: NULL op-id should still hit state guard';
  END IF;

  -- Deleted visit + NULL op-id must still raise (no replay gate).
  DELETE FROM visits WHERE id = v_visit;
  PERFORM _wp_e_set_jwt('wp-e-lab-tech');

  BEGIN
    PERFORM rpc_record_lab_result(v_visit, 'Positive', FALSE, NULL);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Visit not found%' THEN
      RAISE;
    END IF;
    v_got_exception := TRUE;
  END;

  IF NOT v_got_exception THEN
    RAISE EXCEPTION 'Case 4 failed: NULL op-id on missing visit should raise';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Case 5: E2 regression sweep — already-correct RPCs tolerate identical replay
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_clinic UUID := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01';
  v_doctor UUID := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee02';
  v_patient UUID := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee04';
  v_new_patient UUID := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee501';
  v_visit UUID := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee502';
  v_note UUID := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee503';
  v_vitals UUID := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee504';
  v_patient_op UUID := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee505';
  v_admit_op UUID := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee506';
  v_patient_count INT;
  v_visit_count INT;
  v_vitals_count INT;
  v_note_count INT;
  v_admission_count INT;
BEGIN
  PERFORM _wp_e_set_jwt('wp-e-doctor');

  -- rpc_create_patient
  PERFORM rpc_create_patient(
    v_new_patient, v_clinic, 'New', 'Person', NULL, NULL, NULL,
    NULL, NULL, NULL, 'unknown', NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    v_patient_op
  );
  PERFORM rpc_create_patient(
    v_new_patient, v_clinic, 'New', 'Person', NULL, NULL, NULL,
    NULL, NULL, NULL, 'unknown', NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    v_patient_op
  );
  SELECT COUNT(*) INTO v_patient_count FROM patients WHERE id = v_new_patient;
  IF v_patient_count <> 1 THEN
    RAISE EXCEPTION 'Case 5 failed: rpc_create_patient replay created duplicates';
  END IF;

  -- rpc_create_visit (ON CONFLICT id)
  PERFORM rpc_create_visit(v_visit, v_clinic, v_new_patient, v_doctor, 'Headache');
  PERFORM rpc_create_visit(v_visit, v_clinic, v_new_patient, v_doctor, 'Headache');
  SELECT COUNT(*) INTO v_visit_count FROM visits WHERE id = v_visit;
  IF v_visit_count <> 1 THEN
    RAISE EXCEPTION 'Case 5 failed: rpc_create_visit replay created duplicates';
  END IF;

  -- rpc_insert_patient_vitals (ON CONFLICT id)
  PERFORM rpc_insert_patient_vitals(
    v_vitals, v_new_patient, v_visit, 70, 170, 36.5,
    120, 80, 72, 16, 98, NULL, 'ok', NOW()
  );
  PERFORM rpc_insert_patient_vitals(
    v_vitals, v_new_patient, v_visit, 70, 170, 36.5,
    120, 80, 72, 16, 98, NULL, 'ok', NOW()
  );
  SELECT COUNT(*) INTO v_vitals_count FROM patient_vitals WHERE id = v_vitals;
  IF v_vitals_count <> 1 THEN
    RAISE EXCEPTION 'Case 5 failed: rpc_insert_patient_vitals replay created duplicates';
  END IF;

  -- rpc_upsert_provider_note (ON CONFLICT visit_id)
  PERFORM rpc_upsert_provider_note(v_note, v_visit, 'Draft note', 'draft', v_new_patient, 'visit');
  PERFORM rpc_upsert_provider_note(v_note, v_visit, 'Draft note', 'draft', v_new_patient, 'visit');
  SELECT COUNT(*) INTO v_note_count FROM provider_notes WHERE visit_id = v_visit;
  IF v_note_count <> 1 THEN
    RAISE EXCEPTION 'Case 5 failed: rpc_upsert_provider_note replay created duplicates';
  END IF;

  -- rpc_admit_patient_v2 (sync_op gate)
  PERFORM rpc_admit_patient_v2(v_new_patient, 'general', NULL, 'Fever', NULL, NULL, NULL,
    NULL, NULL, NULL, NULL, NULL, v_admit_op);
  PERFORM rpc_admit_patient_v2(v_new_patient, 'general', NULL, 'Fever', NULL, NULL, NULL,
    NULL, NULL, NULL, NULL, NULL, v_admit_op);
  SELECT COUNT(*) INTO v_admission_count
  FROM admissions WHERE patient_id = v_new_patient AND status = 'active';
  IF v_admission_count <> 1 THEN
    RAISE EXCEPTION 'Case 5 failed: rpc_admit_patient_v2 replay created duplicates';
  END IF;
END $$;

DROP FUNCTION IF EXISTS _wp_e_set_jwt(TEXT);

ROLLBACK;
