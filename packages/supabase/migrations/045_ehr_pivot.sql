-- EHR pivot: sync idempotency, pharmacy order timing, SECURITY DEFINER RPCs for
-- lab/pharmacy/payment, clinic guard helper, pharmacy worklist gate.

-- =============================================================================
-- 1. sync_operations (client idempotency)
-- =============================================================================

CREATE TABLE IF NOT EXISTS sync_operations (
  id UUID PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  operation_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_operations_clinic
  ON sync_operations(clinic_id, applied_at DESC);

ALTER TABLE sync_operations ENABLE ROW LEVEL SECURITY;

-- No anon policies — only SECURITY DEFINER RPCs touch this table.

-- =============================================================================
-- 2. Pharmacy order submitted (queue gate — independent of documentation_complete)
-- =============================================================================

ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS pharmacy_order_submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pharmacy_order_submitted_by UUID REFERENCES staff(id);

CREATE INDEX IF NOT EXISTS idx_visits_pharmacy_order_submitted
  ON visits(clinic_id, pharmacy_order_submitted_at)
  WHERE pharmacy_order_submitted_at IS NOT NULL;

-- Preserve existing real test data: visits that already had meds + doc complete
-- were effectively "sent to pharmacy" under the old gate.
UPDATE visits
SET
  pharmacy_order_submitted_at = COALESCE(pharmacy_order_submitted_at, documentation_completed_at),
  pharmacy_order_submitted_by = COALESCE(pharmacy_order_submitted_by, doctor_id)
WHERE medications IS NOT NULL
  AND TRIM(medications) <> ''
  AND documentation_complete = TRUE
  AND pharmacy_order_submitted_at IS NULL;

-- =============================================================================
-- 3. Clinic guard + idempotency helpers
-- =============================================================================

CREATE OR REPLACE FUNCTION assert_staff_in_clinic(p_clinic_id UUID)
RETURNS VOID AS $$
DECLARE
  v_clerk_user_id TEXT;
BEGIN
  IF p_clinic_id IS NULL THEN
    RAISE EXCEPTION 'clinic_id required';
  END IF;

  v_clerk_user_id := auth.jwt()->>'sub';
  IF v_clerk_user_id IS NULL THEN
  -- Service role / internal callers without JWT skip staff check.
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM staff
    WHERE clinic_id = p_clinic_id
      AND clerk_user_id = v_clerk_user_id
      AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Staff not authorized for this clinic';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION sync_op_already_applied(p_client_op_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  IF p_client_op_id IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (SELECT 1 FROM sync_operations WHERE id = p_client_op_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION sync_op_record(
  p_client_op_id UUID,
  p_clinic_id UUID,
  p_operation_type TEXT,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  IF p_client_op_id IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO sync_operations (
    id, clinic_id, staff_id, operation_type, entity_type, entity_id
  ) VALUES (
    p_client_op_id,
    p_clinic_id,
    get_current_staff_id(),
    p_operation_type,
    p_entity_type,
    p_entity_id
  )
  ON CONFLICT (id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 4. rpc_submit_pharmacy_order
-- =============================================================================

CREATE OR REPLACE FUNCTION rpc_submit_pharmacy_order(
  p_visit_id UUID,
  p_medications TEXT,
  p_client_op_id UUID DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_clinic_id UUID;
  v_meds TEXT;
  v_role TEXT;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Visit not found';
  END IF;

  PERFORM assert_staff_in_clinic(v_clinic_id);

  IF sync_op_already_applied(p_client_op_id) THEN
    RETURN;
  END IF;

  v_role := get_current_staff_role();
  IF v_role NOT IN ('admin', 'doctor', 'nurse', 'clinical_officer', 'midwife') THEN
    RAISE EXCEPTION 'Unauthorized role: %', v_role;
  END IF;

  v_meds := NULLIF(TRIM(p_medications), '');
  IF v_meds IS NULL THEN
    RAISE EXCEPTION 'medications required to submit pharmacy order';
  END IF;

  UPDATE visits
  SET
    medications = v_meds,
    pharmacy_order_submitted_at = NOW(),
    pharmacy_order_submitted_by = COALESCE(get_current_staff_id(), pharmacy_order_submitted_by),
    dispensing_status = CASE
      WHEN dispensing_status IN ('dispensed') THEN dispensing_status
      ELSE 'not_started'
    END,
    updated_at = NOW()
  WHERE id = p_visit_id
    AND clinic_id = v_clinic_id;

  PERFORM sync_op_record(
    p_client_op_id, v_clinic_id, 'submit_pharmacy_order', 'visits', p_visit_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_submit_pharmacy_order(UUID, TEXT, UUID)
  TO anon, authenticated;

-- =============================================================================
-- 5. rpc_record_payment (Android — replaces direct POST /payments)
-- =============================================================================

CREATE OR REPLACE FUNCTION rpc_record_payment(
  p_id UUID,
  p_visit_id UUID,
  p_clinic_id UUID,
  p_patient_id UUID,
  p_amount_ugx INTEGER,
  p_payment_method TEXT,
  p_status TEXT DEFAULT 'paid',
  p_service_type TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_collected_by UUID DEFAULT NULL,
  p_client_op_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_collected_by UUID;
  v_row payments%ROWTYPE;
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);

  IF sync_op_already_applied(p_client_op_id) THEN
    SELECT * INTO v_row FROM payments WHERE id = p_id;
    IF FOUND THEN
      RETURN jsonb_build_object('id', v_row.id, 'receipt_number', v_row.receipt_number);
    END IF;
    RETURN jsonb_build_object('id', p_id, 'receipt_number', '');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM visits
    WHERE id = p_visit_id AND clinic_id = p_clinic_id AND patient_id = p_patient_id
  ) THEN
    RAISE EXCEPTION 'Visit/patient/clinic mismatch';
  END IF;

  v_collected_by := COALESCE(p_collected_by, get_current_staff_id());
  IF v_collected_by IS NULL THEN
    RAISE EXCEPTION 'collected_by required';
  END IF;

  INSERT INTO payments (
    id, visit_id, clinic_id, patient_id,
    amount_ugx, payment_method, status,
    service_type, notes, collected_by
  ) VALUES (
    p_id, p_visit_id, p_clinic_id, p_patient_id,
    p_amount_ugx, p_payment_method, p_status,
    p_service_type, p_notes, v_collected_by
  )
  ON CONFLICT (id) DO UPDATE SET
    amount_ugx = EXCLUDED.amount_ugx,
    payment_method = EXCLUDED.payment_method,
    status = EXCLUDED.status,
    service_type = EXCLUDED.service_type,
    notes = EXCLUDED.notes,
    updated_at = NOW();

  SELECT * INTO v_row FROM payments WHERE id = p_id;

  PERFORM sync_op_record(
    p_client_op_id, p_clinic_id, 'record_payment', 'payments', p_id
  );

  RETURN jsonb_build_object(
    'id', v_row.id,
    'receipt_number', v_row.receipt_number
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_record_payment(
  UUID, UUID, UUID, UUID, INTEGER, TEXT, TEXT, TEXT, TEXT, UUID, UUID
) TO anon, authenticated;

-- =============================================================================
-- 6. Lab RPCs
-- =============================================================================

CREATE OR REPLACE FUNCTION rpc_start_lab(
  p_visit_id UUID,
  p_client_op_id UUID DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  IF sync_op_already_applied(p_client_op_id) THEN RETURN; END IF;

  IF get_current_staff_role() NOT IN ('admin', 'lab_tech') THEN
    RAISE EXCEPTION 'Unauthorized role';
  END IF;

  UPDATE visits
  SET lab_status = 'running', updated_at = NOW()
  WHERE id = p_visit_id
    AND clinic_id = v_clinic_id
    AND lab_status = 'pending';

  PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'start_lab', 'visits', p_visit_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION rpc_record_lab_result(
  p_visit_id UUID,
  p_result TEXT,
  p_abnormal BOOLEAN DEFAULT FALSE,
  p_client_op_id UUID DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_clinic_id UUID;
  v_status TEXT;
  v_trimmed TEXT;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  IF sync_op_already_applied(p_client_op_id) THEN RETURN; END IF;

  IF get_current_staff_role() NOT IN ('admin', 'lab_tech') THEN
    RAISE EXCEPTION 'Unauthorized role';
  END IF;

  v_trimmed := NULLIF(TRIM(p_result), '');
  IF v_trimmed IS NULL THEN RAISE EXCEPTION 'Result cannot be empty'; END IF;

  v_status := CASE WHEN p_abnormal THEN 'abnormal' ELSE 'done' END;

  UPDATE visits
  SET
    lab_status = v_status,
    lab_results = v_trimmed,
    lab_abnormal = p_abnormal,
    lab_completed_at = NOW(),
    lab_completed_by = get_current_staff_id(),
    updated_at = NOW()
  WHERE id = p_visit_id AND clinic_id = v_clinic_id;

  PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'record_lab_result', 'visits', p_visit_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION rpc_reopen_lab(
  p_visit_id UUID,
  p_client_op_id UUID DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  IF sync_op_already_applied(p_client_op_id) THEN RETURN; END IF;

  IF get_current_staff_role() NOT IN ('admin', 'lab_tech') THEN
    RAISE EXCEPTION 'Unauthorized role';
  END IF;

  UPDATE visits
  SET
    lab_status = 'pending',
    lab_results = NULL,
    lab_abnormal = FALSE,
    lab_completed_at = NULL,
    lab_completed_by = NULL,
    updated_at = NOW()
  WHERE id = p_visit_id AND clinic_id = v_clinic_id;

  PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'reopen_lab', 'visits', p_visit_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_start_lab(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION rpc_record_lab_result(UUID, TEXT, BOOLEAN, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION rpc_reopen_lab(UUID, UUID) TO anon, authenticated;

-- =============================================================================
-- 7. Pharmacy dispense RPCs
-- =============================================================================

CREATE OR REPLACE FUNCTION rpc_set_dispensing_status(
  p_visit_id UUID,
  p_status TEXT,
  p_notes TEXT DEFAULT NULL,
  p_client_op_id UUID DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  IF sync_op_already_applied(p_client_op_id) THEN RETURN; END IF;

  IF get_current_staff_role() NOT IN ('admin', 'dispenser') THEN
    RAISE EXCEPTION 'Unauthorized role';
  END IF;

  IF p_status NOT IN ('not_started', 'in_progress', 'dispensed', 'partial', 'out_of_stock') THEN
    RAISE EXCEPTION 'Invalid dispensing status';
  END IF;

  UPDATE visits
  SET
    dispensing_status = p_status,
    dispense_notes = NULLIF(TRIM(p_notes), ''),
    dispensed_at = CASE
      WHEN p_status IN ('dispensed', 'partial', 'out_of_stock') THEN NOW()
      ELSE NULL
    END,
    dispensed_by = CASE
      WHEN p_status IN ('dispensed', 'partial', 'out_of_stock') THEN get_current_staff_id()
      ELSE NULL
    END,
    updated_at = NOW()
  WHERE id = p_visit_id AND clinic_id = v_clinic_id;

  PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'set_dispensing_status', 'visits', p_visit_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION rpc_record_dispense(
  p_visit_id UUID,
  p_status TEXT,
  p_notes TEXT DEFAULT NULL,
  p_movements JSONB DEFAULT '[]'::jsonb,
  p_client_op_id UUID DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_clinic_id UUID;
  v_movement JSONB;
  v_stock_item_id UUID;
  v_qty NUMERIC;
  v_batch TEXT;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  IF sync_op_already_applied(p_client_op_id) THEN RETURN; END IF;

  IF get_current_staff_role() NOT IN ('admin', 'dispenser') THEN
    RAISE EXCEPTION 'Unauthorized role';
  END IF;

  IF p_status NOT IN ('dispensed', 'partial', 'out_of_stock') THEN
    RAISE EXCEPTION 'Invalid terminal dispensing status';
  END IF;

  UPDATE visits
  SET
    dispensing_status = p_status,
    dispense_notes = NULLIF(TRIM(p_notes), ''),
    dispensed_at = NOW(),
    dispensed_by = get_current_staff_id(),
    updated_at = NOW()
  WHERE id = p_visit_id AND clinic_id = v_clinic_id;

  FOR v_movement IN SELECT * FROM jsonb_array_elements(COALESCE(p_movements, '[]'::jsonb))
  LOOP
    v_stock_item_id := (v_movement->>'stock_item_id')::uuid;
    v_qty := ABS((v_movement->>'quantity')::numeric);
    v_batch := NULLIF(TRIM(v_movement->>'batch_number'), '');

    IF v_stock_item_id IS NULL OR v_qty IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pharmacy_stock_items
      WHERE id = v_stock_item_id AND clinic_id = v_clinic_id
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO pharmacy_stock_movements (
      stock_item_id, clinic_id, movement_type, quantity_delta,
      visit_id, recorded_by, batch_number, notes
    ) VALUES (
      v_stock_item_id, v_clinic_id, 'dispensed', -v_qty,
      p_visit_id, get_current_staff_id(), v_batch,
      'Dispensed via rpc_record_dispense'
    );
  END LOOP;

  PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'record_dispense', 'visits', p_visit_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_set_dispensing_status(UUID, TEXT, TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION rpc_record_dispense(UUID, TEXT, TEXT, JSONB, UUID) TO anon, authenticated;

-- =============================================================================
-- 8. Pharmacy worklist — order submitted gate (not documentation_complete)
-- =============================================================================

CREATE OR REPLACE FUNCTION rpc_worklist_needs_pharmacy(
  p_clinic_id UUID
) RETURNS TABLE (
  visit_id UUID,
  patient_id UUID,
  patient_name TEXT,
  sex TEXT,
  derived_age INTEGER,
  medications TEXT,
  dispensing_status TEXT,
  doctor_id UUID,
  visit_date DATE
) AS $$
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);

  RETURN QUERY
  SELECT
    v.id, v.patient_id,
    trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')),
    p.sex,
    patient_age_years(p.id),
    v.medications,
    v.dispensing_status,
    v.doctor_id,
    v.visit_date
  FROM visits v
  JOIN patients p ON p.id = v.patient_id
  WHERE v.clinic_id = p_clinic_id
    AND v.medications IS NOT NULL
    AND TRIM(v.medications) <> ''
    AND v.pharmacy_order_submitted_at IS NOT NULL
    AND v.dispensing_status IN ('not_started', 'in_progress', 'partial', 'out_of_stock')
  ORDER BY v.pharmacy_order_submitted_at ASC NULLS LAST, v.visit_date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION rpc_worklist_needs_pharmacy(UUID) TO anon, authenticated;
