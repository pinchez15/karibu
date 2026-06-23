-- 078_billing_all_staff.sql
--
-- Billing is a front-desk function at HC III — any clinic staff may raise
-- charges, record payments, and void lines. created_by / collected_by capture
-- attribution via get_current_staff_id().

CREATE OR REPLACE FUNCTION rpc_void_charge(p_charge_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_clinic_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM charges WHERE id = p_charge_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Charge not found'; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  UPDATE charges SET voided = TRUE WHERE id = p_charge_id;
END;
$$;

CREATE OR REPLACE FUNCTION rpc_record_billing_payment(
  p_clinic_id UUID,
  p_patient_id UUID,
  p_amount_cash_ugx INTEGER,
  p_payment_method TEXT,
  p_visit_id UUID DEFAULT NULL,
  p_amount_barter_ugx INTEGER DEFAULT 0,
  p_barter_description TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id UUID := gen_random_uuid();
  v_row payments%ROWTYPE;
  v_collected_by UUID;
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);

  IF p_amount_cash_ugx < 0 OR COALESCE(p_amount_barter_ugx, 0) < 0 THEN
    RAISE EXCEPTION 'Amounts must be non-negative';
  END IF;
  IF (p_amount_cash_ugx + COALESCE(p_amount_barter_ugx, 0)) <= 0 THEN
    RAISE EXCEPTION 'Payment total must be positive';
  END IF;
  IF p_payment_method NOT IN ('cash', 'mtn_momo', 'airtel_money', 'barter', 'mixed') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;
  IF p_payment_method IN ('barter', 'mixed') AND COALESCE(p_amount_barter_ugx, 0) <= 0 THEN
    RAISE EXCEPTION 'Barter amount required';
  END IF;

  v_collected_by := get_current_staff_id();
  IF v_collected_by IS NULL THEN RAISE EXCEPTION 'collected_by required'; END IF;

  INSERT INTO payments (
    id, visit_id, clinic_id, patient_id,
    amount_ugx, amount_barter_ugx, barter_description,
    payment_method, status, notes, collected_by
  ) VALUES (
    v_id, p_visit_id, p_clinic_id, p_patient_id,
    p_amount_cash_ugx, COALESCE(p_amount_barter_ugx, 0), p_barter_description,
    p_payment_method, 'paid', p_notes, v_collected_by
  );

  SELECT * INTO v_row FROM payments WHERE id = v_id;
  RETURN jsonb_build_object('id', v_row.id, 'receipt_number', v_row.receipt_number);
END;
$$;

-- Manual backfill from visit care — any staff, not admin-only.
CREATE OR REPLACE FUNCTION rpc_generate_charges_from_visit(p_visit_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_visit RECORD;
  v_added INTEGER := 0;
  v_lab RECORD;
  v_po RECORD;
  v_before INTEGER;
BEGIN
  SELECT * INTO v_visit FROM visits WHERE id = p_visit_id;
  IF v_visit.id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;
  PERFORM assert_staff_in_clinic(v_visit.clinic_id);

  SELECT COUNT(*)::INTEGER INTO v_before
  FROM charges WHERE visit_id = p_visit_id AND NOT voided;

  PERFORM billing_ensure_consultation_charge(p_visit_id);

  FOR v_lab IN
    SELECT elem FROM jsonb_array_elements(COALESCE(v_visit.lab_test_results, '[]'::jsonb)) AS elem
    WHERE elem->>'status' IN ('done', 'abnormal')
  LOOP
    PERFORM billing_charge_lab_test(p_visit_id, v_lab.elem->>'test');
  END LOOP;

  FOR v_po IN
    SELECT id FROM prescription_orders
    WHERE visit_id = p_visit_id
      AND status IN ('dispensed', 'partially_dispensed')
  LOOP
    PERFORM billing_charge_pharmacy_line(p_visit_id, v_po.id);
  END LOOP;

  SELECT COUNT(*)::INTEGER - v_before INTO v_added
  FROM charges WHERE visit_id = p_visit_id AND NOT voided;

  RETURN GREATEST(v_added, 0);
END;
$$;
