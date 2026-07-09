-- WP-B: check_in_patient client visit id + idempotency regression checks.
-- Run against a local Supabase DB after migrations:
--   psql "$DATABASE_URL" -f packages/supabase/tests/checkin_idempotency.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- Seed minimal clinic + patients (isolated UUIDs; rolled back after run).
-- ---------------------------------------------------------------------------
INSERT INTO clinics (id, name, slug, timezone)
VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01',
  'WP-B Test Clinic',
  'wp-b-test',
  'Africa/Kampala'
);

INSERT INTO patients (id, clinic_id, first_name, last_name)
VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', 'Test', 'One'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb02', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', 'Test', 'Two'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb03', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', 'Test', 'Three'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb04', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', 'Test', 'Four');

-- 1. Signature: new params exist; old 6-arg overload is gone.
DO $$
BEGIN
  IF to_regprocedure('check_in_patient(uuid,uuid,text,text,uuid,text,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'new check_in_patient signature missing — apply migration 100';
  END IF;
  IF to_regprocedure('check_in_patient(uuid,uuid,text,text,uuid,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'old check_in_patient signature still present';
  END IF;
END $$;

-- 2. Client id honored.
DO $$
DECLARE
  v_clinic UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01';
  v_patient UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01';
  v_fixed UUID := 'cccccccc-cccc-cccc-cccc-cccccccccc01';
  v_result UUID;
BEGIN
  v_result := check_in_patient(
    v_clinic, v_patient, 'headache', 'normal', NULL, 'opd', v_fixed, NULL
  );
  IF v_result IS DISTINCT FROM v_fixed THEN
    RAISE EXCEPTION 'expected visit id %, got %', v_fixed, v_result;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM visits WHERE id = v_fixed AND patient_id = v_patient) THEN
    RAISE EXCEPTION 'visit row with client id not found';
  END IF;
END $$;

-- 3. Replay is a no-op.
DO $$
DECLARE
  v_clinic UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01';
  v_patient UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb02';
  v_fixed UUID := 'cccccccc-cccc-cccc-cccc-cccccccccc02';
  v_op UUID := 'dddddddd-dddd-dddd-dddd-dddddddddd02';
  v_first UUID;
  v_second UUID;
  v_visit_count INT;
  v_op_count INT;
BEGIN
  v_first := check_in_patient(
    v_clinic, v_patient, 'fever', 'normal', NULL, 'opd', v_fixed, v_op
  );
  v_second := check_in_patient(
    v_clinic, v_patient, 'fever', 'normal', NULL, 'opd', v_fixed, v_op
  );
  IF v_first IS DISTINCT FROM v_second THEN
    RAISE EXCEPTION 'replay returned different ids: % vs %', v_first, v_second;
  END IF;
  SELECT COUNT(*) INTO v_visit_count
  FROM visits
  WHERE patient_id = v_patient
    AND visit_date = kampala_today();
  IF v_visit_count <> 1 THEN
    RAISE EXCEPTION 'expected 1 visit for patient today, got %', v_visit_count;
  END IF;
  SELECT COUNT(*) INTO v_op_count
  FROM sync_operations
  WHERE id = v_op;
  IF v_op_count <> 1 THEN
    RAISE EXCEPTION 'expected 1 sync_operations row, got %', v_op_count;
  END IF;
END $$;

-- 4. Conflict tolerance (landed-but-timed-out direct write).
DO $$
DECLARE
  v_clinic UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01';
  v_patient UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb03';
  v_fixed UUID := 'cccccccc-cccc-cccc-cccc-cccccccccc03';
  v_op UUID := 'dddddddd-dddd-dddd-dddd-dddddddddd03';
  v_result UUID;
  v_visit_count INT;
BEGIN
  INSERT INTO visits (
    id, clinic_id, patient_id, status, queue_status, queue_position,
    checked_in_at, priority, visit_date, department
  ) VALUES (
    v_fixed, v_clinic, v_patient, 'pending', 'waiting', 1,
    NOW(), 'normal', kampala_today(), 'opd'
  );
  v_result := check_in_patient(
    v_clinic, v_patient, 'cough', 'normal', NULL, 'opd', v_fixed, v_op
  );
  IF v_result IS DISTINCT FROM v_fixed THEN
    RAISE EXCEPTION 'conflict path returned % instead of %', v_result, v_fixed;
  END IF;
  SELECT COUNT(*) INTO v_visit_count FROM visits WHERE id = v_fixed;
  IF v_visit_count <> 1 THEN
    RAISE EXCEPTION 'conflict path created duplicate visit rows';
  END IF;
END $$;

-- 5. Back-compat: omit new params → server-generated id (old behavior).
DO $$
DECLARE
  v_clinic UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01';
  v_patient UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb04';
  v_result UUID;
BEGIN
  v_result := check_in_patient(v_clinic, v_patient, 'rash', 'normal', NULL, 'opd');
  IF v_result IS NULL THEN
    RAISE EXCEPTION 'back-compat call returned NULL';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM visits WHERE id = v_result AND patient_id = v_patient) THEN
    RAISE EXCEPTION 'back-compat visit row not found for id %', v_result;
  END IF;
END $$;

ROLLBACK;
