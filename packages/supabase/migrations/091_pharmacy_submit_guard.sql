-- =============================================================================
-- 091 — Pharmacy resubmit guard (WP1 D4)
-- =============================================================================
--
-- Fixes defect C3: when a clinician re-submitted a pharmacy order while the
-- dispenser was mid-dispense, rpc_submit_pharmacy_order (migration 064) would
--   (1) DELETE any line in status 'dispensing', destroying the dispenser's
--       in-flight work, and
--   (2) unconditionally reset visits.dispensing_status to 'not_started',
-- which yanked the visit out of the dispenser's tab and broke their next
-- dispense click with "Prescription line not found or not dispensable".
--
-- This migration replaces rpc_submit_pharmacy_order with two changes; every
-- other line is preserved verbatim from 064:
--
--   (a) RAISE EXCEPTION with a human-readable message if ANY prescription line
--       for the visit is currently in status 'dispensing'. The clinician must
--       ask the dispenser to send the line back before editing the order. The
--       message is surfaced verbatim by the web composer (VisitPharmacyPanel)
--       and by Android's send-back flow (WP2 error taxonomy).
--
--   (b) On a successful resubmit where lines were ALREADY dispensed, set
--       visits.dispensing_status to aggregate_visit_dispensing_status(p_visit_id)
--       instead of the unconditional 'not_started' reset. Already-dispensed /
--       out-of-stock / partially-dispensed lines survive the DELETE (which only
--       removes 'ordered' / 'needs_clarification' lines), so the aggregate
--       correctly reports 'partial' rather than wrongly claiming the visit is
--       untouched. A fresh or fully-redrafted order (nothing dispensed) stays
--       'not_started' — NOT the aggregate's misleading 'in_progress' for
--       all-'ordered' lines — so the queue keeps the "Waiting" triage chip.
--
-- Manual verification (run in the Supabase SQL editor as a dispenser/clinician
-- with a visit that has structured prescription lines):
--
--   -- 1) Resubmit while a line is actively 'dispensing' -> exception:
--   --    UPDATE prescription_orders SET status = 'dispensing'
--   --      WHERE visit_id = '<visit>' AND status = 'ordered';
--   --    SELECT rpc_submit_pharmacy_order('<visit>', 'AL 24 tabs', NULL, NULL);
--   --    -- expect ERROR: Pharmacy is dispensing this order — send-back
--   --    --   required before editing
--   --
--   -- 2) Resubmit after a partial dispense -> aggregate status, not
--   --    'not_started':
--   --    -- (mark one line 'dispensed', leave one 'ordered', then)
--   --    SELECT rpc_submit_pharmacy_order('<visit>', 'AL 24 tabs', '[...]'::jsonb, NULL);
--   --    SELECT dispensing_status FROM visits WHERE id = '<visit>';
--   --    -- expect 'partial' (the dispensed line survived the DELETE), NOT
--   --    --   'not_started'.
-- =============================================================================

CREATE OR REPLACE FUNCTION rpc_submit_pharmacy_order(
  p_visit_id UUID,
  p_medications TEXT,
  p_lines JSONB DEFAULT NULL,
  p_client_op_id UUID DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_clinic_id UUID;
  v_patient_id UUID;
  v_meds TEXT;
  v_role TEXT;
  v_line JSONB;
  v_idx INT := 0;
  v_has_lines BOOLEAN;
  v_summary TEXT;
  v_text_line TEXT;
  v_agg_status TEXT;
BEGIN
  SELECT clinic_id, patient_id INTO v_clinic_id, v_patient_id
  FROM visits WHERE id = p_visit_id;
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

  v_has_lines := p_lines IS NOT NULL AND jsonb_typeof(p_lines) = 'array' AND jsonb_array_length(p_lines) > 0;

  IF NOT v_has_lines THEN
    v_meds := NULLIF(TRIM(p_medications), '');
    IF v_meds IS NULL THEN
      RAISE EXCEPTION 'medications or structured lines required';
    END IF;
  END IF;

  -- Replace draft lines only when dispensing has not completed.
  IF EXISTS (
    SELECT 1 FROM visits
    WHERE id = p_visit_id
      AND clinic_id = v_clinic_id
      AND dispensing_status IN ('dispensed')
  ) THEN
    RAISE EXCEPTION 'Cannot resubmit pharmacy order after full dispense';
  END IF;

  -- WP1 D4 (a): never delete a line the pharmacist is actively dispensing.
  -- Require an explicit send-back first so no in-flight work is destroyed.
  IF EXISTS (
    SELECT 1 FROM prescription_orders
    WHERE visit_id = p_visit_id
      AND clinic_id = v_clinic_id
      AND status = 'dispensing'
  ) THEN
    RAISE EXCEPTION 'Pharmacy is dispensing this order — send-back required before editing';
  END IF;

  DELETE FROM prescription_orders
  WHERE visit_id = p_visit_id
    AND status IN ('ordered', 'needs_clarification', 'dispensing');

  IF v_has_lines THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
      IF NULLIF(TRIM(v_line->>'medication_code'), '') IS NULL
         AND NULLIF(TRIM(v_line->>'free_text_name'), '') IS NULL THEN
        CONTINUE;
      END IF;

      INSERT INTO prescription_orders (
        visit_id, clinic_id, patient_id, sort_order,
        medication_code, free_text_name,
        dose_text, route_text, frequency_text, duration_text,
        quantity_prescribed, quantity_unit,
        status, source, ordered_by, notes
      ) VALUES (
        p_visit_id, v_clinic_id, v_patient_id, v_idx,
        NULLIF(TRIM(v_line->>'medication_code'), ''),
        NULLIF(TRIM(v_line->>'free_text_name'), ''),
        NULLIF(TRIM(v_line->>'dose_text'), ''),
        NULLIF(TRIM(v_line->>'route_text'), ''),
        NULLIF(TRIM(v_line->>'frequency_text'), ''),
        NULLIF(TRIM(v_line->>'duration_text'), ''),
        NULLIF(v_line->>'quantity_prescribed', '')::numeric,
        NULLIF(TRIM(v_line->>'quantity_unit'), ''),
        'ordered',
        COALESCE(NULLIF(TRIM(v_line->>'source'), ''), 'manual'),
        get_current_staff_id(),
        NULLIF(TRIM(v_line->>'notes'), '')
      );
      v_idx := v_idx + 1;
    END LOOP;

    IF v_idx = 0 THEN
      RAISE EXCEPTION 'At least one prescription line required';
    END IF;

    v_summary := rebuild_visit_medications_summary(p_visit_id);
  ELSE
    -- Legacy: one line per non-empty row of free text.
    FOR v_text_line IN
      SELECT TRIM(line)
      FROM unnest(string_to_array(v_meds, E'\n')) AS line
      WHERE NULLIF(TRIM(line), '') IS NOT NULL
    LOOP
      INSERT INTO prescription_orders (
        visit_id, clinic_id, patient_id, sort_order,
        free_text_name, status, source, ordered_by
      ) VALUES (
        p_visit_id, v_clinic_id, v_patient_id, v_idx,
        v_text_line, 'ordered', 'legacy_text', get_current_staff_id()
      );
      v_idx := v_idx + 1;
    END LOOP;
    v_summary := v_meds;
  END IF;

  -- WP1 D4 (b): derive the visit status from the surviving + new lines rather
  -- than blindly resetting to 'not_started'. Lines already dispensed before a
  -- resubmit keep the visit in 'partial'. BUT a fresh or fully-redrafted order
  -- (nothing dispensed yet, all lines 'ordered') must stay 'not_started' so it
  -- shows the "Waiting" triage chip — the raw aggregate reports a misleading
  -- 'in_progress' for all-'ordered' lines. Only inherit the aggregate once real
  -- dispensing / out-of-stock has actually happened.
  IF EXISTS (
    SELECT 1 FROM prescription_orders
    WHERE visit_id = p_visit_id
      AND status IN ('dispensed', 'partially_dispensed', 'out_of_stock')
  ) THEN
    v_agg_status := aggregate_visit_dispensing_status(p_visit_id);
  ELSE
    v_agg_status := 'not_started';
  END IF;

  UPDATE visits
  SET
    medications = v_summary,
    pharmacy_order_submitted_at = NOW(),
    pharmacy_order_submitted_by = COALESCE(get_current_staff_id(), pharmacy_order_submitted_by),
    dispensing_status = v_agg_status,
    dispense_notes = NULL,
    updated_at = NOW()
  WHERE id = p_visit_id
    AND clinic_id = v_clinic_id;

  PERFORM sync_op_record(
    p_client_op_id, v_clinic_id, 'submit_pharmacy_order', 'visits', p_visit_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_submit_pharmacy_order(UUID, TEXT, JSONB, UUID)
  TO anon, authenticated;
