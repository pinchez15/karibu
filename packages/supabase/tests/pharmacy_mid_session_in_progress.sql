-- =============================================================================
-- pharmacy_mid_session_in_progress.sql
-- Regression for migrations/113_pharmacy_mid_session_in_progress.sql
--
-- Finishing med 1 of a multi-line Rx must keep visits.dispensing_status =
-- in_progress (To dispense), not bounce to partial mid-session.
--
-- House style mirrors packages/supabase/tests/pharmacy_partial_completion.sql.
--
--   psql "$DATABASE_URL" -f packages/supabase/tests/pharmacy_mid_session_in_progress.sql
-- =============================================================================

BEGIN;

INSERT INTO clinics (id, name, slug)
VALUES ('21000000-0000-0000-0000-000000000001', 'Test Mid-Session Clinic', 'test-mid-session');

INSERT INTO staff (id, clerk_user_id, clinic_id, email, display_name, role, is_active)
VALUES (
  '21000000-0000-0000-0000-000000000002',
  'test-clerk-mid-session-dispenser',
  '21000000-0000-0000-0000-000000000001',
  'dispenser@test-mid-session.example',
  'Test Dispenser',
  'dispenser',
  TRUE
);

INSERT INTO patients (id, clinic_id, display_name, first_name, last_name, sex, date_of_birth)
VALUES (
  '21000000-0000-0000-0000-000000000003',
  '21000000-0000-0000-0000-000000000001',
  'Mid Session',
  'Mid',
  'Session',
  'F',
  '1990-01-01'
);

INSERT INTO visits (
  id, clinic_id, patient_id, doctor_id, status, queue_status,
  documentation_complete, lab_status, medications,
  dispensing_status, pharmacy_order_submitted_at
) VALUES (
  '21000000-0000-0000-0000-000000000010',
  '21000000-0000-0000-0000-000000000001',
  '21000000-0000-0000-0000-000000000003',
  '21000000-0000-0000-0000-000000000002',
  'pending', 'waiting',
  TRUE, 'not_ordered', 'Amox + Paracetamol',
  'in_progress', NOW()
);

INSERT INTO prescription_orders (
  id, visit_id, clinic_id, patient_id, free_text_name,
  quantity_prescribed, quantity_unit, status, source, sort_order
) VALUES
(
  '21000000-0000-0000-0000-0000000000a1',
  '21000000-0000-0000-0000-000000000010',
  '21000000-0000-0000-0000-000000000001',
  '21000000-0000-0000-0000-000000000003',
  'Amoxicillin 500mg', 20, 'caps', 'ordered', 'manual', 0
),
(
  '21000000-0000-0000-0000-0000000000a2',
  '21000000-0000-0000-0000-000000000010',
  '21000000-0000-0000-0000-000000000001',
  '21000000-0000-0000-0000-000000000003',
  'Paracetamol 500mg', 10, 'tabs', 'ordered', 'manual', 1
);

-- Dispense ONLY the first line fully; second line stays ordered.
SELECT rpc_complete_pharmacy_dispense(
  '21000000-0000-0000-0000-000000000010',
  jsonb_build_array(jsonb_build_object(
    'prescription_order_id', '21000000-0000-0000-0000-0000000000a1',
    'line_status', 'dispensed',
    'quantity_dispensed', 20,
    'quantity_unit', 'caps'
  )),
  NULL, NULL, '21000000-0000-0000-0000-000000000002'
);

DO $$
DECLARE
  v_line1 TEXT;
  v_line2 TEXT;
  v_visit TEXT;
BEGIN
  SELECT status INTO v_line1 FROM prescription_orders
  WHERE id = '21000000-0000-0000-0000-0000000000a1';
  SELECT status INTO v_line2 FROM prescription_orders
  WHERE id = '21000000-0000-0000-0000-0000000000a2';
  SELECT dispensing_status INTO v_visit FROM visits
  WHERE id = '21000000-0000-0000-0000-000000000010';

  IF v_line1 IS DISTINCT FROM 'dispensed' THEN
    RAISE EXCEPTION 'Mid-session: line 1 must be dispensed, got %', v_line1;
  END IF;
  IF v_line2 IS DISTINCT FROM 'ordered' THEN
    RAISE EXCEPTION 'Mid-session: line 2 must still be ordered, got %', v_line2;
  END IF;
  IF v_visit IS DISTINCT FROM 'in_progress' THEN
    RAISE EXCEPTION
      'Mid-session: visit must stay in_progress (not partial) while lines remain open, got %',
      v_visit;
  END IF;
END $$;

-- Pure aggregate unit checks (no further dispense).
DO $$
DECLARE
  v_status TEXT;
BEGIN
  UPDATE prescription_orders
  SET status = 'partially_dispensed'
  WHERE id = '21000000-0000-0000-0000-0000000000a2';

  v_status := aggregate_visit_dispensing_status('21000000-0000-0000-0000-000000000010');
  IF v_status IS DISTINCT FROM 'partial' THEN
    RAISE EXCEPTION
      'Aggregate: dispensed + partially_dispensed (no open) must be partial, got %',
      v_status;
  END IF;

  UPDATE prescription_orders
  SET status = 'ordered'
  WHERE id = '21000000-0000-0000-0000-0000000000a2';

  v_status := aggregate_visit_dispensing_status('21000000-0000-0000-0000-000000000010');
  IF v_status IS DISTINCT FROM 'in_progress' THEN
    RAISE EXCEPTION
      'Aggregate: dispensed + ordered must be in_progress, got %',
      v_status;
  END IF;
END $$;

ROLLBACK;
