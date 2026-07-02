-- Per-line pharmacy send-back and visit status aggregation that keeps
-- in-progress visits active when only some lines need clinician review.

CREATE OR REPLACE FUNCTION aggregate_visit_dispensing_status(p_visit_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_total INT;
  v_dispensed INT;
  v_partial INT;
  v_oos INT;
  v_needs_clar INT;
  v_open INT;
BEGIN
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'dispensed'),
    COUNT(*) FILTER (WHERE status = 'partially_dispensed'),
    COUNT(*) FILTER (WHERE status = 'out_of_stock'),
    COUNT(*) FILTER (WHERE status = 'needs_clarification'),
    COUNT(*) FILTER (WHERE status IN ('ordered', 'dispensing'))
  INTO v_total, v_dispensed, v_partial, v_oos, v_needs_clar, v_open
  FROM prescription_orders
  WHERE visit_id = p_visit_id
    AND status <> 'cancelled';

  IF v_total = 0 THEN
    RETURN 'not_started';
  END IF;

  IF v_dispensed = v_total THEN
    RETURN 'dispensed';
  END IF;

  IF v_oos = v_total THEN
    RETURN 'out_of_stock';
  END IF;

  IF v_needs_clar = v_total THEN
    RETURN 'not_started';
  END IF;

  IF v_dispensed > 0 OR v_partial > 0 OR v_oos > 0 THEN
    RETURN 'partial';
  END IF;

  IF v_open > 0 OR v_needs_clar > 0 THEN
    RETURN 'in_progress';
  END IF;

  RETURN 'in_progress';
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION rpc_send_pharmacy_line_back_to_clinician(
  p_visit_id UUID,
  p_prescription_order_id UUID,
  p_reason TEXT,
  p_client_op_id UUID DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_clinic_id UUID;
  v_reason TEXT;
  v_agg_status TEXT;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  IF sync_op_already_applied(p_client_op_id) THEN RETURN; END IF;

  IF get_current_staff_role() NOT IN ('admin', 'dispenser') THEN
    RAISE EXCEPTION 'Unauthorized role';
  END IF;

  v_reason := NULLIF(TRIM(p_reason), '');
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Reason required when sending back to clinician';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM prescription_orders
    WHERE id = p_prescription_order_id
      AND visit_id = p_visit_id
      AND clinic_id = v_clinic_id
      AND status IN ('ordered', 'dispensing', 'partially_dispensed', 'out_of_stock')
  ) THEN
    RAISE EXCEPTION 'Prescription line not found or cannot be sent back';
  END IF;

  UPDATE prescription_orders
  SET status = 'needs_clarification'
  WHERE id = p_prescription_order_id
    AND visit_id = p_visit_id
    AND clinic_id = v_clinic_id;

  v_agg_status := aggregate_visit_dispensing_status(p_visit_id);

  UPDATE visits
  SET
    dispensing_status = v_agg_status,
    dispense_notes = v_reason,
    updated_at = NOW()
  WHERE id = p_visit_id AND clinic_id = v_clinic_id;

  PERFORM sync_op_record(
    p_client_op_id, v_clinic_id, 'send_pharmacy_line_back', 'prescription_orders', p_prescription_order_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION rpc_send_pharmacy_line_back_to_clinician(UUID, UUID, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_send_pharmacy_line_back_to_clinician(UUID, UUID, TEXT, UUID)
  TO authenticated, service_role;
