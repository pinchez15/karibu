-- Regression tests for BILL-1 (payment totals wrong — clinic blocked on billing)
-- and migrations/109_billing_totals_integrity.sql.
--
-- Root causes encoded here (written FAILING against 094..107, fixed by 109):
--   A. rpc_record_lab_test_result lost its billing hooks when 094 re-created it
--      (077 added billing_charge_lab_test + billing_ensure_consultation_charge;
--      094/099/101/102 dropped them) → lab work never billed → charged too low
--      → paid > charged → Remaining/Credit wrong on every billing surface.
--   B. billing_charge_pharmacy_line (092) bills SUM(raw quantity_dispensed) ×
--      unit price of the ORIGINAL medication. Under PHARM-4/5 a substituted
--      record is priced at the wrong drug and mixed partial+remainder units are
--      summed as if homogeneous.
--   C. No DB uniqueness on charges → the EXISTS-then-INSERT guards in
--      billing_ensure_consultation_charge / billing_charge_pharmacy_line have
--      no backstop under concurrent dispense calls (PHARM-5 made multi-call
--      dispensing common).
-- Plus regression guards for what already works and must stay working:
--   consultation charged ONCE per visit across repeated dispense calls; a
--   partial + remainder converge to ONE charge for the full dispensed amount;
--   balance = Σcharges(not voided) − Σpayments(paid, cash+barter).
--
-- House style mirrors packages/supabase/tests/pharmacy_partial_completion.sql:
-- BEGIN; seed minimal rows with fixed UUIDs; DO-block assertions (RAISE
-- EXCEPTION on failure); ROLLBACK — no committed rows.
--
-- Run as a direct psql session (not through PostgREST), so
-- karibu_is_service_role() returns TRUE and RPCs take the trusted path:
--
--   psql "$DATABASE_URL" -f packages/supabase/tests/billing_totals.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- Fixtures: one clinic (fee 5000, pharmacy markup 0 so prices stay exact),
-- one dispenser, one lab tech, one patient. Fixed UUIDs (31…).
-- ---------------------------------------------------------------------------

INSERT INTO clinics (id, name, slug)
VALUES ('31000000-0000-0000-0000-000000000001', 'Test Billing Totals Clinic', 'test-billing-totals');

INSERT INTO clinic_billing_rates (clinic_id, consultation_fee_ugx, pharmacy_markup_percent)
VALUES ('31000000-0000-0000-0000-000000000001', 5000, 0)
ON CONFLICT (clinic_id) DO UPDATE
  SET consultation_fee_ugx = 5000, pharmacy_markup_percent = 0;

INSERT INTO staff (id, clerk_user_id, clinic_id, email, display_name, role, is_active)
VALUES
  ('31000000-0000-0000-0000-000000000002',
   'test-clerk-billing-totals-dispenser',
   '31000000-0000-0000-0000-000000000001',
   'dispenser@test-billing-totals.example',
   'Test Dispenser', 'dispenser', TRUE),
  ('31000000-0000-0000-0000-000000000004',
   'test-clerk-billing-totals-labtech',
   '31000000-0000-0000-0000-000000000001',
   'labtech@test-billing-totals.example',
   'Test Lab Tech', 'lab_tech', TRUE);

INSERT INTO patients (id, clinic_id, display_name, first_name, last_name, sex, date_of_birth)
VALUES (
  '31000000-0000-0000-0000-000000000003',
  '31000000-0000-0000-0000-000000000001',
  'Test Patient', 'Test', 'Patient', 'F', '1990-01-01'
);

-- Known unit prices: original 1000/tab, substitute 400/tab (markup 0 above).
INSERT INTO medication_catalog (code, generic_name, formulation, unit, category, default_price_ugx)
VALUES
  ('TST_BILL_ORIG', 'Testomycin 500', 'tablet', 'tab', 'Test', 1000),
  ('TST_BILL_SUB',  'Testomycin 250', 'tablet', 'tab', 'Test', 400)
ON CONFLICT (code) DO UPDATE SET default_price_ugx = EXCLUDED.default_price_ugx;

-- ===========================================================================
-- Case 1 — partial + remainder on the SAME line = exactly ONE pharmacy charge
--   for the FULL dispensed amount (never two charges, never per-call amounts),
--   and the consultation fee lands exactly ONCE per visit no matter how many
--   dispense calls the visit sees.
-- ===========================================================================

INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, status, queue_status,
  documentation_complete, lab_status, medications,
  dispensing_status, pharmacy_order_submitted_at
) VALUES (
  '31000000-0000-0000-0000-000000000010',
  '31000000-0000-0000-0000-000000000001',
  '31000000-0000-0000-0000-000000000003',
  '31000000-0000-0000-0000-000000000002',
  'pending', 'waiting',
  TRUE, 'not_ordered', 'Testomycin 500',
  'not_started', NOW()
);

INSERT INTO prescription_orders (
  id, visit_id, clinic_id, patient_id, medication_code,
  quantity_prescribed, quantity_unit, status, source
) VALUES (
  '31000000-0000-0000-0000-0000000000a1',
  '31000000-0000-0000-0000-000000000010',
  '31000000-0000-0000-0000-000000000001',
  '31000000-0000-0000-0000-000000000003',
  'TST_BILL_ORIG', 10, 'tabs', 'ordered', 'manual'
);

-- Dispense call 1: partial 6 of 10.
SELECT rpc_complete_pharmacy_dispense(
  '31000000-0000-0000-0000-000000000010',
  jsonb_build_array(jsonb_build_object(
    'prescription_order_id', '31000000-0000-0000-0000-0000000000a1',
    'line_status', 'partially_dispensed',
    'quantity_dispensed', 6,
    'quantity_unit', 'tabs'
  )),
  NULL, NULL, '31000000-0000-0000-0000-000000000002'
);

-- Dispense call 2 (later): the remainder, 4.
SELECT rpc_complete_pharmacy_dispense(
  '31000000-0000-0000-0000-000000000010',
  jsonb_build_array(jsonb_build_object(
    'prescription_order_id', '31000000-0000-0000-0000-0000000000a1',
    'line_status', 'partially_dispensed',
    'quantity_dispensed', 4,
    'quantity_unit', 'tabs'
  )),
  NULL, NULL, '31000000-0000-0000-0000-000000000002'
);

DO $$
DECLARE
  v_pharmacy_rows INT;
  v_pharmacy_total BIGINT;
  v_consult_rows INT;
  v_consult_total BIGINT;
BEGIN
  SELECT COUNT(*), COALESCE(SUM(amount_ugx), 0)
  INTO v_pharmacy_rows, v_pharmacy_total
  FROM charges
  WHERE visit_id = '31000000-0000-0000-0000-000000000010'
    AND category = 'pharmacy' AND NOT voided;

  SELECT COUNT(*), COALESCE(SUM(amount_ugx), 0)
  INTO v_consult_rows, v_consult_total
  FROM charges
  WHERE visit_id = '31000000-0000-0000-0000-000000000010'
    AND category = 'consultation' AND NOT voided;

  IF v_pharmacy_rows <> 1 THEN
    RAISE EXCEPTION 'Case 1: partial + remainder must yield ONE pharmacy charge, got % rows', v_pharmacy_rows;
  END IF;
  IF v_pharmacy_total <> 10000 THEN
    RAISE EXCEPTION 'Case 1: line must be billed once for the full 10 tabs (10 × 1000 = 10000), got %', v_pharmacy_total;
  END IF;
  IF v_consult_rows <> 1 THEN
    RAISE EXCEPTION 'Case 1: consultation fee must land exactly once per visit across 2 dispense calls, got % rows', v_consult_rows;
  END IF;
  IF v_consult_total <> 5000 THEN
    RAISE EXCEPTION 'Case 1: consultation must be the clinic fee 5000, got %', v_consult_total;
  END IF;
END $$;

-- ===========================================================================
-- Case 2 — substitution pricing (root cause B). Prescribed 14 of TST_BILL_ORIG
--   (1000/tab): partial 6 originals, then the remainder dispensed as 8 of the
--   substitute TST_BILL_SUB (400/tab). Correct bill = 6×1000 + 8×400 = 9200 —
--   NOT 14 × 1000 = 14000 (raw sum × original price).
-- ===========================================================================

INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, status, queue_status,
  documentation_complete, lab_status, medications,
  dispensing_status, pharmacy_order_submitted_at
) VALUES (
  '31000000-0000-0000-0000-000000000020',
  '31000000-0000-0000-0000-000000000001',
  '31000000-0000-0000-0000-000000000003',
  '31000000-0000-0000-0000-000000000002',
  'pending', 'waiting',
  TRUE, 'not_ordered', 'Testomycin 500',
  'not_started', NOW()
);

INSERT INTO prescription_orders (
  id, visit_id, clinic_id, patient_id, medication_code,
  quantity_prescribed, quantity_unit, status, source
) VALUES (
  '31000000-0000-0000-0000-0000000000b1',
  '31000000-0000-0000-0000-000000000020',
  '31000000-0000-0000-0000-000000000001',
  '31000000-0000-0000-0000-000000000003',
  'TST_BILL_ORIG', 14, 'tabs', 'ordered', 'manual'
);

SELECT rpc_complete_pharmacy_dispense(
  '31000000-0000-0000-0000-000000000020',
  jsonb_build_array(jsonb_build_object(
    'prescription_order_id', '31000000-0000-0000-0000-0000000000b1',
    'line_status', 'partially_dispensed',
    'quantity_dispensed', 6,
    'quantity_unit', 'tabs'
  )),
  NULL, NULL, '31000000-0000-0000-0000-000000000002'
);

SELECT rpc_complete_pharmacy_dispense(
  '31000000-0000-0000-0000-000000000020',
  jsonb_build_array(jsonb_build_object(
    'prescription_order_id', '31000000-0000-0000-0000-0000000000b1',
    'line_status', 'partially_dispensed',
    'quantity_dispensed', 8,
    'quantity_unit', 'tabs',
    'substitute_medication_code', 'TST_BILL_SUB',
    'prescribed_equivalent', 8
  )),
  NULL, NULL, '31000000-0000-0000-0000-000000000002'
);

DO $$
DECLARE
  v_rows INT;
  v_total BIGINT;
BEGIN
  SELECT COUNT(*), COALESCE(SUM(amount_ugx), 0)
  INTO v_rows, v_total
  FROM charges
  WHERE visit_id = '31000000-0000-0000-0000-000000000020'
    AND category = 'pharmacy' AND NOT voided;

  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'Case 2: substituted partial + remainder must stay ONE charge, got % rows', v_rows;
  END IF;
  IF v_total <> 9200 THEN
    RAISE EXCEPTION 'Case 2: substituted units must be billed at the substitute price (6×1000 + 8×400 = 9200), got %', v_total;
  END IF;
END $$;

-- ===========================================================================
-- Case 3 — lab result recording must raise the lab charge + the once-per-visit
--   consultation fee (root cause A: hooks dropped by 094). Re-recording the
--   same test must NOT duplicate either.
-- ===========================================================================

INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, status, queue_status,
  documentation_complete, lab_status, tests_ordered,
  dispensing_status
) VALUES (
  '31000000-0000-0000-0000-000000000030',
  '31000000-0000-0000-0000-000000000001',
  '31000000-0000-0000-0000-000000000003',
  '31000000-0000-0000-0000-000000000002',
  'pending', 'waiting',
  TRUE, 'pending', 'BilliTestX',
  'not_started'
);

SELECT rpc_record_lab_test_result(
  '31000000-0000-0000-0000-000000000030',
  'BilliTestX', 'Negative', FALSE, NULL,
  '31000000-0000-0000-0000-000000000004'
);

-- Re-record (corrected result) — must stay idempotent for billing.
SELECT rpc_record_lab_test_result(
  '31000000-0000-0000-0000-000000000030',
  'BilliTestX', 'Positive', FALSE, NULL,
  '31000000-0000-0000-0000-000000000004'
);

DO $$
DECLARE
  v_lab_rows INT;
  v_lab_total BIGINT;
  v_consult_rows INT;
BEGIN
  SELECT COUNT(*), COALESCE(SUM(amount_ugx), 0)
  INTO v_lab_rows, v_lab_total
  FROM charges
  WHERE visit_id = '31000000-0000-0000-0000-000000000030'
    AND category = 'lab' AND NOT voided;

  SELECT COUNT(*) INTO v_consult_rows
  FROM charges
  WHERE visit_id = '31000000-0000-0000-0000-000000000030'
    AND category = 'consultation' AND NOT voided;

  IF v_lab_rows <> 1 THEN
    RAISE EXCEPTION 'Case 3: recording a lab result must raise exactly ONE lab charge (BILL-1 root cause A: hooks dropped in 094), got % rows', v_lab_rows;
  END IF;
  -- 'BilliTestX' is not in lab_test_catalog / lab_stock_items → falls back to
  -- billing_lab_test_price default 2000.
  IF v_lab_total <> 2000 THEN
    RAISE EXCEPTION 'Case 3: lab charge must use billing_lab_test_price (2000 fallback), got %', v_lab_total;
  END IF;
  IF v_consult_rows <> 1 THEN
    RAISE EXCEPTION 'Case 3: lab result must ensure the consultation fee exactly once, got % rows', v_consult_rows;
  END IF;
END $$;

-- ===========================================================================
-- Case 4 — balance arithmetic. charged = Σ non-voided charges; paid = Σ 'paid'
--   payments (cash + barter); balance = charged − paid. Voided charges and
--   non-paid payments never count.
--   Running totals for this patient so far (Cases 1–3):
--     charges = 10000 + 5000 (visit 10) + 9200 + 5000 (visit 20)
--             + 2000 + 5000 (visit 30) = 36200
-- ===========================================================================

INSERT INTO payments (id, visit_id, clinic_id, patient_id, amount_ugx, payment_method, status, collected_by)
VALUES (
  '31000000-0000-0000-0000-0000000000c1',
  NULL,
  '31000000-0000-0000-0000-000000000001',
  '31000000-0000-0000-0000-000000000003',
  3000, 'cash', 'paid',
  '31000000-0000-0000-0000-000000000002'
);

INSERT INTO payments (id, visit_id, clinic_id, patient_id, amount_ugx, amount_barter_ugx, barter_description, payment_method, status, collected_by)
VALUES (
  '31000000-0000-0000-0000-0000000000c2',
  NULL,
  '31000000-0000-0000-0000-000000000001',
  '31000000-0000-0000-0000-000000000003',
  2000, 1000, '2 kg maize', 'mixed', 'paid',
  '31000000-0000-0000-0000-000000000002'
);

-- Never counted: a pending payment.
INSERT INTO payments (id, visit_id, clinic_id, patient_id, amount_ugx, payment_method, status, collected_by)
VALUES (
  '31000000-0000-0000-0000-0000000000c3',
  NULL,
  '31000000-0000-0000-0000-000000000001',
  '31000000-0000-0000-0000-000000000003',
  9999, 'cash', 'pending',
  '31000000-0000-0000-0000-000000000002'
);

-- A voided charge must not count toward charged.
INSERT INTO charges (id, clinic_id, patient_id, visit_id, description, category, amount_ugx, source, voided)
VALUES (
  '31000000-0000-0000-0000-0000000000c4',
  '31000000-0000-0000-0000-000000000001',
  '31000000-0000-0000-0000-000000000003',
  NULL, 'Voided manual line', 'other', 7777, 'manual', TRUE
);

DO $$
DECLARE
  v_charged BIGINT;
  v_paid BIGINT;
  v_balance BIGINT;
BEGIN
  SELECT charged, paid, balance INTO v_charged, v_paid, v_balance
  FROM rpc_patient_balance(
    '31000000-0000-0000-0000-000000000001',
    '31000000-0000-0000-0000-000000000003'
  );

  IF v_charged <> 36200 THEN
    RAISE EXCEPTION 'Case 4: charged must be Σ non-voided charges = 36200, got %', v_charged;
  END IF;
  IF v_paid <> 6000 THEN
    RAISE EXCEPTION 'Case 4: paid must be Σ paid payments incl. barter = 3000 + (2000+1000) = 6000, got %', v_paid;
  END IF;
  IF v_balance <> 30200 THEN
    RAISE EXCEPTION 'Case 4: balance must be charged − paid = 30200, got %', v_balance;
  END IF;
END $$;

-- ===========================================================================
-- Case 5 — DB backstop for double-counting (root cause C, migration 109):
--   a second AUTO consultation charge for the same visit, or a second active
--   pharmacy charge for the same (visit, item_code), must violate a unique
--   index — the EXISTS guards in the billing functions are race-prone without
--   it (PHARM-5 multi-call dispensing).
-- ===========================================================================

DO $$
DECLARE
  v_ok BOOLEAN := FALSE;
BEGIN
  BEGIN
    INSERT INTO charges (clinic_id, patient_id, visit_id, description, category, amount_ugx, source)
    VALUES (
      '31000000-0000-0000-0000-000000000001',
      '31000000-0000-0000-0000-000000000003',
      '31000000-0000-0000-0000-000000000010',
      'OPD consultation', 'consultation', 5000, 'consultation'
    );
  EXCEPTION WHEN unique_violation THEN
    v_ok := TRUE;
  END;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'Case 5: duplicate auto consultation charge for one visit must hit a unique index (109), but the insert succeeded';
  END IF;
END $$;

DO $$
DECLARE
  v_ok BOOLEAN := FALSE;
BEGIN
  BEGIN
    INSERT INTO charges (clinic_id, patient_id, visit_id, description, category, amount_ugx, item_code, source)
    VALUES (
      '31000000-0000-0000-0000-000000000001',
      '31000000-0000-0000-0000-000000000003',
      '31000000-0000-0000-0000-000000000010',
      'Testomycin 500 × 10 tabs', 'pharmacy', 10000,
      '31000000-0000-0000-0000-0000000000a1', 'pharmacy'
    );
  EXCEPTION WHEN unique_violation THEN
    v_ok := TRUE;
  END;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'Case 5: duplicate active pharmacy charge for one (visit, line) must hit a unique index (109), but the insert succeeded';
  END IF;
END $$;

-- ===========================================================================
-- Case 6 — a manually corrected charge amount stays sticky (092 D4): the
--   remainder dispense must not resurrect stock-price math on an adjusted line,
--   and must NOT create a second charge either.
-- ===========================================================================

INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, status, queue_status,
  documentation_complete, lab_status, medications,
  dispensing_status, pharmacy_order_submitted_at
) VALUES (
  '31000000-0000-0000-0000-000000000040',
  '31000000-0000-0000-0000-000000000001',
  '31000000-0000-0000-0000-000000000003',
  '31000000-0000-0000-0000-000000000002',
  'pending', 'waiting',
  TRUE, 'not_ordered', 'Testomycin 500',
  'not_started', NOW()
);

INSERT INTO prescription_orders (
  id, visit_id, clinic_id, patient_id, medication_code,
  quantity_prescribed, quantity_unit, status, source
) VALUES (
  '31000000-0000-0000-0000-0000000000d1',
  '31000000-0000-0000-0000-000000000040',
  '31000000-0000-0000-0000-000000000001',
  '31000000-0000-0000-0000-000000000003',
  'TST_BILL_ORIG', 10, 'tabs', 'ordered', 'manual'
);

SELECT rpc_complete_pharmacy_dispense(
  '31000000-0000-0000-0000-000000000040',
  jsonb_build_array(jsonb_build_object(
    'prescription_order_id', '31000000-0000-0000-0000-0000000000d1',
    'line_status', 'partially_dispensed',
    'quantity_dispensed', 6,
    'quantity_unit', 'tabs'
  )),
  NULL, NULL, '31000000-0000-0000-0000-000000000002'
);

-- Front desk corrects the amount (web updateChargeAmount sets the flag).
UPDATE charges
SET amount_ugx = 4000, manually_adjusted = TRUE
WHERE visit_id = '31000000-0000-0000-0000-000000000040'
  AND category = 'pharmacy' AND NOT voided;

SELECT rpc_complete_pharmacy_dispense(
  '31000000-0000-0000-0000-000000000040',
  jsonb_build_array(jsonb_build_object(
    'prescription_order_id', '31000000-0000-0000-0000-0000000000d1',
    'line_status', 'partially_dispensed',
    'quantity_dispensed', 4,
    'quantity_unit', 'tabs'
  )),
  NULL, NULL, '31000000-0000-0000-0000-000000000002'
);

DO $$
DECLARE
  v_rows INT;
  v_amount BIGINT;
BEGIN
  SELECT COUNT(*), COALESCE(SUM(amount_ugx), 0)
  INTO v_rows, v_amount
  FROM charges
  WHERE visit_id = '31000000-0000-0000-0000-000000000040'
    AND category = 'pharmacy' AND NOT voided;

  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'Case 6: manually adjusted line must remain ONE charge after the remainder dispense, got % rows', v_rows;
  END IF;
  IF v_amount <> 4000 THEN
    RAISE EXCEPTION 'Case 6: manual correction must stick (4000), got %', v_amount;
  END IF;
END $$;

SELECT 'billing_totals: all cases passed' AS result;

ROLLBACK;
