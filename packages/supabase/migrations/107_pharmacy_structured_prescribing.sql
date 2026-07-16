-- 107_pharmacy_structured_prescribing.sql (PHARM-4 backend)
--
-- Structured course-of-treatment prescribing + computed quantity + the
-- AI-prescribing gate (§0 invariant). Additive only — no destructive rewrite.
--
-- COORDINATION NOTE (read before merging):
--   * PHARM-5's backend branch was expected to land as migration 106 (adding
--     `dispense_records.prescribed_equivalent` per spec R1 and
--     `PharmacyQueueTab.partial`). At the time this migration was authored the
--     PHARM-5 branch pointed at the same commit as main (no 106, no
--     prescribed_equivalent column). To stay self-sufficient, this migration
--     adds `prescribed_equivalent` with ADD COLUMN IF NOT EXISTS — a no-op if
--     PHARM-5 (106) already created it. 107 was kept > 106 so PHARM-5 can still
--     claim 106 without collision.
--   * The AI gate here re-creates rpc_submit_pharmacy_order. Its live body is in
--     101_replay_tolerance.sql:149 (gate-first ordering + aggregate status).
--     This file reproduces that body verbatim and ADDS the source gate +
--     structured columns. If you edit rpc_submit_pharmacy_order elsewhere,
--     reconcile with this version (whichever migration applies last wins).
--   * Inpatient medication_orders (054/074) is OUT OF SCOPE — untouched.

BEGIN;

-- =============================================================================
-- 1. Structured columns on prescription_orders (additive; *_text retained but
--    become DERIVED — assembled from these fields for print/summary).
-- =============================================================================

ALTER TABLE prescription_orders
  ADD COLUMN IF NOT EXISTS frequency_code TEXT
    CHECK (frequency_code IS NULL OR frequency_code IN (
      'OD','BID','TID','QID','Q4H','Q6H','Q8H','Q12H','HS','STAT','PRN','AC','PC'
    )),
  ADD COLUMN IF NOT EXISTS frequency_per_day INT,
  ADD COLUMN IF NOT EXISTS duration_days INT
    CHECK (duration_days IS NULL OR duration_days > 0),
  ADD COLUMN IF NOT EXISTS dose_amount NUMERIC(12, 3)
    CHECK (dose_amount IS NULL OR dose_amount > 0),
  ADD COLUMN IF NOT EXISTS dose_unit TEXT
    CHECK (dose_unit IS NULL OR dose_unit IN ('mg','mL','tab','cap','drop','puff')),
  ADD COLUMN IF NOT EXISTS strength_amount NUMERIC(12, 3)
    CHECK (strength_amount IS NULL OR strength_amount > 0),
  ADD COLUMN IF NOT EXISTS strength_unit TEXT,
  ADD COLUMN IF NOT EXISTS form TEXT,
  ADD COLUMN IF NOT EXISTS order_mode TEXT
    CHECK (order_mode IS NULL OR order_mode IN ('scheduled','fixed_quantity')),
  ADD COLUMN IF NOT EXISTS quantity_source TEXT
    CHECK (quantity_source IS NULL OR quantity_source IN ('computed','overridden')),
  ADD COLUMN IF NOT EXISTS dispense_unit TEXT
    CHECK (dispense_unit IS NULL OR dispense_unit IN (
      'tab','cap','mL','bottle','inhaler','sachet','vial','drop','puff','dose'
    ));

-- R1 / spec §R1: dispense accounting runs on prescribed-equivalents (converted
-- to the ORIGINAL prescribed dispense unit) so substitution by strength doesn't
-- break the over-dispense guard or completion math. PHARM-5 owns this column;
-- added defensively here so the dispensed-so-far view is valid standalone.
ALTER TABLE dispense_records
  ADD COLUMN IF NOT EXISTS prescribed_equivalent NUMERIC(10, 2);

COMMENT ON COLUMN dispense_records.prescribed_equivalent IS
  'Quantity converted to the ORIGINAL prescribed dispense unit via the strength ratio. When no substitution, equals quantity_dispensed. Completion/over-dispense math runs on this (spec R1). Nullable for legacy rows.';

-- =============================================================================
-- 2. frequency_code -> frequency_per_day (mirror of pharmacy-catalog.ts).
--    STAT maps to 1 (one dose); PRN is not schedulable (NULL).
-- =============================================================================

CREATE OR REPLACE FUNCTION prescription_frequency_per_day(p_code TEXT)
RETURNS INT AS $$
BEGIN
  RETURN CASE UPPER(TRIM(COALESCE(p_code, '')))
    WHEN 'OD'   THEN 1
    WHEN 'BID'  THEN 2
    WHEN 'TID'  THEN 3
    WHEN 'QID'  THEN 4
    WHEN 'Q4H'  THEN 6
    WHEN 'Q6H'  THEN 4
    WHEN 'Q8H'  THEN 3
    WHEN 'Q12H' THEN 2
    WHEN 'HS'   THEN 1
    WHEN 'AC'   THEN 3
    WHEN 'PC'   THEN 3
    WHEN 'STAT' THEN 1
    ELSE NULL  -- PRN and unknown codes
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =============================================================================
-- 3. Derived *_text from structured fields (print/summary source).
--    format_prescription_line_summary is re-created with the structured fields
--    appended; it prefers structured values and falls back to *_text for legacy
--    rows. rebuild_visit_medications_summary passes the structured columns.
-- =============================================================================

-- Assemble the dose fragment ("500 mg", "1 tab", "10 mL") from structured
-- fields, falling back to the free-text dose.
CREATE OR REPLACE FUNCTION derive_prescription_dose_text(
  p_dose_amount NUMERIC,
  p_dose_unit TEXT,
  p_dose_text TEXT
) RETURNS TEXT AS $$
BEGIN
  IF p_dose_amount IS NOT NULL AND NULLIF(TRIM(p_dose_unit), '') IS NOT NULL THEN
    RETURN TRIM(to_char(p_dose_amount, 'FM999990.###')) || ' ' || TRIM(p_dose_unit);
  END IF;
  RETURN NULLIF(TRIM(p_dose_text), '');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Assemble the duration fragment ("5 days" / "PRN"), falling back to free text.
CREATE OR REPLACE FUNCTION derive_prescription_duration_text(
  p_duration_days INT,
  p_order_mode TEXT,
  p_frequency_code TEXT,
  p_duration_text TEXT
) RETURNS TEXT AS $$
BEGIN
  IF p_order_mode = 'fixed_quantity' OR UPPER(TRIM(COALESCE(p_frequency_code, ''))) = 'PRN' THEN
    RETURN 'PRN';
  END IF;
  IF p_duration_days IS NOT NULL THEN
    RETURN p_duration_days || ' day' || CASE WHEN p_duration_days = 1 THEN '' ELSE 's' END;
  END IF;
  RETURN NULLIF(TRIM(p_duration_text), '');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

DROP FUNCTION IF EXISTS format_prescription_line_summary(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT
);

CREATE OR REPLACE FUNCTION format_prescription_line_summary(
  p_medication_code TEXT,
  p_free_text_name TEXT,
  p_dose_text TEXT,
  p_route_text TEXT,
  p_frequency_text TEXT,
  p_duration_text TEXT,
  p_quantity_prescribed NUMERIC,
  p_quantity_unit TEXT,
  -- Structured fields (preferred when present; NULL for legacy rows).
  p_dose_amount NUMERIC DEFAULT NULL,
  p_dose_unit TEXT DEFAULT NULL,
  p_frequency_code TEXT DEFAULT NULL,
  p_duration_days INT DEFAULT NULL,
  p_order_mode TEXT DEFAULT NULL,
  p_dispense_unit TEXT DEFAULT NULL
) RETURNS TEXT AS $$
DECLARE
  v_name TEXT;
  v_parts TEXT[];
  v_dose TEXT;
  v_freq TEXT;
  v_duration TEXT;
  v_qty_unit TEXT;
BEGIN
  v_name := COALESCE(
    NULLIF(TRIM(p_free_text_name), ''),
    (SELECT generic_name FROM medication_catalog WHERE code = p_medication_code)
  );
  IF v_name IS NULL THEN
    v_name := COALESCE(p_medication_code, 'Medication');
  END IF;

  -- Prefer structured fields; fall back to *_text for legacy rows.
  v_dose := derive_prescription_dose_text(p_dose_amount, p_dose_unit, p_dose_text);
  v_freq := COALESCE(NULLIF(TRIM(p_frequency_code), ''), NULLIF(TRIM(p_frequency_text), ''));
  v_duration := derive_prescription_duration_text(
    p_duration_days, p_order_mode, p_frequency_code, p_duration_text
  );
  v_qty_unit := COALESCE(NULLIF(TRIM(p_dispense_unit), ''), NULLIF(TRIM(p_quantity_unit), ''));

  v_parts := ARRAY[v_name];
  IF v_dose IS NOT NULL THEN
    v_parts := v_parts || v_dose;
  END IF;
  IF p_quantity_prescribed IS NOT NULL AND v_qty_unit IS NOT NULL THEN
    v_parts := v_parts || (TRIM(to_char(p_quantity_prescribed, 'FM999990.##')) || ' ' || v_qty_unit);
  END IF;
  IF NULLIF(TRIM(p_route_text), '') IS NOT NULL THEN
    v_parts := v_parts || TRIM(p_route_text);
  END IF;
  IF v_freq IS NOT NULL THEN
    v_parts := v_parts || v_freq;
  END IF;
  IF v_duration IS NOT NULL THEN
    v_parts := v_parts || v_duration;
  END IF;

  RETURN array_to_string(v_parts, ' ');
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION rebuild_visit_medications_summary(p_visit_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_summary TEXT;
BEGIN
  SELECT string_agg(
    format_prescription_line_summary(
      medication_code, free_text_name, dose_text, route_text,
      frequency_text, duration_text, quantity_prescribed, quantity_unit,
      dose_amount, dose_unit, frequency_code, duration_days, order_mode, dispense_unit
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
-- 4. rpc_submit_pharmacy_order — AI gate (§0) + structured lines.
--    Signature UNCHANGED (R4): all new fields ride inside p_lines JSONB.
--    Body reproduced from 101_replay_tolerance.sql:149 with the source gate,
--    structured columns, and derived *_text added.
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
  v_source TEXT;
  v_freq_code TEXT;
  v_order_mode TEXT;
  v_duration_days INT;
  v_dose_amount NUMERIC;
  v_dose_unit TEXT;
  v_dispense_unit TEXT;
BEGIN
  SELECT clinic_id, patient_id INTO v_clinic_id, v_patient_id
  FROM visits WHERE id = p_visit_id;

  IF v_clinic_id IS NOT NULL THEN
    PERFORM assert_staff_in_clinic(v_clinic_id);
  END IF;

  IF sync_op_already_applied(p_client_op_id) THEN
    RETURN;
  END IF;

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Visit not found';
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

  IF EXISTS (
    SELECT 1 FROM visits
    WHERE id = p_visit_id
      AND clinic_id = v_clinic_id
      AND dispensing_status IN ('dispensed')
  ) THEN
    RAISE EXCEPTION 'Cannot resubmit pharmacy order after full dispense';
  END IF;

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

      -- ------------------------------------------------------------------
      -- §0 INVARIANT — the AI has recording power, not prescribing power.
      -- This is the true barrier (RLS is SELECT-only on prescription_orders,
      -- so the RPC is the sole write path). Reject any line whose source is
      -- not a human-entered value. ai_suggested / manual_confirmed are
      -- retired from the writable set; the DB CHECK may keep them for
      -- historical rows, but NO client may write them.
      -- ------------------------------------------------------------------
      v_source := COALESCE(NULLIF(TRIM(v_line->>'source'), ''), 'manual');
      IF v_source NOT IN ('manual', 'legacy_text') THEN
        RAISE EXCEPTION
          'AI-suggested lines cannot be submitted to pharmacy (source: %)', v_source
          USING ERRCODE = 'P0001';
      END IF;

      v_freq_code := UPPER(NULLIF(TRIM(v_line->>'frequency_code'), ''));
      v_order_mode := NULLIF(TRIM(v_line->>'order_mode'), '');
      v_duration_days := NULLIF(v_line->>'duration_days', '')::int;
      v_dose_amount := NULLIF(v_line->>'dose_amount', '')::numeric;
      v_dose_unit := NULLIF(TRIM(v_line->>'dose_unit'), '');
      v_dispense_unit := NULLIF(TRIM(v_line->>'dispense_unit'), '');

      INSERT INTO prescription_orders (
        visit_id, clinic_id, patient_id, sort_order,
        medication_code, free_text_name,
        dose_text, route_text, frequency_text, duration_text,
        quantity_prescribed, quantity_unit,
        frequency_code, frequency_per_day, duration_days,
        dose_amount, dose_unit, strength_amount, strength_unit, form,
        order_mode, quantity_source, dispense_unit,
        status, source, ordered_by, notes
      ) VALUES (
        p_visit_id, v_clinic_id, v_patient_id, v_idx,
        NULLIF(TRIM(v_line->>'medication_code'), ''),
        NULLIF(TRIM(v_line->>'free_text_name'), ''),
        -- *_text derived from structured fields, falling back to any provided text.
        derive_prescription_dose_text(v_dose_amount, v_dose_unit, v_line->>'dose_text'),
        NULLIF(TRIM(v_line->>'route_text'), ''),
        COALESCE(v_freq_code, NULLIF(TRIM(v_line->>'frequency_text'), '')),
        derive_prescription_duration_text(
          v_duration_days, v_order_mode, v_freq_code, v_line->>'duration_text'
        ),
        NULLIF(v_line->>'quantity_prescribed', '')::numeric,
        COALESCE(v_dispense_unit, NULLIF(TRIM(v_line->>'quantity_unit'), '')),
        v_freq_code,
        -- frequency_per_day is DERIVED authoritatively from the code.
        prescription_frequency_per_day(v_freq_code),
        v_duration_days,
        v_dose_amount, v_dose_unit,
        NULLIF(v_line->>'strength_amount', '')::numeric,
        NULLIF(TRIM(v_line->>'strength_unit'), ''),
        NULLIF(TRIM(v_line->>'form'), ''),
        v_order_mode,
        NULLIF(TRIM(v_line->>'quantity_source'), ''),
        v_dispense_unit,
        'ordered',
        v_source,
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION rpc_submit_pharmacy_order(UUID, TEXT, JSONB, UUID)
  TO anon, authenticated;

-- =============================================================================
-- 5. prescription_orders_with_dispensed — the Android pull path exposure.
--    Adds quantity_dispensed_so_far (sum of prescribed_equivalent, falling back
--    to raw quantity_dispensed pre-substitution) per line. Agent A3 (Android
--    remainder) points its @GET at this view. security_invoker=true so the
--    querying user's RLS on prescription_orders + dispense_records applies.
-- =============================================================================

DROP VIEW IF EXISTS prescription_orders_with_dispensed;
CREATE VIEW prescription_orders_with_dispensed
WITH (security_invoker = true) AS
SELECT
  po.*,
  COALESCE((
    SELECT SUM(COALESCE(dr.prescribed_equivalent, dr.quantity_dispensed))
    FROM dispense_records dr
    WHERE dr.prescription_order_id = po.id
      AND dr.line_status IN ('dispensed', 'partially_dispensed')
  ), 0)::numeric(10, 2) AS quantity_dispensed_so_far
FROM prescription_orders po;

GRANT SELECT ON prescription_orders_with_dispensed TO anon, authenticated;

COMMENT ON VIEW prescription_orders_with_dispensed IS
  'prescription_orders + quantity_dispensed_so_far (SUM of dispense_records.prescribed_equivalent per line, dispensed+partially_dispensed). Android pull path for the remaining-balance default (spec R1/R2). security_invoker respects the caller RLS.';

COMMIT;
