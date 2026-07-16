-- Regression tests for PHARM-4 backend (migration 107):
--   * §0 AI gate — a line with source='ai_suggested' is REJECTED (P0001).
--   * structured lines persist + derive frequency_per_day and *_text.
--   * prescription_orders_with_dispensed exposes quantity_dispensed_so_far.
--
-- House style: BEGIN; seed; DO-block assertions (RAISE on failure); ROLLBACK.
-- Needs a DB — run as a direct psql session after migrations:
--   supabase db reset && psql "$DATABASE_URL" -f packages/supabase/tests/pharmacy_structured_prescribing.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
INSERT INTO clinics (id, name, slug, timezone)
VALUES ('40000000-0000-0000-0000-000000000001', 'PHARM4 Clinic', 'pharm4-test', 'Africa/Kampala');

INSERT INTO staff (id, clerk_user_id, clinic_id, email, display_name, role, is_active, onboarding_completed_at)
VALUES (
  '40000000-0000-0000-0000-000000000002',
  'pharm4-doctor',
  '40000000-0000-0000-0000-000000000001',
  'doctor@pharm4.test', 'PHARM4 Doctor', 'doctor', TRUE, NOW()
);

INSERT INTO patients (id, clinic_id, first_name, last_name, sex, date_of_birth)
VALUES (
  '40000000-0000-0000-0000-000000000003',
  '40000000-0000-0000-0000-000000000001',
  'PHARM4', 'Patient', 'F', '1990-01-01'
);

INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, status, queue_status,
  visit_date, department, dispensing_status
) VALUES (
  '40000000-0000-0000-0000-000000000010',
  '40000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000003',
  '40000000-0000-0000-0000-000000000002',
  'pending', 'waiting', CURRENT_DATE, 'opd', 'not_started'
);

-- Simulate an authenticated Clerk JWT so role-gated RPCs see the doctor.
CREATE OR REPLACE FUNCTION _pharm4_set_jwt(p_sub TEXT)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Case 1 — §0 AI gate: source='ai_suggested' is rejected (P0001), no row written
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_visit UUID := '40000000-0000-0000-0000-000000000010';
  v_got_exception BOOLEAN := FALSE;
  v_sqlstate TEXT;
  v_count INT;
BEGIN
  PERFORM _pharm4_set_jwt('pharm4-doctor');

  BEGIN
    PERFORM rpc_submit_pharmacy_order(
      v_visit,
      'Paracetamol',
      jsonb_build_array(jsonb_build_object(
        'medication_code', 'PARA',
        'dose_amount', 1, 'dose_unit', 'tab',
        'frequency_code', 'BID', 'duration_days', 5,
        'dispense_unit', 'tab',
        'source', 'ai_suggested'
      )),
      NULL
    );
  EXCEPTION WHEN OTHERS THEN
    v_got_exception := TRUE;
    v_sqlstate := SQLSTATE;
  END;

  IF NOT v_got_exception THEN
    RAISE EXCEPTION 'Case 1 FAILED: ai_suggested line was NOT rejected';
  END IF;
  IF v_sqlstate <> 'P0001' THEN
    RAISE EXCEPTION 'Case 1 FAILED: expected SQLSTATE P0001, got %', v_sqlstate;
  END IF;

  SELECT COUNT(*) INTO v_count FROM prescription_orders WHERE visit_id = v_visit;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Case 1 FAILED: % prescription_orders rows written despite gate', v_count;
  END IF;
  RAISE NOTICE 'Case 1 OK: ai_suggested rejected with P0001, no rows written';
END $$;

-- ---------------------------------------------------------------------------
-- Case 2 — manual_confirmed is also rejected from the writable set
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_visit UUID := '40000000-0000-0000-0000-000000000010';
  v_got_exception BOOLEAN := FALSE;
BEGIN
  PERFORM _pharm4_set_jwt('pharm4-doctor');
  BEGIN
    PERFORM rpc_submit_pharmacy_order(
      v_visit, 'Paracetamol',
      jsonb_build_array(jsonb_build_object(
        'medication_code', 'PARA', 'dose_amount', 1, 'dose_unit', 'tab',
        'frequency_code', 'BID', 'duration_days', 5, 'dispense_unit', 'tab',
        'source', 'manual_confirmed'
      )), NULL);
  EXCEPTION WHEN OTHERS THEN
    v_got_exception := TRUE;
  END;
  IF NOT v_got_exception THEN
    RAISE EXCEPTION 'Case 2 FAILED: manual_confirmed line was NOT rejected';
  END IF;
  RAISE NOTICE 'Case 2 OK: manual_confirmed rejected';
END $$;

-- ---------------------------------------------------------------------------
-- Case 3 — a valid structured 'manual' line persists + derives fields
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_visit UUID := '40000000-0000-0000-0000-000000000010';
  v_row prescription_orders%ROWTYPE;
  v_meds TEXT;
BEGIN
  PERFORM _pharm4_set_jwt('pharm4-doctor');

  PERFORM rpc_submit_pharmacy_order(
    v_visit, 'Amoxicillin',
    jsonb_build_array(jsonb_build_object(
      'medication_code', 'AMOX',
      'dose_amount', 500, 'dose_unit', 'mg',
      'strength_amount', 500, 'strength_unit', 'mg',
      'frequency_code', 'tid',      -- lowercase on the wire; RPC uppercases
      'duration_days', 7,
      'order_mode', 'scheduled',
      'quantity_prescribed', 21, 'quantity_source', 'computed',
      'dispense_unit', 'cap', 'form', 'capsule',
      'source', 'manual'
    )), NULL);

  SELECT * INTO v_row FROM prescription_orders
  WHERE visit_id = v_visit AND medication_code = 'AMOX'
  ORDER BY ordered_at DESC LIMIT 1;

  IF v_row.frequency_code <> 'TID' THEN
    RAISE EXCEPTION 'Case 3 FAILED: frequency_code not uppercased, got %', v_row.frequency_code;
  END IF;
  IF v_row.frequency_per_day <> 3 THEN
    RAISE EXCEPTION 'Case 3 FAILED: frequency_per_day expected 3, got %', v_row.frequency_per_day;
  END IF;
  IF v_row.dose_amount <> 500 OR v_row.dose_unit <> 'mg' THEN
    RAISE EXCEPTION 'Case 3 FAILED: dose fields not stored (% %)', v_row.dose_amount, v_row.dose_unit;
  END IF;
  IF v_row.duration_days <> 7 THEN
    RAISE EXCEPTION 'Case 3 FAILED: duration_days expected 7, got %', v_row.duration_days;
  END IF;
  IF v_row.source <> 'manual' THEN
    RAISE EXCEPTION 'Case 3 FAILED: source expected manual, got %', v_row.source;
  END IF;
  -- *_text derived from structured fields
  IF v_row.dose_text <> '500 mg' THEN
    RAISE EXCEPTION 'Case 3 FAILED: derived dose_text expected "500 mg", got %', v_row.dose_text;
  END IF;
  IF v_row.frequency_text <> 'TID' THEN
    RAISE EXCEPTION 'Case 3 FAILED: derived frequency_text expected TID, got %', v_row.frequency_text;
  END IF;
  IF v_row.duration_text <> '7 days' THEN
    RAISE EXCEPTION 'Case 3 FAILED: derived duration_text expected "7 days", got %', v_row.duration_text;
  END IF;

  SELECT medications INTO v_meds FROM visits WHERE id = v_visit;
  IF v_meds IS NULL OR POSITION('500 mg' IN v_meds) = 0 THEN
    RAISE EXCEPTION 'Case 3 FAILED: visit.medications summary not derived from structured fields: %', v_meds;
  END IF;
  RAISE NOTICE 'Case 3 OK: structured line persisted + derived (summary=%)', v_meds;
END $$;

-- ---------------------------------------------------------------------------
-- Case 4 — prescription_orders_with_dispensed exposes quantity_dispensed_so_far
--          from prescribed_equivalent (falls back to quantity_dispensed).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_visit UUID := '40000000-0000-0000-0000-000000000010';
  v_line UUID;
  v_staff UUID := '40000000-0000-0000-0000-000000000002';
  v_so_far NUMERIC;
BEGIN
  SELECT id INTO v_line FROM prescription_orders
  WHERE visit_id = v_visit AND medication_code = 'AMOX'
  ORDER BY ordered_at DESC LIMIT 1;

  -- Two dispense records: one substituted (prescribed_equivalent set), one raw.
  INSERT INTO dispense_records (
    prescription_order_id, visit_id, clinic_id, dispensed_by,
    quantity_dispensed, prescribed_equivalent, line_status
  ) VALUES
    (v_line, v_visit, '40000000-0000-0000-0000-000000000001', v_staff, 8, 4, 'partially_dispensed'),
    (v_line, v_visit, '40000000-0000-0000-0000-000000000001', v_staff, 5, NULL, 'partially_dispensed');

  SELECT quantity_dispensed_so_far INTO v_so_far
  FROM prescription_orders_with_dispensed WHERE id = v_line;

  -- 4 (prescribed-equivalent of the substitute) + 5 (raw fallback) = 9
  IF v_so_far <> 9 THEN
    RAISE EXCEPTION 'Case 4 FAILED: quantity_dispensed_so_far expected 9, got %', v_so_far;
  END IF;
  RAISE NOTICE 'Case 4 OK: quantity_dispensed_so_far = % (prescribed_equivalent + fallback)', v_so_far;
END $$;

-- ---------------------------------------------------------------------------
-- Case 5 — a plain 'manual' line with NO source key still defaults to manual OK
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_visit UUID := '40000000-0000-0000-0000-000000000010';
  v_count INT;
BEGIN
  PERFORM _pharm4_set_jwt('pharm4-doctor');
  PERFORM rpc_submit_pharmacy_order(
    v_visit, 'Paracetamol',
    jsonb_build_array(jsonb_build_object(
      'medication_code', 'PARA', 'dose_amount', 1, 'dose_unit', 'tab',
      'frequency_code', 'BID', 'duration_days', 5, 'dispense_unit', 'tab'
      -- no 'source' key -> defaults to 'manual'
    )), NULL);
  SELECT COUNT(*) INTO v_count FROM prescription_orders
  WHERE visit_id = v_visit AND source = 'manual' AND medication_code = 'PARA';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Case 5 FAILED: expected 1 manual PARA row, got %', v_count;
  END IF;
  RAISE NOTICE 'Case 5 OK: missing source defaults to manual';
END $$;

ROLLBACK;
