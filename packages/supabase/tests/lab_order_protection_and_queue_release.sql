-- Regression tests for migrations/108_lab_order_protection_and_queue_release.sql
-- — the LAB-1 ("patients disappear from the lab queue") and QUEUE-1
-- ("completed patients still remain in Waiting") field reports.
--
-- House style: BEGIN; seed minimal clinic/staff/patient/visit rows; DO-block
-- assertions (RAISE EXCEPTION on failure, matching
-- packages/supabase/tests/queue_autocomplete.sql); ROLLBACK — no committed rows.
--
-- Run as a direct psql session (not through PostgREST), so
-- karibu_is_service_role() (migrations/063_security_hardening.sql:55-70)
-- returns TRUE and the RPCs' staff/role gates take the trusted service-role
-- path — no auth.jwt() claims need to be faked here.
--
--   psql "$DATABASE_URL" -f packages/supabase/tests/lab_order_protection_and_queue_release.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- Fixtures: one clinic, one staff row, one patient. Fixed UUIDs for readability.
-- ---------------------------------------------------------------------------

INSERT INTO clinics (id, name, slug)
VALUES ('20000000-0000-0000-0000-000000000001', 'Test Lab Order Protection Clinic', 'test-lab-order-protection');

INSERT INTO staff (id, clerk_user_id, clinic_id, email, display_name, role, is_active)
VALUES (
  '20000000-0000-0000-0000-000000000002',
  'test-clerk-lab-order-protection-doctor',
  '20000000-0000-0000-0000-000000000001',
  'doctor@test-lab-order-protection.example',
  'Test Doctor',
  'doctor',
  TRUE
);

INSERT INTO patients (id, clinic_id, display_name, first_name, last_name, sex, date_of_birth)
VALUES (
  '20000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000001',
  'Test Patient',
  'Test',
  'Patient',
  'F',
  '1990-01-01'
);

-- ---------------------------------------------------------------------------
-- Case 0 — merge_tests_ordered unit checks
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF merge_tests_ordered(NULL, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Case 0: merge(NULL, NULL) should be NULL, got %', merge_tests_ordered(NULL, NULL);
  END IF;
  IF merge_tests_ordered('Malaria RDT', NULL) IS DISTINCT FROM 'Malaria RDT' THEN
    RAISE EXCEPTION 'Case 0: merge(existing, NULL) must preserve existing, got %',
      merge_tests_ordered('Malaria RDT', NULL);
  END IF;
  IF merge_tests_ordered('Malaria RDT', 'Urinalysis') IS DISTINCT FROM 'Malaria RDT, Urinalysis' THEN
    RAISE EXCEPTION 'Case 0: merge should append new tests, got %',
      merge_tests_ordered('Malaria RDT', 'Urinalysis');
  END IF;
  IF merge_tests_ordered('Malaria RDT', 'malaria rdt, HIV RDT') IS DISTINCT FROM 'Malaria RDT, HIV RDT' THEN
    RAISE EXCEPTION 'Case 0: merge should dedupe case-insensitively, got %',
      merge_tests_ordered('Malaria RDT', 'malaria rdt, HIV RDT');
  END IF;
  IF merge_tests_ordered(' A ,B', ' b, C ,, ') IS DISTINCT FROM 'A, B, C' THEN
    RAISE EXCEPTION 'Case 0: merge should trim/normalize, got %',
      merge_tests_ordered(' A ,B', ' b, C ,, ');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Case 1 — LAB-1: note autosave with an empty tests section must NOT erase a
-- submitted lab order (rpc_upsert_visit_clinical_summary)
-- ---------------------------------------------------------------------------
-- Sequence exactly as in the field report: order submitted -> patient walks
-- to the lab -> doctor keeps typing -> autosave fires with the stale (empty)
-- tests snapshot seeded at page load.

INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, status, queue_status,
  documentation_complete, lab_status, dispensing_status
) VALUES (
  '20000000-0000-0000-0000-000000000010',
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000002',
  'pending', 'waiting',
  FALSE, 'not_ordered', 'not_started'
);

SELECT rpc_submit_lab_order(
  '20000000-0000-0000-0000-000000000010',
  'Malaria RDT',
  'pending',
  NULL,
  NULL
);

-- Autosave: diagnosis typed, tests section empty (stale snapshot).
SELECT rpc_upsert_visit_clinical_summary(
  '20000000-0000-0000-0000-000000000010',
  'Malaria suspected',
  NULL,
  NULL,
  NULL,  -- p_tests_ordered: the clobber input
  NULL
);

DO $$
DECLARE
  v_tests TEXT;
  v_lab_status TEXT;
BEGIN
  SELECT tests_ordered, lab_status INTO v_tests, v_lab_status
  FROM visits WHERE id = '20000000-0000-0000-0000-000000000010';

  IF v_tests IS DISTINCT FROM 'Malaria RDT' THEN
    RAISE EXCEPTION 'Case 1: autosave with empty tests section erased the lab order (tests_ordered=%)', v_tests;
  END IF;
  IF v_lab_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Case 1: lab_status must stay pending after autosave, got %', v_lab_status;
  END IF;
END $$;

-- The note can still ADD a test; the union lands on the visit.
SELECT rpc_upsert_visit_clinical_summary(
  '20000000-0000-0000-0000-000000000010',
  'Malaria suspected',
  NULL,
  NULL,
  'Urinalysis',
  NULL
);

DO $$
DECLARE
  v_tests TEXT;
BEGIN
  SELECT tests_ordered INTO v_tests
  FROM visits WHERE id = '20000000-0000-0000-0000-000000000010';

  IF v_tests IS DISTINCT FROM 'Malaria RDT, Urinalysis' THEN
    RAISE EXCEPTION 'Case 1: note-added test should union with the order, got %', v_tests;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Case 2 — LAB-1 at sign time: finalize with an empty tests section keeps the
-- order AND does not auto-complete the queue while lab work is open
-- ---------------------------------------------------------------------------

INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, status, queue_status,
  documentation_complete, lab_status, dispensing_status
) VALUES (
  '20000000-0000-0000-0000-000000000011',
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000002',
  'pending', 'waiting',
  FALSE, 'not_ordered', 'not_started'
);

SELECT rpc_submit_lab_order(
  '20000000-0000-0000-0000-000000000011',
  'Malaria RDT',
  'pending',
  NULL,
  NULL
);

SELECT rpc_finalize_clinical_encounter(
  '20000000-0000-0000-0000-000000000021'::uuid,  -- note id
  '20000000-0000-0000-0000-000000000011'::uuid,  -- visit id
  '20000000-0000-0000-0000-000000000003'::uuid,  -- patient id
  'Fever three days, suspect malaria.',
  'You were seen for fever. Await your lab result.',
  'Suspected malaria',
  NULL,
  NULL,
  NULL,  -- p_tests_ordered empty: the pre-108 body reset lab_status to not_ordered here
  NULL,
  NULL
);

DO $$
DECLARE
  v_tests TEXT;
  v_lab_status TEXT;
  v_queue_status TEXT;
  v_doc BOOLEAN;
BEGIN
  SELECT tests_ordered, lab_status, queue_status, documentation_complete
    INTO v_tests, v_lab_status, v_queue_status, v_doc
  FROM visits WHERE id = '20000000-0000-0000-0000-000000000011';

  IF v_doc IS NOT TRUE THEN
    RAISE EXCEPTION 'Case 2: finalize should set documentation_complete';
  END IF;
  IF v_tests IS DISTINCT FROM 'Malaria RDT' THEN
    RAISE EXCEPTION 'Case 2: finalize erased the lab order (tests_ordered=%)', v_tests;
  END IF;
  IF v_lab_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Case 2: lab_status must stay pending through finalize, got %', v_lab_status;
  END IF;
  -- Pre-108, the clobber made maybe_complete_visit_queue treat lab as absent
  -- and complete the queue with the patient still waiting at the bench.
  IF v_queue_status = 'completed' THEN
    RAISE EXCEPTION 'Case 2: queue must NOT complete while a lab order is open';
  END IF;
END $$;

-- The bench can still record the result (pre-108 this raised
-- 'Test not found on visit' after the clobber), and recording the last
-- result releases the queue.
SELECT rpc_record_lab_test_result(
  '20000000-0000-0000-0000-000000000011',
  'Malaria RDT',
  'Negative',
  FALSE,
  NULL,
  '20000000-0000-0000-0000-000000000002'
);

DO $$
DECLARE
  v_lab_status TEXT;
  v_queue_status TEXT;
BEGIN
  SELECT lab_status, queue_status INTO v_lab_status, v_queue_status
  FROM visits WHERE id = '20000000-0000-0000-0000-000000000011';

  IF v_lab_status IS DISTINCT FROM 'done' THEN
    RAISE EXCEPTION 'Case 2: expected lab_status=done after result, got %', v_lab_status;
  END IF;
  IF v_queue_status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'Case 2: queue should complete once the last lab result lands, got %', v_queue_status;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Case 3 — rpc_submit_lab_order merge semantics
-- ---------------------------------------------------------------------------
-- A stale replay (old tests list, e.g. an offline tablet) must not drop tests
-- added meanwhile from another surface, and a stale lab_test_results array
-- must not overwrite bench-recorded rows.

INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, status, queue_status,
  documentation_complete, lab_status, dispensing_status
) VALUES (
  '20000000-0000-0000-0000-000000000012',
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000002',
  'pending', 'waiting',
  FALSE, 'not_ordered', 'not_started'
);

SELECT rpc_submit_lab_order(
  '20000000-0000-0000-0000-000000000012', 'Malaria RDT', 'pending', NULL, NULL
);

-- Bench records the first test.
SELECT rpc_record_lab_test_result(
  '20000000-0000-0000-0000-000000000012',
  'Malaria RDT',
  'Positive',
  TRUE,
  NULL,
  '20000000-0000-0000-0000-000000000002'
);

-- Stale-device order for a NEW test, carrying an outdated pending row for
-- Malaria RDT.
SELECT rpc_submit_lab_order(
  '20000000-0000-0000-0000-000000000012',
  'Urinalysis',
  'pending',
  '[{"test":"Malaria RDT","status":"pending","result":null,"abnormal":false},
    {"test":"Urinalysis","status":"pending","result":null,"abnormal":false}]'::jsonb,
  NULL
);

DO $$
DECLARE
  v_tests TEXT;
  v_lab_status TEXT;
  v_mrdt_status TEXT;
  v_mrdt_result TEXT;
BEGIN
  SELECT tests_ordered, lab_status INTO v_tests, v_lab_status
  FROM visits WHERE id = '20000000-0000-0000-0000-000000000012';

  IF v_tests IS DISTINCT FROM 'Malaria RDT, Urinalysis' THEN
    RAISE EXCEPTION 'Case 3: expected merged test list, got %', v_tests;
  END IF;
  IF v_lab_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Case 3: expected lab_status=pending with a new open test, got %', v_lab_status;
  END IF;

  SELECT e->>'status', e->>'result' INTO v_mrdt_status, v_mrdt_result
  FROM visits, jsonb_array_elements(lab_test_results) AS e
  WHERE id = '20000000-0000-0000-0000-000000000012'
    AND e->>'test' = 'Malaria RDT';

  IF v_mrdt_status NOT IN ('abnormal', 'done') OR v_mrdt_result IS DISTINCT FROM 'Positive' THEN
    RAISE EXCEPTION 'Case 3: stale client array overwrote the recorded result (status=%, result=%)',
      v_mrdt_status, v_mrdt_result;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Case 4 — QUEUE-1: raw web-sign UPDATE (no RPC) must release the queue
-- ---------------------------------------------------------------------------
-- Emulates signClinicianNote's service-role table update
-- (apps/web/src/app/dashboard/visits/[id]/note-actions.ts:311-331), which
-- bypassed every maybe_complete_visit_queue call site pre-108. The new
-- visits_queue_autocomplete trigger must complete the queue.

INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, status, queue_status,
  documentation_complete, lab_status, dispensing_status
) VALUES (
  '20000000-0000-0000-0000-000000000013',
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000002',
  'pending', 'waiting',
  FALSE, 'not_ordered', 'not_started'
);

UPDATE visits
SET documentation_complete = TRUE,
    documentation_completed_at = NOW(),
    status = 'sent',
    updated_at = NOW()
WHERE id = '20000000-0000-0000-0000-000000000013';

DO $$
DECLARE
  v_queue_status TEXT;
BEGIN
  SELECT queue_status INTO v_queue_status
  FROM visits WHERE id = '20000000-0000-0000-0000-000000000013';

  IF v_queue_status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'Case 4: raw sign UPDATE should auto-complete the queue via trigger, got %', v_queue_status;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Case 5 — QUEUE-1 guardrails: raw sign does NOT complete while lab or an
-- open pharmacy order is outstanding; the last closure releases it
-- ---------------------------------------------------------------------------

INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, status, queue_status,
  documentation_complete, tests_ordered, lab_status,
  dispensing_status, pharmacy_order_submitted_at
) VALUES (
  '20000000-0000-0000-0000-000000000014',
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000002',
  'pending', 'waiting',
  FALSE, 'Malaria RDT', 'pending',
  'not_started', NOW()
);

-- Raw web sign: lab pending + pharmacy order open -> stays in the queue.
UPDATE visits
SET documentation_complete = TRUE,
    updated_at = NOW()
WHERE id = '20000000-0000-0000-0000-000000000014';

DO $$
DECLARE
  v_queue_status TEXT;
BEGIN
  SELECT queue_status INTO v_queue_status
  FROM visits WHERE id = '20000000-0000-0000-0000-000000000014';

  IF v_queue_status = 'completed' THEN
    RAISE EXCEPTION 'Case 5: queue must NOT complete while lab + pharmacy are open';
  END IF;
END $$;

-- Lab closes; pharmacy still open -> stays.
SELECT rpc_record_lab_test_result(
  '20000000-0000-0000-0000-000000000014',
  'Malaria RDT',
  'Negative',
  FALSE,
  NULL,
  '20000000-0000-0000-0000-000000000002'
);

DO $$
DECLARE
  v_queue_status TEXT;
BEGIN
  SELECT queue_status INTO v_queue_status
  FROM visits WHERE id = '20000000-0000-0000-0000-000000000014';

  IF v_queue_status = 'completed' THEN
    RAISE EXCEPTION 'Case 5: queue must NOT complete while the pharmacy order is open';
  END IF;
END $$;

-- Pharmacy dispenses (raw update — the trigger, not a call site, releases).
UPDATE visits
SET dispensing_status = 'dispensed',
    dispensed_at = NOW(),
    updated_at = NOW()
WHERE id = '20000000-0000-0000-0000-000000000014';

DO $$
DECLARE
  v_queue_status TEXT;
BEGIN
  SELECT queue_status INTO v_queue_status
  FROM visits WHERE id = '20000000-0000-0000-0000-000000000014';

  IF v_queue_status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'Case 5: queue should complete once the last order closes, got %', v_queue_status;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Case 6 — trigger never resurrects a cancelled visit
-- ---------------------------------------------------------------------------

INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, status, queue_status,
  documentation_complete, lab_status, dispensing_status
) VALUES (
  '20000000-0000-0000-0000-000000000015',
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000002',
  'pending', 'cancelled',
  FALSE, 'not_ordered', 'not_started'
);

UPDATE visits
SET documentation_complete = TRUE,
    updated_at = NOW()
WHERE id = '20000000-0000-0000-0000-000000000015';

DO $$
DECLARE
  v_queue_status TEXT;
BEGIN
  SELECT queue_status INTO v_queue_status
  FROM visits WHERE id = '20000000-0000-0000-0000-000000000015';

  IF v_queue_status IS DISTINCT FROM 'cancelled' THEN
    RAISE EXCEPTION 'Case 6: cancelled visit must stay cancelled, got %', v_queue_status;
  END IF;
END $$;

ROLLBACK;

-- If we got here, every assertion passed.
SELECT 'lab_order_protection_and_queue_release: ALL CASES PASSED' AS result;
