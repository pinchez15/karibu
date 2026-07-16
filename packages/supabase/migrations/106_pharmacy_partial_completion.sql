-- =============================================================================
-- 106_pharmacy_partial_completion.sql — PHARM-5 (partial-dispense fix)
-- =============================================================================
--
-- Beta feedback from SSUNGA HC III (most-reported issue): a partially-dispensed
-- line never leaves the queue, shows "already dispensed 2 of 2" yet stays
-- Partial, and there is no way to dispense the remaining balance.
--
-- Root cause: rpc_complete_pharmacy_dispense wrote prescription_orders.status
-- VERBATIM from the operator's Outcome dropdown (102_queue_autocomplete.sql:
-- 613-619). Nothing promoted a line to `dispensed` once the cumulative
-- dispensed quantity reached the prescribed amount — a full-quantity dispense
-- recorded as "Part" stayed partial forever.
--
-- Fix (this migration, additive only):
--   1. Add `prescribed_equivalent NUMERIC` to dispense_records (R1). This is the
--      quantity expressed in the ORIGINAL prescribed dispense unit. With no
--      substitution it equals `quantity_dispensed`; PHARM-4 will recompute it
--      from the strength ratio when a pharmacist substitutes a different
--      strength (see the integration seam below). Accounting/completion math
--      runs on `prescribed_equivalent`; stock decrement still runs on the raw
--      `quantity_dispensed`.
--   2. New rpc_complete_pharmacy_dispense that DERIVES line completion from
--      cumulative `prescribed_equivalent` vs `quantity_prescribed`, instead of
--      trusting the dropdown. NULL-quantity lines (legacy_text) fall back to the
--      dropdown status (R3).
--
-- Signature is UNCHANGED (R4): new data rides inside the existing p_lines JSONB.
-- aggregate_visit_dispensing_status / maybe_complete_visit_queue are NOT
-- rewritten (R3) — they already terminalize correctly once lines reach
-- `dispensed`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Additive column: prescribed-equivalent quantity for dispense accounting.
-- -----------------------------------------------------------------------------

ALTER TABLE dispense_records
  ADD COLUMN IF NOT EXISTS prescribed_equivalent NUMERIC(10, 2);

COMMENT ON COLUMN dispense_records.prescribed_equivalent IS
  'Quantity in the ORIGINALLY PRESCRIBED dispense unit. Drives over-dispense '
  'guard + derived line completion. Equals quantity_dispensed when no '
  'substitution; PHARM-4 recomputes it from the strength ratio on substitution. '
  'quantity_dispensed (raw, in the substitute''s unit) drives stock decrement.';

-- Backfill existing rows so historical partials keep correct remaining math.
-- Small live footprint (few patients) → safe one-shot backfill.
UPDATE dispense_records
SET prescribed_equivalent = quantity_dispensed
WHERE prescribed_equivalent IS NULL;

-- -----------------------------------------------------------------------------
-- 2. rpc_complete_pharmacy_dispense — derived line completion.
--    Body is 102_queue_autocomplete.sql:481-651 with the guard + status set
--    reworked to run on prescribed_equivalent. Everything else (gate-first
--    idempotency, stock movement, billing, aggregate rollup, appended
--    maybe_complete_visit_queue call) is preserved byte-for-byte in intent.
-- -----------------------------------------------------------------------------

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
  v_batch_id UUID;
  v_substitute TEXT;
  v_line_notes TEXT;
  v_movement_id UUID;
  v_staff_id UUID;
  v_agg_status TEXT;
  v_prescribed NUMERIC;
  v_already NUMERIC;
  -- PHARM-5 additions:
  v_qty_equiv NUMERIC;      -- this record's prescribed-equivalent quantity
  v_derived_status TEXT;    -- math-derived prescription_orders.status
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;

  IF v_clinic_id IS NOT NULL THEN
    PERFORM assert_staff_in_clinic(v_clinic_id);
  END IF;

  -- Idempotency: preserved gate-FIRST early-return (102:513). Must run before
  -- any dispense_record is inserted so a replayed client_op_id never
  -- double-counts (101_replay_tolerance.sql contract).
  IF sync_op_already_applied(p_client_op_id) THEN RETURN; END IF;

  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;

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
    v_batch_id := NULLIF(v_line->>'batch_id', '')::uuid;
    v_substitute := NULLIF(TRIM(v_line->>'substitute_medication_code'), '');
    v_line_notes := NULLIF(TRIM(v_line->>'notes'), '');

    -- ---- PHARM-4 INTEGRATION SEAM (strength substitution) ------------------
    -- prescribed_equivalent := quantity converted into the ORIGINALLY
    -- prescribed dispense unit. For now (no structured strength model) the
    -- client sends nothing and we default it to the raw dispensed quantity.
    -- PHARM-4 will compute and send `prescribed_equivalent` in p_lines from the
    -- substitute-vs-prescribed strength ratio (e.g. 8×250mg tabs dispensed for a
    -- 500mg order ⇒ prescribed_equivalent = 4). The guard + completion math
    -- below already read this field, so PHARM-4 needs NO change here.
    v_qty_equiv := COALESCE(NULLIF(v_line->>'prescribed_equivalent', '')::numeric, v_qty);
    -- ------------------------------------------------------------------------

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

    SELECT quantity_prescribed INTO v_prescribed
    FROM prescription_orders WHERE id = v_prescription_id;

    -- Over-dispense guard (R1): run on prescribed-equivalents, not raw units, so
    -- a strength substitution can't sneak past. Blocks GENUINE over-dispense
    -- only (strict `>`); a full remaining dispense hits `=` and is allowed,
    -- then resolves to `dispensed` below.
    IF v_line_status IN ('dispensed', 'partially_dispensed')
       AND v_qty_equiv IS NOT NULL AND v_qty_equiv > 0
       AND v_prescribed IS NOT NULL THEN
      SELECT COALESCE(SUM(COALESCE(prescribed_equivalent, quantity_dispensed, 0)), 0)
        INTO v_already
      FROM dispense_records
      WHERE prescription_order_id = v_prescription_id
        AND line_status IN ('dispensed', 'partially_dispensed');
      IF v_already + v_qty_equiv > v_prescribed THEN
        RAISE EXCEPTION
          'Dispensed quantity (% already + % now) exceeds prescribed % for this line',
          v_already, v_qty_equiv, v_prescribed;
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

      IF v_batch_id IS NULL THEN
        v_batch_id := rpc_suggest_fefo_batch(v_stock_item_id, v_stock_qty);
      END IF;

      IF v_batch_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM pharmacy_stock_batches
        WHERE id = v_batch_id
          AND stock_item_id = v_stock_item_id
          AND clinic_id = v_clinic_id
          AND active
      ) THEN
        RAISE EXCEPTION 'Invalid batch for stock item';
      END IF;

      -- Stock decrement uses the RAW quantity_dispensed (the substitute's unit),
      -- NOT prescribed_equivalent — FEFO / on-hand is counted in real units.
      INSERT INTO pharmacy_stock_movements (
        stock_item_id, clinic_id, movement_type, quantity_delta,
        visit_id, recorded_by, batch_number, notes, prescription_order_id, batch_id
      ) VALUES (
        v_stock_item_id, v_clinic_id, 'dispensed', -v_stock_qty,
        p_visit_id, v_staff_id, v_batch, v_line_notes, v_prescription_id, v_batch_id
      )
      RETURNING id INTO v_movement_id;
    END IF;

    INSERT INTO dispense_records (
      prescription_order_id, visit_id, clinic_id, dispensed_by,
      quantity_dispensed, quantity_unit, line_status,
      substitute_medication_code, stock_item_id, stock_movement_id, notes,
      prescribed_equivalent
    ) VALUES (
      v_prescription_id, p_visit_id, v_clinic_id, v_staff_id,
      v_qty, v_qty_unit, v_line_status,
      v_substitute, v_stock_item_id, v_movement_id, v_line_notes,
      v_qty_equiv
    );

    -- Derived line completion (PHARM-5): the MATH sets the terminal status, not
    -- the operator's dropdown.
    IF v_prescribed IS NULL THEN
      -- R3 NULL-quantity fallback: legacy_text lines carry no prescribed
      -- quantity, so there is no arithmetic to derive from — keep the operator's
      -- dropdown status (current behavior).
      v_derived_status := v_line_status;
    ELSE
      -- Recompute cumulative prescribed-equivalents for the whole line (this
      -- record included). This SUM is the single source of truth and handles
      -- every case correctly WITHOUT special-casing the current record's qty:
      --   full course      → SUM >= prescribed → dispensed
      --   some dispensed    → 0 < SUM < prescribed → partially_dispensed
      --   only OOS recorded → SUM = 0 → out_of_stock
      -- e.g. a prior partial followed by an out_of_stock outcome keeps SUM > 0,
      -- so the line stays partially_dispensed (NOT clobbered to out_of_stock).
      SELECT COALESCE(SUM(COALESCE(prescribed_equivalent, quantity_dispensed, 0)), 0)
        INTO v_already
      FROM dispense_records
      WHERE prescription_order_id = v_prescription_id
        AND line_status IN ('dispensed', 'partially_dispensed');

      IF v_already >= v_prescribed THEN
        v_derived_status := 'dispensed';
      ELSIF v_already > 0 THEN
        v_derived_status := 'partially_dispensed';
      ELSE
        v_derived_status := 'out_of_stock';
      END IF;
    END IF;

    UPDATE prescription_orders
    SET status = v_derived_status
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

  PERFORM maybe_complete_visit_queue(p_visit_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION rpc_complete_pharmacy_dispense(UUID, JSONB, TEXT, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_complete_pharmacy_dispense(UUID, JSONB, TEXT, UUID, UUID)
  TO authenticated, service_role;
