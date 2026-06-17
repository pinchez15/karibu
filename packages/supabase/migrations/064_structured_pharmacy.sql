-- 064_structured_pharmacy.sql
--
-- Structured prescriptions + per-line dispense records (hc3-rollout-plan §6c).
-- Replaces visit-level free-text as pharmacy source of truth while keeping
-- visits.medications as a human-readable summary for print/chart.
--
-- All writes go through SECURITY DEFINER RPCs (EHR pivot rule).

BEGIN;

-- =============================================================================
-- 1. medication_catalog — national HC III formulary reference
-- =============================================================================

CREATE TABLE IF NOT EXISTS medication_catalog (
  code TEXT PRIMARY KEY,
  generic_name TEXT NOT NULL,
  strength TEXT,
  formulation TEXT,
  unit TEXT,
  category TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  default_price_ugx INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO medication_catalog (code, generic_name, strength, formulation, unit, category)
VALUES
  ('AL', 'Artemether/Lumefantrine (AL)', '20/120 mg', 'tablet', 'tab', 'Antimalarials'),
  ('ARTESUNATE', 'Artesunate (IV/IM)', '60mg', 'injection', 'vial', 'Antimalarials'),
  ('DHA_PPQ', 'Dihydroartemisinin/Piperaquine', '40/320 mg', 'tablet', 'tab', 'Antimalarials'),
  ('AMOX', 'Amoxicillin', NULL, 'capsule', 'cap', 'Antibiotics'),
  ('AMOX_CLAV', 'Amoxicillin / Clavulanic acid', NULL, 'tablet', 'tab', 'Antibiotics'),
  ('COTRIM', 'Cotrimoxazole', NULL, 'tablet', 'tab', 'Antibiotics'),
  ('CIPRO', 'Ciprofloxacin', NULL, 'tablet', 'tab', 'Antibiotics'),
  ('ERYTHRO', 'Erythromycin', NULL, 'tablet', 'tab', 'Antibiotics'),
  ('METRO', 'Metronidazole', NULL, 'tablet', 'tab', 'Antibiotics'),
  ('PARA', 'Paracetamol', NULL, 'tablet', 'tab', 'Analgesics'),
  ('IBU', 'Ibuprofen', NULL, 'tablet', 'tab', 'Analgesics'),
  ('ORS', 'ORS (oral rehydration salts)', NULL, 'sachet', 'sachet', 'Fluids'),
  ('ZINC', 'Zinc sulfate', NULL, 'tablet', 'tab', 'Supplements'),
  ('IRON_FOLATE', 'Iron + folic acid', NULL, 'tablet', 'tab', 'Supplements'),
  ('MEBEND', 'Mebendazole', NULL, 'tablet', 'tab', 'Anthelmintics'),
  ('ALBEND', 'Albendazole', NULL, 'tablet', 'tab', 'Anthelmintics'),
  ('PROMETH', 'Promethazine', NULL, 'tablet', 'tab', 'Antihistamines'),
  ('HCTZ', 'Hydrochlorothiazide', NULL, 'tablet', 'tab', 'Cardiovascular'),
  ('NIFED', 'Nifedipine', NULL, 'tablet', 'tab', 'Cardiovascular'),
  ('METHYL', 'Methyldopa', NULL, 'tablet', 'tab', 'Cardiovascular'),
  ('SALB', 'Salbutamol', NULL, 'inhaler', 'dose', 'Respiratory'),
  ('OXY', 'Oxytocin (IV/IM)', '10IU/mL', 'injection', 'vial', 'Obstetrics'),
  ('MGSO4', 'Magnesium sulfate', '50%', 'injection', 'vial', 'Obstetrics'),
  ('TT', 'Tetanus toxoid (TT)', '0.5mL', 'injection', 'dose', 'Vaccines'),
  ('VIT_A', 'Vitamin A', NULL, 'capsule', 'cap', 'Supplements')
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- 2. prescription_orders
-- =============================================================================

CREATE TABLE IF NOT EXISTS prescription_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  medication_code TEXT REFERENCES medication_catalog(code),
  free_text_name TEXT,
  dose_text TEXT,
  route_text TEXT,
  frequency_text TEXT,
  duration_text TEXT,
  quantity_prescribed NUMERIC(10, 2),
  quantity_unit TEXT,
  status TEXT NOT NULL DEFAULT 'ordered'
    CHECK (status IN (
      'ordered', 'dispensing', 'dispensed', 'partially_dispensed',
      'out_of_stock', 'cancelled', 'needs_clarification'
    )),
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'manual_confirmed', 'ai_suggested', 'legacy_text')),
  ordered_by UUID REFERENCES staff(id),
  ordered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  CONSTRAINT prescription_orders_has_name CHECK (
    medication_code IS NOT NULL OR NULLIF(TRIM(free_text_name), '') IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_prescription_orders_visit
  ON prescription_orders (visit_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_prescription_orders_clinic_status
  ON prescription_orders (clinic_id, status);

ALTER TABLE prescription_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prescription_orders_select ON prescription_orders;
CREATE POLICY prescription_orders_select ON prescription_orders
  FOR SELECT USING (clinic_id = get_current_clinic_id());

-- =============================================================================
-- 3. dispense_records
-- =============================================================================

CREATE TABLE IF NOT EXISTS dispense_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_order_id UUID NOT NULL REFERENCES prescription_orders(id) ON DELETE CASCADE,
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  dispensed_by UUID NOT NULL REFERENCES staff(id),
  quantity_dispensed NUMERIC(10, 2),
  quantity_unit TEXT,
  line_status TEXT NOT NULL
    CHECK (line_status IN ('dispensed', 'partially_dispensed', 'out_of_stock')),
  substitute_medication_code TEXT REFERENCES medication_catalog(code),
  stock_item_id UUID REFERENCES pharmacy_stock_items(id) ON DELETE SET NULL,
  stock_movement_id UUID REFERENCES pharmacy_stock_movements(id) ON DELETE SET NULL,
  notes TEXT,
  dispensed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dispense_records_prescription
  ON dispense_records (prescription_order_id);

CREATE INDEX IF NOT EXISTS idx_dispense_records_visit
  ON dispense_records (visit_id, dispensed_at DESC);

ALTER TABLE dispense_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dispense_records_select ON dispense_records;
CREATE POLICY dispense_records_select ON dispense_records
  FOR SELECT USING (clinic_id = get_current_clinic_id());

-- Link stock movements back to prescription lines when present.
ALTER TABLE pharmacy_stock_movements
  ADD COLUMN IF NOT EXISTS prescription_order_id UUID
    REFERENCES prescription_orders(id) ON DELETE SET NULL;

-- =============================================================================
-- 4. Helpers
-- =============================================================================

CREATE OR REPLACE FUNCTION aggregate_visit_dispensing_status(p_visit_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_total INT;
  v_dispensed INT;
  v_partial INT;
  v_oos INT;
  v_needs_clar INT;
BEGIN
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'dispensed'),
    COUNT(*) FILTER (WHERE status = 'partially_dispensed'),
    COUNT(*) FILTER (WHERE status = 'out_of_stock'),
    COUNT(*) FILTER (WHERE status = 'needs_clarification')
  INTO v_total, v_dispensed, v_partial, v_oos, v_needs_clar
  FROM prescription_orders
  WHERE visit_id = p_visit_id
    AND status <> 'cancelled';

  IF v_total = 0 THEN
    RETURN 'not_started';
  END IF;

  IF v_needs_clar > 0 THEN
    RETURN 'not_started';
  END IF;

  IF v_dispensed = v_total THEN
    RETURN 'dispensed';
  END IF;

  IF v_oos = v_total THEN
    RETURN 'out_of_stock';
  END IF;

  IF v_dispensed > 0 OR v_partial > 0 OR v_oos > 0 THEN
    RETURN 'partial';
  END IF;

  RETURN 'in_progress';
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION format_prescription_line_summary(
  p_medication_code TEXT,
  p_free_text_name TEXT,
  p_dose_text TEXT,
  p_route_text TEXT,
  p_frequency_text TEXT,
  p_duration_text TEXT,
  p_quantity_prescribed NUMERIC,
  p_quantity_unit TEXT
) RETURNS TEXT AS $$
DECLARE
  v_name TEXT;
  v_parts TEXT[];
BEGIN
  v_name := COALESCE(
    NULLIF(TRIM(p_free_text_name), ''),
    (SELECT generic_name FROM medication_catalog WHERE code = p_medication_code)
  );
  IF v_name IS NULL THEN
    v_name := COALESCE(p_medication_code, 'Medication');
  END IF;

  v_parts := ARRAY[v_name];
  IF NULLIF(TRIM(p_dose_text), '') IS NOT NULL THEN
    v_parts := v_parts || TRIM(p_dose_text);
  END IF;
  IF p_quantity_prescribed IS NOT NULL AND NULLIF(TRIM(p_quantity_unit), '') IS NOT NULL THEN
    v_parts := v_parts || (TRIM(to_char(p_quantity_prescribed, 'FM999990.##')) || ' ' || TRIM(p_quantity_unit));
  END IF;
  IF NULLIF(TRIM(p_route_text), '') IS NOT NULL THEN
    v_parts := v_parts || TRIM(p_route_text);
  END IF;
  IF NULLIF(TRIM(p_frequency_text), '') IS NOT NULL THEN
    v_parts := v_parts || TRIM(p_frequency_text);
  END IF;
  IF NULLIF(TRIM(p_duration_text), '') IS NOT NULL THEN
    v_parts := v_parts || TRIM(p_duration_text);
  END IF;

  RETURN array_to_string(v_parts, ' ');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION rebuild_visit_medications_summary(p_visit_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_summary TEXT;
BEGIN
  SELECT string_agg(
    format_prescription_line_summary(
      medication_code, free_text_name, dose_text, route_text,
      frequency_text, duration_text, quantity_prescribed, quantity_unit
    ),
    E'\n'
    ORDER BY sort_order, ordered_at, id
  )
  INTO v_summary
  FROM prescription_orders
  WHERE visit_id = p_visit_id
    AND status <> 'cancelled';

  RETURN NULLIF(TRIM(v_summary), '');
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- 5. rpc_submit_pharmacy_order — structured lines + legacy text fallback
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

  UPDATE visits
  SET
    medications = v_summary,
    pharmacy_order_submitted_at = NOW(),
    pharmacy_order_submitted_by = COALESCE(get_current_staff_id(), pharmacy_order_submitted_by),
    dispensing_status = CASE
      WHEN dispensing_status IN ('dispensed') THEN dispensing_status
      ELSE 'not_started'
    END,
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

-- =============================================================================
-- 6. rpc_start_pharmacy_dispense
-- =============================================================================

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

  IF get_current_staff_role() NOT IN ('admin', 'dispenser') THEN
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

-- =============================================================================
-- 7. rpc_complete_pharmacy_dispense — per-line outcomes + stock atomically
-- =============================================================================

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

  PERFORM sync_op_record(
    p_client_op_id, v_clinic_id, 'complete_pharmacy_dispense', 'visits', p_visit_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_complete_pharmacy_dispense(UUID, JSONB, TEXT, UUID)
  TO anon, authenticated;

-- =============================================================================
-- 8. rpc_send_pharmacy_back_to_clinician
-- =============================================================================

CREATE OR REPLACE FUNCTION rpc_send_pharmacy_back_to_clinician(
  p_visit_id UUID,
  p_reason TEXT,
  p_client_op_id UUID DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_clinic_id UUID;
  v_reason TEXT;
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

  UPDATE prescription_orders
  SET status = 'needs_clarification'
  WHERE visit_id = p_visit_id
    AND clinic_id = v_clinic_id
    AND status IN ('ordered', 'dispensing', 'partially_dispensed', 'out_of_stock');

  UPDATE visits
  SET
    dispensing_status = 'not_started',
    dispense_notes = v_reason,
    updated_at = NOW()
  WHERE id = p_visit_id AND clinic_id = v_clinic_id;

  PERFORM sync_op_record(
    p_client_op_id, v_clinic_id, 'send_pharmacy_back', 'visits', p_visit_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_send_pharmacy_back_to_clinician(UUID, TEXT, UUID)
  TO anon, authenticated;

-- Keep visit-level quick actions for backward compatibility during rollout.
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

-- =============================================================================
-- 9. Backfill in-flight queue visits from legacy medications text
-- =============================================================================

INSERT INTO prescription_orders (
  visit_id, clinic_id, patient_id, sort_order, free_text_name, status, source, ordered_by, ordered_at
)
SELECT
  v.id,
  v.clinic_id,
  v.patient_id,
  (row_number() OVER (PARTITION BY v.id ORDER BY ord) - 1)::int,
  TRIM(line),
  'ordered',
  'legacy_text',
  v.pharmacy_order_submitted_by,
  COALESCE(v.pharmacy_order_submitted_at, v.updated_at)
FROM visits v
CROSS JOIN LATERAL unnest(string_to_array(v.medications, E'\n')) WITH ORDINALITY AS t(line, ord)
WHERE v.pharmacy_order_submitted_at IS NOT NULL
  AND NULLIF(TRIM(v.medications), '') IS NOT NULL
  AND v.dispensing_status IN ('not_started', 'in_progress', 'partial', 'out_of_stock')
  AND NOT EXISTS (
    SELECT 1 FROM prescription_orders po WHERE po.visit_id = v.id
  )
  AND NULLIF(TRIM(line), '') IS NOT NULL;

COMMIT;
