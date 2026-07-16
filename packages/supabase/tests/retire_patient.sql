-- retire_patient regression checks (migration 111).
-- Run against a local Supabase DB after migrations:
--   psql "$DATABASE_URL" -f packages/supabase/tests/retire_patient.sql
--
-- Direct DB sessions count as service_role (karibu_is_service_role() returns
-- TRUE when request.jwt.claims is unset), so every call passes the acting
-- staff id via p_retired_by — the admin-only re-verification inside the RPC
-- is what's under test.

BEGIN;

-- ---------------------------------------------------------------------------
-- Seed clinic + staff (admin, nurse) + patients (rolled back after run).
-- ---------------------------------------------------------------------------
INSERT INTO clinics (id, name, slug, timezone)
VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaab01',
  'Retire Test Clinic',
  'retire-test',
  'Africa/Kampala'
);

INSERT INTO staff (id, clerk_user_id, clinic_id, email, display_name, role, is_active)
VALUES
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01', 'clerk_retire_admin', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaab01', 'retire-admin@test.local', 'Ada Admin', 'admin', TRUE),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeee02', 'clerk_retire_nurse', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaab01', 'retire-nurse@test.local', 'Nia Nurse', 'nurse', TRUE);

INSERT INTO patients (id, clinic_id, first_name, last_name)
VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbc01', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaab01', 'Dup', 'One'),       -- happy path
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbc02', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaab01', 'Survivor', 'One'),  -- merge target
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbc03', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaab01', 'Open', 'Visit'),    -- blocked by open visit
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbc04', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaab01', 'Replay', 'Me'),     -- idempotent replay
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbc05', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaab01', 'Dup', 'Match');     -- dedupe exclusion

-- 1. Happy path: retired fields set, historical visit rows untouched.
DO $$
DECLARE
  v_admin UUID := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01';
  v_dup UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbc01';
  v_survivor UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbc02';
  v_old_visit UUID := 'cccccccc-cccc-cccc-cccc-ccccccccdc01';
  v_row patients%ROWTYPE;
BEGIN
  -- A completed historical visit must survive the retire (HMIS counts).
  INSERT INTO visits (
    id, clinic_id, patient_id, status, queue_status, queue_position,
    checked_in_at, priority, visit_date, department
  ) VALUES (
    v_old_visit, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaab01', v_dup,
    'completed', 'completed', 1,
    NOW() - INTERVAL '30 days', 'normal', kampala_today() - 30, 'opd'
  );

  PERFORM retire_patient(v_dup, 'Duplicate of Survivor One', v_survivor, NULL, v_admin);

  SELECT * INTO v_row FROM patients WHERE id = v_dup;
  IF v_row.retired_at IS NULL THEN
    RAISE EXCEPTION 'retired_at not set';
  END IF;
  IF v_row.retired_by IS DISTINCT FROM v_admin THEN
    RAISE EXCEPTION 'retired_by mismatch: %', v_row.retired_by;
  END IF;
  IF v_row.retired_reason IS DISTINCT FROM 'Duplicate of Survivor One' THEN
    RAISE EXCEPTION 'retired_reason mismatch: %', v_row.retired_reason;
  END IF;
  IF v_row.merged_into_patient_id IS DISTINCT FROM v_survivor THEN
    RAISE EXCEPTION 'merged_into_patient_id mismatch';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM visits WHERE id = v_old_visit AND patient_id = v_dup) THEN
    RAISE EXCEPTION 'historical visit vanished — retire must be non-destructive';
  END IF;
END $$;

-- 2. Blocked by an open visit today.
DO $$
DECLARE
  v_admin UUID := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01';
  v_patient UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbc03';
  v_visit UUID;
BEGIN
  v_visit := check_in_patient(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaab01', v_patient,
    'fever', 'normal', NULL, 'opd', NULL, NULL
  );

  BEGIN
    PERFORM retire_patient(v_patient, 'Duplicate entry', NULL, NULL, v_admin);
    RAISE EXCEPTION 'expected open-visit refusal, but retire succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%open visit today%' THEN
      RAISE EXCEPTION 'unexpected error: %', SQLERRM;
    END IF;
  END;

  IF EXISTS (SELECT 1 FROM patients WHERE id = v_patient AND retired_at IS NOT NULL) THEN
    RAISE EXCEPTION 'patient was retired despite open visit';
  END IF;

  -- Once the visit closes, the retire goes through.
  UPDATE visits SET status = 'completed', queue_status = 'completed' WHERE id = v_visit;
  PERFORM retire_patient(v_patient, 'Duplicate entry', NULL, NULL, v_admin);
  IF NOT EXISTS (SELECT 1 FROM patients WHERE id = v_patient AND retired_at IS NOT NULL) THEN
    RAISE EXCEPTION 'retire after visit closure failed';
  END IF;
END $$;

-- 3. Idempotent replay: same client_op_id twice → one sync op, no error,
--    retire fields unchanged from the first application.
DO $$
DECLARE
  v_admin UUID := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01';
  v_patient UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbc04';
  v_op UUID := 'dddddddd-dddd-dddd-dddd-ddddddddde01';
  v_first TIMESTAMPTZ;
  v_second TIMESTAMPTZ;
  v_op_count INT;
BEGIN
  PERFORM retire_patient(v_patient, 'Duplicate entry', NULL, v_op, v_admin);
  SELECT retired_at INTO v_first FROM patients WHERE id = v_patient;

  PERFORM retire_patient(v_patient, 'Different reason on replay', NULL, v_op, v_admin);
  SELECT retired_at INTO v_second FROM patients WHERE id = v_patient;

  IF v_first IS DISTINCT FROM v_second THEN
    RAISE EXCEPTION 'replay changed retired_at';
  END IF;
  IF (SELECT retired_reason FROM patients WHERE id = v_patient)
       IS DISTINCT FROM 'Duplicate entry' THEN
    RAISE EXCEPTION 'replay overwrote retired_reason';
  END IF;
  SELECT COUNT(*) INTO v_op_count FROM sync_operations WHERE id = v_op;
  IF v_op_count <> 1 THEN
    RAISE EXCEPTION 'expected 1 sync_operations row, got %', v_op_count;
  END IF;
END $$;

-- 4. Guards: self-merge, retired merge target, missing reason, non-admin.
DO $$
DECLARE
  v_admin UUID := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01';
  v_nurse UUID := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee02';
  v_patient UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbc05';
  v_retired UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbc01';  -- retired in step 1
BEGIN
  BEGIN
    PERFORM retire_patient(v_patient, 'Dup', v_patient, NULL, v_admin);
    RAISE EXCEPTION 'expected self-merge refusal';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%into itself%' THEN RAISE EXCEPTION 'unexpected: %', SQLERRM; END IF;
  END;

  BEGIN
    PERFORM retire_patient(v_patient, 'Dup', v_retired, NULL, v_admin);
    RAISE EXCEPTION 'expected retired-merge-target refusal';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%itself retired%' THEN RAISE EXCEPTION 'unexpected: %', SQLERRM; END IF;
  END;

  BEGIN
    PERFORM retire_patient(v_patient, '   ', NULL, NULL, v_admin);
    RAISE EXCEPTION 'expected missing-reason refusal';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%reason is required%' THEN RAISE EXCEPTION 'unexpected: %', SQLERRM; END IF;
  END;

  BEGIN
    PERFORM retire_patient(v_patient, 'Dup', NULL, NULL, v_nurse);
    RAISE EXCEPTION 'expected admin-only refusal';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Only an admin%' THEN RAISE EXCEPTION 'unexpected: %', SQLERRM; END IF;
  END;

  IF EXISTS (SELECT 1 FROM patients WHERE id = v_patient AND retired_at IS NOT NULL) THEN
    RAISE EXCEPTION 'guard tests must not retire the patient';
  END IF;
END $$;

-- 5. Retired patients no longer surface as duplicate candidates, active ones do.
DO $$
DECLARE
  v_clinic UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaab01';
  v_admin UUID := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01';
  v_patient UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbc05';
  v_hits INT;
BEGIN
  SELECT COUNT(*) INTO v_hits
  FROM rpc_find_duplicate_candidates(v_clinic, 'Dup', 'Match');
  IF v_hits <> 1 THEN
    RAISE EXCEPTION 'expected 1 active duplicate candidate, got %', v_hits;
  END IF;

  PERFORM retire_patient(v_patient, 'Duplicate registration', NULL, NULL, v_admin);

  SELECT COUNT(*) INTO v_hits
  FROM rpc_find_duplicate_candidates(v_clinic, 'Dup', 'Match');
  IF v_hits <> 0 THEN
    RAISE EXCEPTION 'retired patient still surfaces as duplicate candidate';
  END IF;
END $$;

SELECT 'retire_patient tests passed' AS result;

ROLLBACK;
