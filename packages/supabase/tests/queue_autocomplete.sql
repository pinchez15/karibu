-- Regression tests for T1 (docs/workplans/2026-07-09-tester-feedback/small-tickets.md)
-- and migrations/102_queue_autocomplete.sql — queue status auto-completes
-- when documentation + lab + pharmacy are all done-or-absent.
--
-- House style: BEGIN; seed minimal clinic/staff/patient/visit rows; DO-block
-- assertions (RAISE EXCEPTION on failure, matching
-- packages/supabase/tests/rpc_idempotency.sql); ROLLBACK — no committed rows.
--
-- Run as a direct psql session (not through PostgREST), so
-- karibu_is_service_role() (migrations/063_security_hardening.sql:55-70)
-- returns TRUE and the RPCs' staff/role gates take the trusted service-role
-- path — no auth.jwt() claims need to be faked here.
--
--   psql "$DATABASE_URL" -f packages/supabase/tests/queue_autocomplete.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- Fixtures: one clinic, one staff row, one patient. Fixed UUIDs for readability.
-- ---------------------------------------------------------------------------

INSERT INTO clinics (id, name, slug)
VALUES ('10000000-0000-0000-0000-000000000001', 'Test Queue Autocomplete Clinic', 'test-queue-autocomplete');

INSERT INTO staff (id, clerk_user_id, clinic_id, email, display_name, role, is_active)
VALUES (
  '10000000-0000-0000-0000-000000000002',
  'test-clerk-queue-autocomplete-doctor',
  '10000000-0000-0000-0000-000000000001',
  'doctor@test-queue-autocomplete.example',
  'Test Doctor',
  'doctor',
  TRUE
);

INSERT INTO patients (id, clinic_id, display_name, first_name, last_name, sex, date_of_birth)
VALUES (
  '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000001',
  'Test Patient',
  'Test',
  'Patient',
  'F',
  '1990-01-01'
);

-- ---------------------------------------------------------------------------
-- Case 1 — doc-complete + no lab + no pharmacy -> completed
-- ---------------------------------------------------------------------------
-- queue_status seeded as 'waiting' (not with_doctor/ready_for_doctor) so the
-- pre-existing with_doctor/ready_for_doctor CASE flip inside
-- rpc_mark_documentation_complete cannot mask the new maybe_complete_visit_queue
-- behavior — this is also the exact tester-reported shape ("still shows
-- Waiting").

INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, status, queue_status,
  documentation_complete, lab_status, dispensing_status
) VALUES (
  '10000000-0000-0000-0000-000000000010',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000002',
  'pending', 'waiting',
  FALSE, 'not_ordered', 'not_started'
);

SELECT rpc_mark_documentation_complete('10000000-0000-0000-0000-000000000010');

DO $$
DECLARE
  v_queue_status TEXT;
  v_doc_complete BOOLEAN;
BEGIN
  SELECT queue_status, documentation_complete INTO v_queue_status, v_doc_complete
  FROM visits WHERE id = '10000000-0000-0000-0000-000000000010';

  IF v_doc_complete IS NOT TRUE THEN
    RAISE EXCEPTION 'Case 1: documentation_complete should be TRUE, got %', v_doc_complete;
  END IF;
  IF v_queue_status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'Case 1: expected queue_status=completed (no lab/pharmacy to wait on), got %', v_queue_status;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Case 2 — doc-complete + lab pending -> still waiting; last result -> completed
-- ---------------------------------------------------------------------------

INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, status, queue_status,
  documentation_complete, tests_ordered, lab_status, dispensing_status
) VALUES (
  '10000000-0000-0000-0000-000000000011',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000002',
  'pending', 'waiting',
  FALSE, 'Malaria RDT', 'pending', 'not_started'
);

-- Step 1: sign the note. Lab is still pending -> queue must stay open.
SELECT rpc_mark_documentation_complete('10000000-0000-0000-0000-000000000011');

DO $$
DECLARE
  v_queue_status TEXT;
BEGIN
  SELECT queue_status INTO v_queue_status
  FROM visits WHERE id = '10000000-0000-0000-0000-000000000011';

  IF v_queue_status = 'completed' THEN
    RAISE EXCEPTION 'Case 2 step 1: queue should NOT complete while lab_status=pending, got %', v_queue_status;
  END IF;
END $$;

-- Step 2: the (only, last) lab result lands -> queue completes.
SELECT rpc_record_lab_result('10000000-0000-0000-0000-000000000011', 'Negative', FALSE);

DO $$
DECLARE
  v_queue_status TEXT;
  v_lab_status TEXT;
BEGIN
  SELECT queue_status, lab_status INTO v_queue_status, v_lab_status
  FROM visits WHERE id = '10000000-0000-0000-0000-000000000011';

  IF v_lab_status <> 'done' THEN
    RAISE EXCEPTION 'Case 2 step 2: expected lab_status=done, got %', v_lab_status;
  END IF;
  IF v_queue_status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'Case 2 step 2: expected queue_status=completed once the last lab result lands, got %', v_queue_status;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Case 3 — pharmacy last -> completed
-- ---------------------------------------------------------------------------
-- A pharmacy order HAS been submitted (pharmacy_order_submitted_at set), so
-- dispensing_status='not_started' does NOT count as done-or-absent here —
-- distinguishing "no order" from "order submitted, not yet dispensed".

INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, status, queue_status,
  documentation_complete, lab_status, medications,
  dispensing_status, pharmacy_order_submitted_at
) VALUES (
  '10000000-0000-0000-0000-000000000012',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000002',
  'pending', 'waiting',
  FALSE, 'not_ordered', 'Paracetamol 500mg',
  'not_started', NOW()
);

-- Step 1: sign the note. Pharmacy order still open -> queue must stay open.
SELECT rpc_mark_documentation_complete('10000000-0000-0000-0000-000000000012');

DO $$
DECLARE
  v_queue_status TEXT;
BEGIN
  SELECT queue_status INTO v_queue_status
  FROM visits WHERE id = '10000000-0000-0000-0000-000000000012';

  IF v_queue_status = 'completed' THEN
    RAISE EXCEPTION 'Case 3 step 1: queue should NOT complete while a pharmacy order is still open, got %', v_queue_status;
  END IF;
END $$;

-- Step 2: pharmacy dispenses (the last thing done) -> queue completes.
SELECT rpc_set_dispensing_status('10000000-0000-0000-0000-000000000012', 'dispensed');

DO $$
DECLARE
  v_queue_status TEXT;
  v_dispensing_status TEXT;
BEGIN
  SELECT queue_status, dispensing_status INTO v_queue_status, v_dispensing_status
  FROM visits WHERE id = '10000000-0000-0000-0000-000000000012';

  IF v_dispensing_status <> 'dispensed' THEN
    RAISE EXCEPTION 'Case 3 step 2: expected dispensing_status=dispensed, got %', v_dispensing_status;
  END IF;
  IF v_queue_status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'Case 3 step 2: expected queue_status=completed once pharmacy dispenses last, got %', v_queue_status;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Case 4 — manual rpc_check_out_visit still works (escape hatch) and is
-- idempotent against an already (auto-)completed visit.
-- ---------------------------------------------------------------------------

-- 4a: lab is still pending (clinical work NOT done) — manual checkout is an
-- explicit early-exit escape hatch and must succeed regardless.
INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, status, queue_status,
  documentation_complete, tests_ordered, lab_status, dispensing_status
) VALUES (
  '10000000-0000-0000-0000-000000000013',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000002',
  'pending', 'waiting',
  FALSE, 'Malaria RDT', 'pending', 'not_started'
);

SELECT rpc_check_out_visit('10000000-0000-0000-0000-000000000013');

DO $$
DECLARE
  v_queue_status TEXT;
BEGIN
  SELECT queue_status INTO v_queue_status
  FROM visits WHERE id = '10000000-0000-0000-0000-000000000013';

  IF v_queue_status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'Case 4a: manual checkout should complete the queue regardless of lab state, got %', v_queue_status;
  END IF;
END $$;

-- Calling it again must not error (idempotent).
SELECT rpc_check_out_visit('10000000-0000-0000-0000-000000000013');

DO $$
DECLARE
  v_queue_status TEXT;
BEGIN
  SELECT queue_status INTO v_queue_status
  FROM visits WHERE id = '10000000-0000-0000-0000-000000000013';

  IF v_queue_status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'Case 4a: repeat manual checkout should stay completed, got %', v_queue_status;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Case 5 — already-completed visit is not re-touched (updated_at unchanged).
-- ---------------------------------------------------------------------------

INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, status, queue_status,
  documentation_complete, lab_status, dispensing_status,
  created_at, updated_at
) VALUES (
  '10000000-0000-0000-0000-000000000015',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000002',
  'completed', 'completed',
  TRUE, 'done', 'dispensed',
  '2020-01-01T00:00:00Z', '2020-01-01T00:00:00Z'
);

SELECT maybe_complete_visit_queue('10000000-0000-0000-0000-000000000015');

DO $$
DECLARE
  v_queue_status TEXT;
  v_updated_at TIMESTAMPTZ;
BEGIN
  SELECT queue_status, updated_at INTO v_queue_status, v_updated_at
  FROM visits WHERE id = '10000000-0000-0000-0000-000000000015';

  IF v_queue_status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'Case 5: queue_status should remain completed, got %', v_queue_status;
  END IF;
  IF v_updated_at IS DISTINCT FROM '2020-01-01T00:00:00Z'::timestamptz THEN
    RAISE EXCEPTION 'Case 5: updated_at must be untouched on an already-completed visit, got %', v_updated_at;
  END IF;
END $$;

ROLLBACK;
