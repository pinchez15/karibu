-- 077_billing_auto_charges.sql
--
-- Auto-raise charge lines when lab results are recorded or pharmacy lines
-- are dispensed. Idempotent per test / prescription line.

-- ── Price helpers ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION billing_lab_test_price(p_clinic_id UUID, p_test_name TEXT)
RETURNS INTEGER
LANGUAGE plpgsql STABLE SET search_path = public
AS $$
DECLARE v_price INTEGER;
BEGIN
  SELECT COALESCE(l.default_price_ugx, 2000) INTO v_price
  FROM lab_test_catalog l
  WHERE LOWER(l.test_name) = LOWER(p_test_name)
     OR LOWER(l.code) = LOWER(p_test_name)
  LIMIT 1;
  RETURN COALESCE(v_price, 2000);
END;
$$;

CREATE OR REPLACE FUNCTION billing_pharmacy_unit_price(p_clinic_id UUID, p_medication_code TEXT)
RETURNS INTEGER
LANGUAGE plpgsql STABLE SET search_path = public
AS $$
DECLARE v_price INTEGER;
BEGIN
  SELECT COALESCE(
    (SELECT psi.unit_price_ugx FROM pharmacy_stock_items psi
     WHERE psi.clinic_id = p_clinic_id
       AND psi.drug_code = p_medication_code
       AND psi.active
     ORDER BY psi.updated_at DESC LIMIT 1),
    (SELECT mc.default_price_ugx FROM medication_catalog mc WHERE mc.code = p_medication_code),
    200
  ) INTO v_price;
  RETURN COALESCE(v_price, 200);
END;
$$;

-- ── Consultation fee (once per visit, when first billable service lands) ───────
CREATE OR REPLACE FUNCTION billing_ensure_consultation_charge(p_visit_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_visit RECORD;
  v_fee INTEGER;
BEGIN
  SELECT id, clinic_id, patient_id INTO v_visit FROM visits WHERE id = p_visit_id;
  IF v_visit.id IS NULL THEN RETURN; END IF;

  IF EXISTS (
    SELECT 1 FROM charges
    WHERE visit_id = p_visit_id AND category = 'consultation' AND NOT voided
  ) THEN RETURN; END IF;

  SELECT consultation_fee_ugx INTO v_fee
  FROM clinic_billing_rates WHERE clinic_id = v_visit.clinic_id;
  v_fee := COALESCE(v_fee, 5000);

  INSERT INTO charges (
    clinic_id, patient_id, visit_id, description, category, amount_ugx,
    quantity, unit_price_ugx, source, created_by
  ) VALUES (
    v_visit.clinic_id, v_visit.patient_id, p_visit_id,
    'OPD consultation', 'consultation', v_fee,
    1, v_fee, 'consultation', get_current_staff_id()
  );
END;
$$;

-- ── Lab test charge (on result recorded) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION billing_charge_lab_test(p_visit_id UUID, p_test_name TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_visit RECORD;
  v_price INTEGER;
  v_trimmed TEXT;
BEGIN
  v_trimmed := NULLIF(TRIM(p_test_name), '');
  IF v_trimmed IS NULL THEN RETURN; END IF;

  SELECT id, clinic_id, patient_id INTO v_visit FROM visits WHERE id = p_visit_id;
  IF v_visit.id IS NULL THEN RETURN; END IF;

  IF EXISTS (
    SELECT 1 FROM charges
    WHERE visit_id = p_visit_id AND category = 'lab'
      AND description = v_trimmed AND NOT voided
  ) THEN RETURN; END IF;

  v_price := billing_lab_test_price(v_visit.clinic_id, v_trimmed);

  INSERT INTO charges (
    clinic_id, patient_id, visit_id, description, category, amount_ugx,
    quantity, unit_price_ugx, source, created_by
  ) VALUES (
    v_visit.clinic_id, v_visit.patient_id, p_visit_id,
    v_trimmed, 'lab', v_price,
    1, v_price, 'lab', get_current_staff_id()
  );
END;
$$;

-- ── Pharmacy line charge (on dispense; updates qty on partial re-dispense) ───
CREATE OR REPLACE FUNCTION billing_charge_pharmacy_line(
  p_visit_id UUID,
  p_prescription_order_id UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_visit RECORD;
  v_po RECORD;
  v_qty NUMERIC;
  v_unit_price INTEGER;
  v_total INTEGER;
  v_name TEXT;
  v_item_code TEXT;
  v_desc TEXT;
BEGIN
  SELECT id, clinic_id, patient_id INTO v_visit FROM visits WHERE id = p_visit_id;
  IF v_visit.id IS NULL THEN RETURN; END IF;

  SELECT * INTO v_po FROM prescription_orders
  WHERE id = p_prescription_order_id AND visit_id = p_visit_id;
  IF v_po.id IS NULL THEN RETURN; END IF;

  IF v_po.status NOT IN ('dispensed', 'partially_dispensed') THEN RETURN; END IF;

  SELECT COALESCE(SUM(quantity_dispensed), 0) INTO v_qty
  FROM dispense_records
  WHERE prescription_order_id = p_prescription_order_id
    AND line_status IN ('dispensed', 'partially_dispensed');

  IF v_qty <= 0 THEN RETURN; END IF;

  v_item_code := COALESCE(v_po.medication_code, v_po.id::text);
  v_unit_price := billing_pharmacy_unit_price(v_visit.clinic_id, v_po.medication_code);
  v_total := ROUND(v_unit_price * v_qty)::INTEGER;
  v_name := COALESCE(
    (SELECT generic_name FROM medication_catalog WHERE code = v_po.medication_code),
    v_po.free_text_name,
    'Medication'
  );
  v_desc := v_name || COALESCE(' × ' || v_qty::text || ' ' || COALESCE(v_po.quantity_unit, ''), '');

  IF EXISTS (
    SELECT 1 FROM charges
    WHERE visit_id = p_visit_id AND category = 'pharmacy'
      AND item_code = v_item_code AND NOT voided
  ) THEN
    UPDATE charges
    SET quantity = v_qty,
        unit_price_ugx = v_unit_price,
        amount_ugx = v_total,
        description = v_desc
    WHERE visit_id = p_visit_id AND category = 'pharmacy'
      AND item_code = v_item_code AND NOT voided;
  ELSE
    INSERT INTO charges (
      clinic_id, patient_id, visit_id, description, category, amount_ugx,
      quantity, unit_price_ugx, item_code, source, created_by
    ) VALUES (
      v_visit.clinic_id, v_visit.patient_id, p_visit_id,
      v_desc, 'pharmacy', v_total,
      v_qty, v_unit_price, v_item_code, 'pharmacy', get_current_staff_id()
    );
  END IF;
END;
$$;

-- ── Hook: lab result recorded ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_record_lab_test_result(
  p_visit_id UUID,
  p_test_name TEXT,
  p_result TEXT,
  p_abnormal BOOLEAN DEFAULT FALSE,
  p_client_op_id UUID DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_clinic_id UUID;
  v_tests_ordered TEXT;
  v_results JSONB;
  v_trimmed_test TEXT;
  v_trimmed_result TEXT;
  v_i INT;
  v_elem JSONB;
  v_new_results JSONB := '[]'::jsonb;
  v_derived RECORD;
  v_status TEXT;
BEGIN
  v_trimmed_test := NULLIF(TRIM(p_test_name), '');
  v_trimmed_result := NULLIF(TRIM(p_result), '');
  IF v_trimmed_test IS NULL THEN RAISE EXCEPTION 'Test name cannot be empty'; END IF;
  IF v_trimmed_result IS NULL THEN RAISE EXCEPTION 'Result cannot be empty'; END IF;

  SELECT clinic_id, tests_ordered, lab_test_results
  INTO v_clinic_id, v_tests_ordered, v_results
  FROM visits WHERE id = p_visit_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  IF sync_op_already_applied(p_client_op_id) THEN RETURN; END IF;

  IF get_current_staff_role() NOT IN ('admin', 'lab_tech') THEN
    RAISE EXCEPTION 'Unauthorized role';
  END IF;

  v_results := sync_lab_test_results_array(v_tests_ordered, v_results);
  v_status := CASE WHEN p_abnormal THEN 'abnormal' ELSE 'done' END;

  FOR v_i IN 0..jsonb_array_length(v_results) - 1 LOOP
    v_elem := v_results->v_i;
    IF v_elem->>'test' = v_trimmed_test THEN
      v_elem := jsonb_build_object(
        'test', v_trimmed_test,
        'status', v_status,
        'result', v_trimmed_result,
        'abnormal', p_abnormal,
        'started_at', COALESCE(v_elem->>'started_at', NOW()::text),
        'completed_at', NOW()
      );
    END IF;
    v_new_results := v_new_results || jsonb_build_array(v_elem);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_new_results) AS e WHERE e->>'test' = v_trimmed_test
  ) THEN
    RAISE EXCEPTION 'Test not found on visit';
  END IF;

  SELECT * INTO v_derived FROM derive_visit_lab_state(v_new_results);

  UPDATE visits
  SET
    lab_test_results = v_new_results,
    lab_status = v_derived.lab_status,
    lab_results = v_derived.lab_results,
    lab_abnormal = v_derived.lab_abnormal,
    lab_completed_at = CASE WHEN v_derived.all_complete THEN NOW() ELSE lab_completed_at END,
    lab_completed_by = CASE WHEN v_derived.all_complete THEN get_current_staff_id() ELSE lab_completed_by END,
    updated_at = NOW()
  WHERE id = p_visit_id AND clinic_id = v_clinic_id;

  PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'record_lab_test_result', 'visits', p_visit_id);

  PERFORM billing_charge_lab_test(p_visit_id, v_trimmed_test);
  PERFORM billing_ensure_consultation_charge(p_visit_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Hook: pharmacy dispense complete ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_complete_pharmacy_dispense(
  p_visit_id UUID,
  p_lines JSONB,
  p_notes TEXT DEFAULT NULL,
  p_client_op_id UUID DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_clinic_id UUID;
  v_line JSONB;
  v_prescription_id UUID;
  v_line_status TEXT;
  v_qty NUMERIC;
  v_qty_unit TEXT;
  v_stock_item_id UUID;
  v_stock_qty NUMERIC;
  v_batch TEXT;
  v_substitute TEXT;
  v_line_notes TEXT;
  v_movement_id UUID;
  v_staff_id UUID;
  v_agg_status TEXT;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  IF sync_op_already_applied(p_client_op_id) THEN RETURN; END IF;

  IF get_current_staff_role() NOT IN ('admin', 'dispenser') THEN
    RAISE EXCEPTION 'Unauthorized role';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one dispense line required';
  END IF;

  v_staff_id := get_current_staff_id();
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'staff context required';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_prescription_id := (v_line->>'prescription_order_id')::uuid;
    v_line_status := NULLIF(TRIM(v_line->>'line_status'), '');
    v_qty := NULLIF(v_line->>'quantity_dispensed', '')::numeric;
    v_qty_unit := NULLIF(TRIM(v_line->>'quantity_unit'), '');
    v_stock_item_id := NULLIF(v_line->>'stock_item_id', '')::uuid;
    v_stock_qty := ABS(COALESCE(NULLIF(v_line->>'stock_quantity', '')::numeric, v_qty, 0));
    v_batch := NULLIF(TRIM(v_line->>'batch_number'), '');
    v_substitute := NULLIF(TRIM(v_line->>'substitute_medication_code'), '');
    v_line_notes := NULLIF(TRIM(v_line->>'notes'), '');

    IF v_prescription_id IS NULL OR v_line_status IS NULL THEN
      RAISE EXCEPTION 'Each line requires prescription_order_id and line_status';
    END IF;

    IF v_line_status NOT IN ('dispensed', 'partially_dispensed', 'out_of_stock') THEN
      RAISE EXCEPTION 'Invalid line_status: %', v_line_status;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM prescription_orders
      WHERE id = v_prescription_id
        AND visit_id = p_visit_id
        AND clinic_id = v_clinic_id
        AND status IN ('ordered', 'dispensing', 'partially_dispensed', 'out_of_stock')
    ) THEN
      RAISE EXCEPTION 'Prescription line not found or not dispensable: %', v_prescription_id;
    END IF;

    v_movement_id := NULL;
    IF v_stock_item_id IS NOT NULL AND v_stock_qty > 0 THEN
      IF NOT EXISTS (
        SELECT 1 FROM pharmacy_stock_items
        WHERE id = v_stock_item_id AND clinic_id = v_clinic_id AND active
      ) THEN
        RAISE EXCEPTION 'Invalid stock item';
      END IF;

      INSERT INTO pharmacy_stock_movements (
        stock_item_id, clinic_id, movement_type, quantity_delta,
        visit_id, recorded_by, batch_number, notes, prescription_order_id
      ) VALUES (
        v_stock_item_id, v_clinic_id, 'dispensed', -v_stock_qty,
        p_visit_id, v_staff_id, v_batch, v_line_notes, v_prescription_id
      )
      RETURNING id INTO v_movement_id;

      UPDATE pharmacy_stock_items
      SET
        quantity_on_hand = GREATEST(0, quantity_on_hand - v_stock_qty),
        updated_at = NOW()
      WHERE id = v_stock_item_id AND clinic_id = v_clinic_id;
    END IF;

    INSERT INTO dispense_records (
      prescription_order_id, visit_id, clinic_id, dispensed_by,
      quantity_dispensed, quantity_unit, line_status,
      substitute_medication_code, stock_item_id, stock_movement_id, notes
    ) VALUES (
      v_prescription_id, p_visit_id, v_clinic_id, v_staff_id,
      v_qty, v_qty_unit, v_line_status,
      v_substitute, v_stock_item_id, v_movement_id, v_line_notes
    );

    UPDATE prescription_orders
    SET status = CASE v_line_status
      WHEN 'dispensed' THEN 'dispensed'
      WHEN 'partially_dispensed' THEN 'partially_dispensed'
      WHEN 'out_of_stock' THEN 'out_of_stock'
    END
    WHERE id = v_prescription_id;

    IF v_line_status IN ('dispensed', 'partially_dispensed') THEN
      PERFORM billing_charge_pharmacy_line(p_visit_id, v_prescription_id);
    END IF;
  END LOOP;

  v_agg_status := aggregate_visit_dispensing_status(p_visit_id);

  UPDATE visits
  SET
    dispensing_status = v_agg_status,
    dispense_notes = NULLIF(TRIM(p_notes), ''),
    dispensed_at = CASE
      WHEN v_agg_status IN ('dispensed', 'partial', 'out_of_stock') THEN NOW()
      ELSE dispensed_at
    END,
    dispensed_by = CASE
      WHEN v_agg_status IN ('dispensed', 'partial', 'out_of_stock') THEN v_staff_id
      ELSE dispensed_by
    END,
    updated_at = NOW()
  WHERE id = p_visit_id AND clinic_id = v_clinic_id;

  PERFORM billing_ensure_consultation_charge(p_visit_id);

  PERFORM sync_op_record(
    p_client_op_id, v_clinic_id, 'complete_pharmacy_dispense', 'visits', p_visit_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Refactor bulk generator to reuse helpers (admin manual backfill).
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
  IF NOT is_admin() THEN RAISE EXCEPTION 'Admin only'; END IF;

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
