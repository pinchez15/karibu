-- =============================================================================
-- 093 — Allow Clinical Officer (and Admin) to dispense from pharmacy
-- =============================================================================
-- At an HC III the Clinical Officer and Clinic Admin cover the pharmacy when no
-- dispenser is on shift (dual-acting as pharmacist/nurse). Widen the dispense
-- role allowlist in every SECURITY DEFINER gate from ('admin','dispenser') to
-- ('admin','dispenser','clinical_officer'). Admin + dispenser are unchanged;
-- all other roles still raise 'Unauthorized role'.
--
-- These are exact reproductions of the current functions (pharmacy_resolve from
-- 087, rpc_start from 064, send-back from 089) with ONLY the role list widened.
-- (rpc_complete_pharmacy_dispense — structured (092) and legacy (087) — resolves
-- the dispenser through pharmacy_resolve_dispenser_staff_id below, so it inherits
-- the new role automatically and needs no separate change.)
--
-- Web layer (nav visibility + page guard) is updated in the same PR.
-- =============================================================================

-- 1) Resolver used by rpc_complete_pharmacy_dispense (structured + legacy).
CREATE OR REPLACE FUNCTION pharmacy_resolve_dispenser_staff_id(
  p_clinic_id UUID,
  p_dispensed_by UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id UUID;
BEGIN
  IF karibu_is_service_role() THEN
    v_staff_id := p_dispensed_by;
    IF v_staff_id IS NULL THEN
      RAISE EXCEPTION 'staff context required';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM staff s
      WHERE s.id = v_staff_id
        AND s.clinic_id = p_clinic_id
        AND s.is_active = TRUE
        AND s.deactivated_at IS NULL
        AND s.role IN ('admin', 'dispenser', 'clinical_officer')
    ) THEN
      RAISE EXCEPTION 'Unauthorized role';
    END IF;
    RETURN v_staff_id;
  END IF;

  IF get_current_staff_role() NOT IN ('admin', 'dispenser', 'clinical_officer') THEN
    RAISE EXCEPTION 'Unauthorized role';
  END IF;
  v_staff_id := get_current_staff_id();
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'staff context required';
  END IF;
  RETURN v_staff_id;
END;
$$;

REVOKE ALL ON FUNCTION pharmacy_resolve_dispenser_staff_id(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pharmacy_resolve_dispenser_staff_id(UUID, UUID)
  TO authenticated, service_role;

-- 2) rpc_start_pharmacy_dispense (064) — begins a dispense session.
CREATE OR REPLACE FUNCTION rpc_start_pharmacy_dispense(
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

  IF get_current_staff_role() NOT IN ('admin', 'dispenser', 'clinical_officer') THEN
    RAISE EXCEPTION 'Unauthorized role';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM visits
    WHERE id = p_visit_id
      AND clinic_id = v_clinic_id
      AND pharmacy_order_submitted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Pharmacy order not submitted';
  END IF;

  UPDATE prescription_orders
  SET status = 'dispensing', ordered_at = ordered_at
  WHERE visit_id = p_visit_id
    AND status = 'ordered';

  UPDATE visits
  SET dispensing_status = 'in_progress', updated_at = NOW()
  WHERE id = p_visit_id AND clinic_id = v_clinic_id;

  PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'start_pharmacy_dispense', 'visits', p_visit_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_start_pharmacy_dispense(UUID, UUID)
  TO anon, authenticated;

-- 3) rpc_send_pharmacy_line_back_to_clinician (089) — pharmacy send-back.
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

  IF get_current_staff_role() NOT IN ('admin', 'dispenser', 'clinical_officer') THEN
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

GRANT EXECUTE ON FUNCTION rpc_send_pharmacy_line_back_to_clinician(UUID, UUID, TEXT, UUID)
  TO authenticated, service_role;

-- Manual verification:
--   -- As a clinical_officer (or admin/dispenser), start + complete a dispense:
--   --   SELECT rpc_start_pharmacy_dispense('<visit>');
--   --   SELECT rpc_complete_pharmacy_dispense('<visit>', '[...]'::jsonb, NULL, NULL, '<staff>');
--   --   -> succeeds.
--   -- As a nurse/records_officer/lab_tech: -> ERROR 'Unauthorized role'.
