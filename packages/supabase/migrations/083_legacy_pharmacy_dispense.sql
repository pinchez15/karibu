-- 083_legacy_pharmacy_dispense.sql
-- Free-text medication visits without structured prescription_orders lines.

BEGIN;

CREATE OR REPLACE FUNCTION rpc_complete_legacy_pharmacy_dispense(
  p_visit_id UUID,
  p_notes TEXT DEFAULT NULL,
  p_client_op_id UUID DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id UUID;
  v_staff_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  IF sync_op_already_applied(p_client_op_id) THEN RETURN; END IF;

  IF get_current_staff_role() NOT IN ('admin', 'dispenser') THEN
    RAISE EXCEPTION 'Unauthorized role';
  END IF;

  v_staff_id := get_current_staff_id();
  IF v_staff_id IS NULL THEN RAISE EXCEPTION 'staff context required'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM visits
    WHERE id = p_visit_id
      AND clinic_id = v_clinic_id
      AND pharmacy_order_submitted_at IS NOT NULL
      AND COALESCE(TRIM(medications), '') <> ''
      AND NOT EXISTS (
        SELECT 1 FROM prescription_orders po
        WHERE po.visit_id = p_visit_id
          AND po.clinic_id = v_clinic_id
          AND po.status NOT IN ('cancelled')
      )
  ) THEN
    RAISE EXCEPTION 'Legacy dispense only for free-text medication visits without structured lines';
  END IF;

  UPDATE visits
  SET
    dispensing_status = 'dispensed',
    dispense_notes = COALESCE(NULLIF(TRIM(p_notes), ''), dispense_notes),
    dispensed_at = NOW(),
    dispensed_by = v_staff_id,
    updated_at = NOW()
  WHERE id = p_visit_id AND clinic_id = v_clinic_id;

  PERFORM sync_op_record(
    p_client_op_id, v_clinic_id, 'complete_legacy_pharmacy_dispense', 'visits', p_visit_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_complete_legacy_pharmacy_dispense(UUID, TEXT, UUID)
  TO authenticated, service_role;

COMMIT;
