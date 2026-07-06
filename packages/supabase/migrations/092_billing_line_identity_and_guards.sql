-- =============================================================================
-- 092 — Billing line identity, sticky manual edits, and dispense guard (WP3)
-- =============================================================================
--
-- Stacks on 091 (WP1 pharmacy resubmit guard). NOTE: there is deliberately NO
-- visit-fee logic in this migration. This clinic's base visit fee is 0 by design;
-- the production `charged=0, paid>0` rows are missing PHARMACY/LAB charges that
-- only fire when the dispense/lab flow completes — WP1 restores that flow. WP3
-- makes the per-line charge correct and the display honest; it does not
-- manufacture a base-visit charge (a 0-fee charge would be meaningless here).
--
-- Three changes, each mapped to a WP3 decision:
--
--   D3 — Per-line charge identity. billing_charge_pharmacy_line now keys the
--        charge on `item_code = prescription_order_id::text` (the drug name stays
--        in `description`). Previously two lines of the SAME drug collapsed into
--        one charge because item_code was COALESCE(medication_code, id) and the
--        second line's UPDATE overwrote the first. Backfill note: existing
--        collapsed charges are left as-is — pre-launch data is purged per 084.
--
--   D4 — Manual edits are sticky. New `charges.manually_adjusted` flag. The web
--        updateChargeAmount action sets it TRUE; billing_charge_pharmacy_line
--        skips its UPDATE branch when TRUE, so a later dispense/backfill no longer
--        silently reverts a corrected amount back to stock price × markup.
--        (billing_charge_lab_test has no UPDATE branch — its EXISTS guard already
--        makes a manually edited lab charge sticky — so it needs no change.)
--
-- Also: the re-created rpc_complete_pharmacy_dispense drops the pre-existing
-- billing_ensure_base_visit_fee call (it only ever inserted a 0-UGX row here, per
-- the base-visit fee note above). WP3 keeps this migration free of any base-visit
-- fee logic; the lab-result and admin-backfill paths (077) are untouched.
--
--   D2 — Server-side over-dispense guard. rpc_complete_pharmacy_dispense RAISEs
--        (no silent clamp) if the cumulative dispensed quantity for a line would
--        exceed quantity_prescribed. The worksheet's remaining-quantity default
--        (WP3 D2, client side) prevents this in the happy path; this is the
--        backstop so incremental DB SUM semantics stay correct.
--
-- Manual verification (Supabase SQL editor):
--
--   -- D2: dispensing a line beyond its prescribed quantity raises.
--   --   Prescribe 10, dispense 6, then dispense 6 again on the same line:
--   --   SELECT rpc_complete_pharmacy_dispense('<visit>',
--   --     '[{"prescription_order_id":"<line>","line_status":"partially_dispensed",
--   --        "quantity_dispensed":6,"quantity_unit":"tabs"}]'::jsonb, NULL, NULL, '<staff>');
--   --   -- (repeat) -> ERROR: Dispensed quantity ... exceeds prescribed 10 ...
--   --
--   -- D3: two lines of the SAME drug become TWO distinct charges.
--   --   With two prescription_orders for the same medication_code both dispensed,
--   --   SELECT visit_id, item_code, description, amount_ugx FROM charges
--   --     WHERE visit_id = '<visit>' AND category = 'pharmacy' AND NOT voided;
--   --   -- expect two rows, item_code = each prescription_order id.
--   --
--   -- D4: a manual edit survives a later re-dispense.
--   --   UPDATE charges SET amount_ugx = 12345, manually_adjusted = TRUE WHERE id = '<charge>';
--   --   -- re-run rpc_complete_pharmacy_dispense for that line, then:
--   --   SELECT amount_ugx FROM charges WHERE id = '<charge>';  -- still 12345.
-- =============================================================================

-- ── D4: sticky-manual-edit flag ──────────────────────────────────────────────
ALTER TABLE charges
  ADD COLUMN IF NOT EXISTS manually_adjusted BOOLEAN NOT NULL DEFAULT FALSE;

-- ── D3 + D4: per-line pharmacy charge, keyed on prescription_order_id ─────────
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

  -- D3: identity is the prescription order id, so two lines of the same drug
  -- never collapse into a single charge.
  v_item_code := v_po.id::text;
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
    -- D4: never overwrite a manually corrected amount. The UPDATE is a no-op when
    -- manually_adjusted is TRUE, leaving the pharmacist's correction intact.
    UPDATE charges
    SET quantity = v_qty,
        unit_price_ugx = v_unit_price,
        amount_ugx = v_total,
        description = v_desc
    WHERE visit_id = p_visit_id AND category = 'pharmacy'
      AND item_code = v_item_code AND NOT voided
      AND NOT manually_adjusted;
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

-- ── D2: structured per-line dispense with over-dispense guard ─────────────────
-- Full re-create of the 087 version (service-role dispenser resolution preserved)
-- plus the cumulative-quantity guard. Every other line is unchanged from 087.
CREATE OR REPLACE FUNCTION rpc_complete_pharmacy_dispense(
  p_visit_id UUID,
  p_lines JSONB,
  p_notes TEXT DEFAULT NULL,
  p_client_op_id UUID DEFAULT NULL,
  p_dispensed_by UUID DEFAULT NULL
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
  v_prescribed NUMERIC;
  v_already NUMERIC;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  IF sync_op_already_applied(p_client_op_id) THEN RETURN; END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one dispense line required';
  END IF;

  v_staff_id := pharmacy_resolve_dispenser_staff_id(v_clinic_id, p_dispensed_by);

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

    -- WP3 D2: cumulative dispensed quantity may not exceed prescribed. No silent
    -- clamp — the pharmacist should correct the number (the worksheet already
    -- defaults to the remaining quantity, so this only fires on manual overrides).
    IF v_line_status IN ('dispensed', 'partially_dispensed') AND v_qty IS NOT NULL AND v_qty > 0 THEN
      SELECT quantity_prescribed INTO v_prescribed
      FROM prescription_orders WHERE id = v_prescription_id;
      IF v_prescribed IS NOT NULL THEN
        SELECT COALESCE(SUM(quantity_dispensed), 0) INTO v_already
        FROM dispense_records
        WHERE prescription_order_id = v_prescription_id
          AND line_status IN ('dispensed', 'partially_dispensed');
        IF v_already + v_qty > v_prescribed THEN
          RAISE EXCEPTION
            'Dispensed quantity (% already + % now) exceeds prescribed % for this line',
            v_already, v_qty, v_prescribed;
        END IF;
      END IF;
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

  -- Preserve 087 behavior: ensure the per-visit base charge exists on dispense.
  -- (For clinics with consultation_fee_ugx = 0, e.g. SSUNGA, this is a no-op
  -- 0-UGX row; other clinics rely on it. This is NOT the rejected visit-creation
  -- trigger — it is the existing idempotent per-dispense ensure carried from 087.)
  PERFORM billing_ensure_consultation_charge(p_visit_id);

  PERFORM sync_op_record(
    p_client_op_id, v_clinic_id, 'complete_pharmacy_dispense', 'visits', p_visit_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION rpc_complete_pharmacy_dispense(UUID, JSONB, TEXT, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_complete_pharmacy_dispense(UUID, JSONB, TEXT, UUID, UUID)
  TO authenticated, service_role;
