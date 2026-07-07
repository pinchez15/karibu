-- 098_wp3_pharmacy_batches.sql
-- WP3 Step 1 — pharmacy stock batches (FEFO, expiring-soon, backward-compatible)
--
-- pharmacy_stock_items.quantity_on_hand remains the read-compat aggregate.
-- When batch_id is set on a movement, batch rows are authoritative and the
-- item total is recomputed from active batches. When batch_id IS NULL (legacy
-- Android offline dispense), the item row is updated directly as before — batch
-- totals may drift until a stock-take or receive flow reconciles them.

BEGIN;

-- =============================================================================
-- 1. pharmacy_stock_batches
-- =============================================================================

CREATE TABLE IF NOT EXISTS pharmacy_stock_batches (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id     UUID NOT NULL REFERENCES pharmacy_stock_items(id) ON DELETE CASCADE,
  clinic_id         UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  batch_number      TEXT,
  expires_at        DATE,
  quantity_on_hand  NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  received_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  supplier          TEXT,
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  gtin              TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pharmacy_stock_batches_item_batch
  ON pharmacy_stock_batches (stock_item_id, batch_number)
  WHERE batch_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pharmacy_stock_batches_item_active
  ON pharmacy_stock_batches (stock_item_id)
  WHERE active;

CREATE INDEX IF NOT EXISTS idx_pharmacy_stock_batches_clinic_expiry
  ON pharmacy_stock_batches (clinic_id, expires_at)
  WHERE active AND expires_at IS NOT NULL;

ALTER TABLE pharmacy_stock_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY pharmacy_stock_batches_select_clinic ON pharmacy_stock_batches
  FOR SELECT TO authenticated
  USING (clinic_id = get_current_clinic_id());

-- =============================================================================
-- 2. batch_id on pharmacy_stock_movements
-- =============================================================================

ALTER TABLE pharmacy_stock_movements
  ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES pharmacy_stock_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pharmacy_stock_movements_batch
  ON pharmacy_stock_movements (batch_id)
  WHERE batch_id IS NOT NULL;

-- =============================================================================
-- 3. recompute_pharmacy_stock_item_quantity
-- =============================================================================

CREATE OR REPLACE FUNCTION recompute_pharmacy_stock_item_quantity(p_stock_item_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE pharmacy_stock_items psi
  SET
    quantity_on_hand = COALESCE((
      SELECT SUM(b.quantity_on_hand)
      FROM pharmacy_stock_batches b
      WHERE b.stock_item_id = p_stock_item_id
        AND b.active
    ), 0),
    updated_at = NOW()
  WHERE psi.id = p_stock_item_id;
END;
$$;

REVOKE ALL ON FUNCTION recompute_pharmacy_stock_item_quantity(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION recompute_pharmacy_stock_item_quantity(UUID)
  TO authenticated, service_role;

-- =============================================================================
-- 4. apply_pharmacy_stock_movement — batch-aware, legacy fallback
-- =============================================================================

CREATE OR REPLACE FUNCTION apply_pharmacy_stock_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.batch_id IS NOT NULL THEN
    UPDATE pharmacy_stock_batches
    SET quantity_on_hand = GREATEST(0, quantity_on_hand + NEW.quantity_delta)
    WHERE id = NEW.batch_id
      AND stock_item_id = NEW.stock_item_id;

    PERFORM recompute_pharmacy_stock_item_quantity(NEW.stock_item_id);
  ELSE
    -- Legacy / Android aggregate decrement — no batch row touched.
    UPDATE pharmacy_stock_items
    SET quantity_on_hand = GREATEST(0, quantity_on_hand + NEW.quantity_delta)
    WHERE id = NEW.stock_item_id;
  END IF;

  RETURN NEW;
END;
$$;

-- =============================================================================
-- 5. Backfill — one synthetic batch per item with on-hand quantity
-- =============================================================================

INSERT INTO pharmacy_stock_batches (
  stock_item_id,
  clinic_id,
  batch_number,
  expires_at,
  quantity_on_hand,
  supplier,
  active
)
SELECT
  psi.id,
  psi.clinic_id,
  COALESCE(NULLIF(TRIM(psi.batch_number), ''), 'legacy-' || psi.id::text),
  psi.expires_at,
  psi.quantity_on_hand,
  psi.supplier,
  TRUE
FROM pharmacy_stock_items psi
WHERE psi.active
  AND psi.quantity_on_hand > 0
  AND NOT EXISTS (
    SELECT 1 FROM pharmacy_stock_batches b WHERE b.stock_item_id = psi.id
  );

-- =============================================================================
-- 6. rpc_suggest_fefo_batch — earliest expiry with sufficient quantity
-- =============================================================================

CREATE OR REPLACE FUNCTION rpc_suggest_fefo_batch(
  p_stock_item_id UUID,
  p_quantity NUMERIC
)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT b.id
  FROM pharmacy_stock_batches b
  WHERE b.stock_item_id = p_stock_item_id
    AND b.active
    AND b.quantity_on_hand >= p_quantity
  ORDER BY b.expires_at NULLS LAST, b.received_at ASC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION rpc_suggest_fefo_batch(UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_suggest_fefo_batch(UUID, NUMERIC)
  TO authenticated, service_role;

-- =============================================================================
-- 7. rpc_pharmacy_batches_expiring
-- =============================================================================

CREATE OR REPLACE FUNCTION rpc_pharmacy_batches_expiring(
  p_clinic_id UUID,
  p_days INT DEFAULT 30
)
RETURNS TABLE (
  stock_item_id UUID,
  drug_name TEXT,
  strength TEXT,
  formulation TEXT,
  batch_id UUID,
  batch_number TEXT,
  expires_at DATE,
  quantity_on_hand NUMERIC,
  gtin TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_horizon DATE := kampala_today() + GREATEST(1, p_days);
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);

  RETURN QUERY
  SELECT
    psi.id,
    psi.drug_name,
    psi.strength,
    psi.formulation,
    b.id,
    b.batch_number,
    b.expires_at,
    b.quantity_on_hand,
    b.gtin
  FROM pharmacy_stock_batches b
  JOIN pharmacy_stock_items psi ON psi.id = b.stock_item_id
  WHERE b.clinic_id = p_clinic_id
    AND b.active
    AND psi.active
    AND b.quantity_on_hand > 0
    AND b.expires_at IS NOT NULL
    AND b.expires_at <= v_horizon
  ORDER BY b.expires_at ASC, psi.drug_name ASC;
END;
$$;

REVOKE ALL ON FUNCTION rpc_pharmacy_batches_expiring(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_pharmacy_batches_expiring(UUID, INT)
  TO authenticated, service_role;

-- =============================================================================
-- 8. rpc_upsert_pharmacy_batch_on_receive
-- =============================================================================
-- Web/import receive flows should call this instead of overwriting item-level
-- batch_number / expires_at. Creates the batch row (if needed) and logs a
-- received movement linked to batch_id so the trigger maintains quantities.

CREATE OR REPLACE FUNCTION rpc_upsert_pharmacy_batch_on_receive(
  p_stock_item_id UUID,
  p_clinic_id UUID,
  p_quantity NUMERIC,
  p_batch_number TEXT DEFAULT NULL,
  p_expires_at DATE DEFAULT NULL,
  p_supplier TEXT DEFAULT NULL,
  p_gtin TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_staff_id UUID;
  v_batch_number TEXT;
  v_batch_id UUID;
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pharmacy_stock_items
    WHERE id = p_stock_item_id AND clinic_id = p_clinic_id AND active
  ) THEN
    RAISE EXCEPTION 'Invalid stock item';
  END IF;

  v_staff_id := get_current_staff_id();
  v_batch_number := NULLIF(TRIM(p_batch_number), '');

  IF v_batch_number IS NOT NULL THEN
    SELECT id INTO v_batch_id
    FROM pharmacy_stock_batches
    WHERE stock_item_id = p_stock_item_id
      AND batch_number = v_batch_number
    LIMIT 1;
  END IF;

  IF v_batch_id IS NULL THEN
    INSERT INTO pharmacy_stock_batches (
      stock_item_id,
      clinic_id,
      batch_number,
      expires_at,
      quantity_on_hand,
      supplier,
      gtin,
      active
    ) VALUES (
      p_stock_item_id,
      p_clinic_id,
      COALESCE(v_batch_number, 'recv-' || gen_random_uuid()::text),
      p_expires_at,
      0,
      p_supplier,
      p_gtin,
      TRUE
    )
    RETURNING id INTO v_batch_id;
  ELSE
    UPDATE pharmacy_stock_batches
    SET
      expires_at = COALESCE(p_expires_at, expires_at),
      supplier = COALESCE(p_supplier, supplier),
      gtin = COALESCE(p_gtin, gtin),
      active = TRUE
    WHERE id = v_batch_id;
  END IF;

  INSERT INTO pharmacy_stock_movements (
    stock_item_id,
    clinic_id,
    movement_type,
    quantity_delta,
    recorded_by,
    batch_number,
    expires_at,
    notes,
    batch_id
  ) VALUES (
    p_stock_item_id,
    p_clinic_id,
    'received',
    p_quantity,
    v_staff_id,
    v_batch_number,
    p_expires_at,
    p_notes,
    v_batch_id
  );

  RETURN v_batch_id;
END;
$$;

REVOKE ALL ON FUNCTION rpc_upsert_pharmacy_batch_on_receive(
  UUID, UUID, NUMERIC, TEXT, DATE, TEXT, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_upsert_pharmacy_batch_on_receive(
  UUID, UUID, NUMERIC, TEXT, DATE, TEXT, TEXT, TEXT
) TO authenticated, service_role;

-- =============================================================================
-- 9. rpc_complete_pharmacy_dispense — FEFO batch decrement via movement trigger
-- =============================================================================
-- Re-create of 092 with batch_id support. Removes the redundant direct item
-- UPDATE (trigger is the single writer). When the client omits batch_id, FEFO
-- picks the earliest-expiring batch with sufficient quantity; if none, falls
-- back to legacy aggregate decrement (batch_id NULL).

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
    v_batch_id := NULLIF(v_line->>'batch_id', '')::uuid;
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION rpc_complete_pharmacy_dispense(UUID, JSONB, TEXT, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_complete_pharmacy_dispense(UUID, JSONB, TEXT, UUID, UUID)
  TO authenticated, service_role;

COMMIT;
