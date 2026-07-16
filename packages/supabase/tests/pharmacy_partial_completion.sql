-- Regression tests for PHARM-5 (docs/workplans/2026-07-16-pharmacy-rework/spec.md)
-- and migrations/106_pharmacy_partial_completion.sql — rpc_complete_pharmacy_dispense
-- DERIVES line completion from cumulative prescribed_equivalent vs prescribed,
-- instead of trusting the operator's Outcome dropdown.
--
-- House style mirrors packages/supabase/tests/queue_autocomplete.sql: BEGIN;
-- seed minimal clinic/staff/patient/visit rows; DO-block assertions
-- (RAISE EXCEPTION on failure); ROLLBACK — no committed rows.
--
-- Run as a direct psql session (not through PostgREST), so
-- karibu_is_service_role() returns TRUE and the RPC takes the trusted
-- service-role path. p_dispensed_by must be a real dispenser staff id.
--
--   psql "$DATABASE_URL" -f packages/supabase/tests/pharmacy_partial_completion.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- Fixtures: one clinic, one dispenser, one patient. Fixed UUIDs.
-- ---------------------------------------------------------------------------

INSERT INTO clinics (id, name, slug)
VALUES ('20000000-0000-0000-0000-000000000001', 'Test Partial Completion Clinic', 'test-partial-completion');

INSERT INTO staff (id, clerk_user_id, clinic_id, email, display_name, role, is_active)
VALUES (
  '20000000-0000-0000-0000-000000000002',
  'test-clerk-partial-completion-dispenser',
  '20000000-0000-0000-0000-000000000001',
  'dispenser@test-partial-completion.example',
  'Test Dispenser',
  'dispenser',
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

-- Helper visit factory is inline (plain INSERTs) to keep the test dependency-free.

-- ===========================================================================
-- Case 1 — full remaining qty recorded as "Part" → line becomes `dispensed`.
--   Bug #1/#2 fix: 0 already + 2 now = 2 prescribed, dropdown says "Part", but
--   the math promotes the line to dispensed and the visit terminalizes.
-- ===========================================================================

INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, status, queue_status,
  documentation_complete, lab_status, medications,
  dispensing_status, pharmacy_order_submitted_at
) VALUES (
  '20000000-0000-0000-0000-000000000010',
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000002',
  'pending', 'waiting',
  TRUE, 'not_ordered', 'Amoxicillin 500mg',
  'not_started', NOW()
);

INSERT INTO prescription_orders (
  id, visit_id, clinic_id, patient_id, free_text_name,
  quantity_prescribed, quantity_unit, status, source
) VALUES (
  '20000000-0000-0000-0000-0000000000a1',
  '20000000-0000-0000-0000-000000000010',
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000003',
  'Amoxicillin 500mg', 2, 'caps', 'ordered', 'manual'
);

SELECT rpc_complete_pharmacy_dispense(
  '20000000-0000-0000-0000-000000000010',
  jsonb_build_array(jsonb_build_object(
    'prescription_order_id', '20000000-0000-0000-0000-0000000000a1',
    'line_status', 'partially_dispensed',
    'quantity_dispensed', 2,
    'quantity_unit', 'caps'
  )),
  NULL, NULL, '20000000-0000-0000-0000-000000000002'
);

DO $$
DECLARE
  v_line_status TEXT;
  v_visit_status TEXT;
  v_equiv NUMERIC;
BEGIN
  SELECT status INTO v_line_status FROM prescription_orders
  WHERE id = '20000000-0000-0000-0000-0000000000a1';
  SELECT dispensing_status INTO v_visit_status FROM visits
  WHERE id = '20000000-0000-0000-0000-000000000010';
  SELECT prescribed_equivalent INTO v_equiv FROM dispense_records
  WHERE prescription_order_id = '20000000-0000-0000-0000-0000000000a1';

  IF v_line_status IS DISTINCT FROM 'dispensed' THEN
    RAISE EXCEPTION 'Case 1: full qty as "Part" must derive dispensed, got %', v_line_status;
  END IF;
  IF v_visit_status IS DISTINCT FROM 'dispensed' THEN
    RAISE EXCEPTION 'Case 1: visit must roll up to dispensed, got %', v_visit_status;
  END IF;
  IF v_equiv IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'Case 1: prescribed_equivalent must default to quantity_dispensed (2), got %', v_equiv;
  END IF;
END $$;

-- ===========================================================================
-- Case 2 — dispense 1 of 2 → partially_dispensed (remaining = 1); then dispense
--   the remaining 1 → dispensed.
-- ===========================================================================

INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, status, queue_status,
  documentation_complete, lab_status, medications,
  dispensing_status, pharmacy_order_submitted_at
) VALUES (
  '20000000-0000-0000-0000-000000000011',
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000002',
  'pending', 'waiting',
  TRUE, 'not_ordered', 'Amlodipine 5mg',
  'not_started', NOW()
);

INSERT INTO prescription_orders (
  id, visit_id, clinic_id, patient_id, free_text_name,
  quantity_prescribed, quantity_unit, status, source
) VALUES (
  '20000000-0000-0000-0000-0000000000b1',
  '20000000-0000-0000-0000-000000000011',
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000003',
  'Amlodipine 5mg', 2, 'tabs', 'ordered', 'manual'
);

-- Step 1: dispense 1 (operator picks "OK"/dispensed but only 1 of 2 supplied).
SELECT rpc_complete_pharmacy_dispense(
  '20000000-0000-0000-0000-000000000011',
  jsonb_build_array(jsonb_build_object(
    'prescription_order_id', '20000000-0000-0000-0000-0000000000b1',
    'line_status', 'dispensed',
    'quantity_dispensed', 1,
    'quantity_unit', 'tabs'
  )),
  NULL, NULL, '20000000-0000-0000-0000-000000000002'
);

DO $$
DECLARE
  v_line_status TEXT;
  v_visit_status TEXT;
  v_remaining NUMERIC;
BEGIN
  SELECT status INTO v_line_status FROM prescription_orders
  WHERE id = '20000000-0000-0000-0000-0000000000b1';
  SELECT dispensing_status INTO v_visit_status FROM visits
  WHERE id = '20000000-0000-0000-0000-000000000011';
  SELECT 2 - COALESCE(SUM(prescribed_equivalent), 0) INTO v_remaining
  FROM dispense_records
  WHERE prescription_order_id = '20000000-0000-0000-0000-0000000000b1'
    AND line_status IN ('dispensed', 'partially_dispensed');

  IF v_line_status IS DISTINCT FROM 'partially_dispensed' THEN
    RAISE EXCEPTION 'Case 2 step 1: 1 of 2 must derive partially_dispensed, got %', v_line_status;
  END IF;
  IF v_visit_status IS DISTINCT FROM 'partial' THEN
    RAISE EXCEPTION 'Case 2 step 1: visit must roll up to partial, got %', v_visit_status;
  END IF;
  IF v_remaining IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Case 2 step 1: remaining must be 1, got %', v_remaining;
  END IF;
END $$;

-- Step 2: dispense the remaining 1 → dispensed.
SELECT rpc_complete_pharmacy_dispense(
  '20000000-0000-0000-0000-000000000011',
  jsonb_build_array(jsonb_build_object(
    'prescription_order_id', '20000000-0000-0000-0000-0000000000b1',
    'line_status', 'dispensed',
    'quantity_dispensed', 1,
    'quantity_unit', 'tabs'
  )),
  NULL, NULL, '20000000-0000-0000-0000-000000000002'
);

DO $$
DECLARE
  v_line_status TEXT;
  v_visit_status TEXT;
BEGIN
  SELECT status INTO v_line_status FROM prescription_orders
  WHERE id = '20000000-0000-0000-0000-0000000000b1';
  SELECT dispensing_status INTO v_visit_status FROM visits
  WHERE id = '20000000-0000-0000-0000-000000000011';

  IF v_line_status IS DISTINCT FROM 'dispensed' THEN
    RAISE EXCEPTION 'Case 2 step 2: remaining dispense must complete the line, got %', v_line_status;
  END IF;
  IF v_visit_status IS DISTINCT FROM 'dispensed' THEN
    RAISE EXCEPTION 'Case 2 step 2: visit must roll up to dispensed, got %', v_visit_status;
  END IF;
END $$;

-- ===========================================================================
-- Case 3 — genuine over-dispense is still rejected (guard on prescribed_equivalent).
-- ===========================================================================

INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, status, queue_status,
  documentation_complete, lab_status, medications,
  dispensing_status, pharmacy_order_submitted_at
) VALUES (
  '20000000-0000-0000-0000-000000000012',
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000002',
  'pending', 'waiting',
  TRUE, 'not_ordered', 'Metronidazole 400mg',
  'not_started', NOW()
);

INSERT INTO prescription_orders (
  id, visit_id, clinic_id, patient_id, free_text_name,
  quantity_prescribed, quantity_unit, status, source
) VALUES (
  '20000000-0000-0000-0000-0000000000c1',
  '20000000-0000-0000-0000-000000000012',
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000003',
  'Metronidazole 400mg', 2, 'tabs', 'ordered', 'manual'
);

DO $$
DECLARE
  v_raised BOOLEAN := FALSE;
BEGIN
  BEGIN
    PERFORM rpc_complete_pharmacy_dispense(
      '20000000-0000-0000-0000-000000000012',
      jsonb_build_array(jsonb_build_object(
        'prescription_order_id', '20000000-0000-0000-0000-0000000000c1',
        'line_status', 'dispensed',
        'quantity_dispensed', 3,
        'quantity_unit', 'tabs'
      )),
      NULL, NULL, '20000000-0000-0000-0000-000000000002'
    );
  EXCEPTION WHEN OTHERS THEN
    v_raised := TRUE;
  END;

  IF NOT v_raised THEN
    RAISE EXCEPTION 'Case 3: dispensing 3 of prescribed 2 must be rejected';
  END IF;
END $$;

-- ===========================================================================
-- Case 4 — NULL quantity_prescribed (legacy_text) falls back to the dropdown
--   status (R3). No arithmetic to derive from.
-- ===========================================================================

INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, status, queue_status,
  documentation_complete, lab_status, medications,
  dispensing_status, pharmacy_order_submitted_at
) VALUES (
  '20000000-0000-0000-0000-000000000013',
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000002',
  'pending', 'waiting',
  TRUE, 'not_ordered', 'ORS sachets as needed',
  'not_started', NOW()
);

INSERT INTO prescription_orders (
  id, visit_id, clinic_id, patient_id, free_text_name,
  quantity_prescribed, quantity_unit, status, source
) VALUES (
  '20000000-0000-0000-0000-0000000000d1',
  '20000000-0000-0000-0000-000000000013',
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000003',
  'ORS sachets', NULL, NULL, 'ordered', 'legacy_text'
);

SELECT rpc_complete_pharmacy_dispense(
  '20000000-0000-0000-0000-000000000013',
  jsonb_build_array(jsonb_build_object(
    'prescription_order_id', '20000000-0000-0000-0000-0000000000d1',
    'line_status', 'partially_dispensed',
    'quantity_dispensed', 3,
    'quantity_unit', 'sachets'
  )),
  NULL, NULL, '20000000-0000-0000-0000-000000000002'
);

DO $$
DECLARE
  v_line_status TEXT;
BEGIN
  SELECT status INTO v_line_status FROM prescription_orders
  WHERE id = '20000000-0000-0000-0000-0000000000d1';

  IF v_line_status IS DISTINCT FROM 'partially_dispensed' THEN
    RAISE EXCEPTION 'Case 4: NULL-quantity line must fall back to dropdown (partially_dispensed), got %', v_line_status;
  END IF;
END $$;

-- ===========================================================================
-- Case 5 — idempotent replay of the same client_op_id does NOT double-count.
-- ===========================================================================

INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, status, queue_status,
  documentation_complete, lab_status, medications,
  dispensing_status, pharmacy_order_submitted_at
) VALUES (
  '20000000-0000-0000-0000-000000000014',
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000002',
  'pending', 'waiting',
  TRUE, 'not_ordered', 'Ferrous sulphate 200mg',
  'not_started', NOW()
);

INSERT INTO prescription_orders (
  id, visit_id, clinic_id, patient_id, free_text_name,
  quantity_prescribed, quantity_unit, status, source
) VALUES (
  '20000000-0000-0000-0000-0000000000e1',
  '20000000-0000-0000-0000-000000000014',
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000003',
  'Ferrous sulphate 200mg', 4, 'tabs', 'ordered', 'manual'
);

-- First application: dispense 2 of 4 under op id ...f001.
SELECT rpc_complete_pharmacy_dispense(
  '20000000-0000-0000-0000-000000000014',
  jsonb_build_array(jsonb_build_object(
    'prescription_order_id', '20000000-0000-0000-0000-0000000000e1',
    'line_status', 'partially_dispensed',
    'quantity_dispensed', 2,
    'quantity_unit', 'tabs'
  )),
  NULL, '20000000-0000-0000-0000-00000000f001', '20000000-0000-0000-0000-000000000002'
);

-- Replay the SAME op id — must be a no-op (gate-first early return).
SELECT rpc_complete_pharmacy_dispense(
  '20000000-0000-0000-0000-000000000014',
  jsonb_build_array(jsonb_build_object(
    'prescription_order_id', '20000000-0000-0000-0000-0000000000e1',
    'line_status', 'partially_dispensed',
    'quantity_dispensed', 2,
    'quantity_unit', 'tabs'
  )),
  NULL, '20000000-0000-0000-0000-00000000f001', '20000000-0000-0000-0000-000000000002'
);

DO $$
DECLARE
  v_record_count INT;
  v_total NUMERIC;
  v_line_status TEXT;
BEGIN
  SELECT COUNT(*), COALESCE(SUM(prescribed_equivalent), 0)
    INTO v_record_count, v_total
  FROM dispense_records
  WHERE prescription_order_id = '20000000-0000-0000-0000-0000000000e1';
  SELECT status INTO v_line_status FROM prescription_orders
  WHERE id = '20000000-0000-0000-0000-0000000000e1';

  IF v_record_count <> 1 THEN
    RAISE EXCEPTION 'Case 5: replay must NOT insert a second dispense_record, got % records', v_record_count;
  END IF;
  IF v_total IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'Case 5: cumulative dispensed must stay 2 after replay, got %', v_total;
  END IF;
  IF v_line_status IS DISTINCT FROM 'partially_dispensed' THEN
    RAISE EXCEPTION 'Case 5: line must remain partially_dispensed after replay, got %', v_line_status;
  END IF;
END $$;

-- ===========================================================================
-- Case 6 — a prior partial followed by an out_of_stock outcome for the balance
--   keeps the line partially_dispensed (must NOT clobber to out_of_stock, since
--   some was genuinely dispensed).
-- ===========================================================================

INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, status, queue_status,
  documentation_complete, lab_status, medications,
  dispensing_status, pharmacy_order_submitted_at
) VALUES (
  '20000000-0000-0000-0000-000000000015',
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000002',
  'pending', 'waiting',
  TRUE, 'not_ordered', 'Cotrimoxazole 480mg',
  'not_started', NOW()
);

INSERT INTO prescription_orders (
  id, visit_id, clinic_id, patient_id, free_text_name,
  quantity_prescribed, quantity_unit, status, source
) VALUES (
  '20000000-0000-0000-0000-0000000000f1',
  '20000000-0000-0000-0000-000000000015',
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000003',
  'Cotrimoxazole 480mg', 2, 'tabs', 'ordered', 'manual'
);

-- Step 1: dispense 1 of 2.
SELECT rpc_complete_pharmacy_dispense(
  '20000000-0000-0000-0000-000000000015',
  jsonb_build_array(jsonb_build_object(
    'prescription_order_id', '20000000-0000-0000-0000-0000000000f1',
    'line_status', 'partially_dispensed',
    'quantity_dispensed', 1,
    'quantity_unit', 'tabs'
  )),
  NULL, NULL, '20000000-0000-0000-0000-000000000002'
);

-- Step 2: mark the remaining balance out of stock (0 dispensed now).
SELECT rpc_complete_pharmacy_dispense(
  '20000000-0000-0000-0000-000000000015',
  jsonb_build_array(jsonb_build_object(
    'prescription_order_id', '20000000-0000-0000-0000-0000000000f1',
    'line_status', 'out_of_stock'
  )),
  NULL, NULL, '20000000-0000-0000-0000-000000000002'
);

DO $$
DECLARE
  v_line_status TEXT;
BEGIN
  SELECT status INTO v_line_status FROM prescription_orders
  WHERE id = '20000000-0000-0000-0000-0000000000f1';

  IF v_line_status IS DISTINCT FROM 'partially_dispensed' THEN
    RAISE EXCEPTION 'Case 6: partial-then-OOS must stay partially_dispensed, got %', v_line_status;
  END IF;
END $$;

ROLLBACK;
