-- 080_medication_catalog_formulary.sql
--
-- Consolidate prescribing formulary into medication_catalog (global reference)
-- with clinic_pharmacy_formulary as a per-clinic overlay. Enriches catalog with
-- sig metadata previously hardcoded in web/Android clients.

BEGIN;

-- =============================================================================
-- 1. Enrich medication_catalog
-- =============================================================================

ALTER TABLE medication_catalog
  ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS strengths TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS default_frequency TEXT,
  ADD COLUMN IF NOT EXISTS default_route TEXT DEFAULT 'PO',
  ADD COLUMN IF NOT EXISTS warning_text TEXT,
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 100;

-- =============================================================================
-- 2. Link clinic overlay to catalog codes
-- =============================================================================

ALTER TABLE clinic_pharmacy_formulary
  ADD COLUMN IF NOT EXISTS medication_code TEXT REFERENCES medication_catalog(code);

CREATE INDEX IF NOT EXISTS idx_clinic_pharmacy_formulary_medication_code
  ON clinic_pharmacy_formulary(clinic_id, medication_code)
  WHERE medication_code IS NOT NULL;

-- =============================================================================
-- 3. Upsert national HC III formulary (~40 drugs; expandable via migration)
-- =============================================================================

INSERT INTO medication_catalog (
  code, generic_name, strength, formulation, unit, category,
  aliases, strengths, default_frequency, default_route, warning_text, display_order, active
) VALUES
  ('AL', 'Artemether/Lumefantrine (AL)', '20/120 mg', 'tablet', 'tab', 'Antimalarials',
    ARRAY['Coartem'], ARRAY['20/120 mg'], 'BID', 'PO', NULL, 10, TRUE),
  ('ARTESUNATE', 'Artesunate (IV/IM)', '60mg', 'injection', 'vial', 'Antimalarials',
    ARRAY[]::TEXT[], ARRAY['60mg vial'], 'STAT', 'IV', 'Severe malaria only. Refer if HC III cannot administer.', 11, TRUE),
  ('DHA_PPQ', 'Dihydroartemisinin/Piperaquine', '40/320 mg', 'tablet', 'tab', 'Antimalarials',
    ARRAY[]::TEXT[], ARRAY['40/320 mg'], 'OD', 'PO', NULL, 12, TRUE),
  ('AMOX', 'Amoxicillin', NULL, 'capsule', 'cap', 'Antibiotics',
    ARRAY[]::TEXT[], ARRAY['250mg cap', '500mg cap', '125mg/5mL susp', '250mg/5mL susp'], 'TID', 'PO', NULL, 20, TRUE),
  ('AMOX_CLAV', 'Amoxicillin / Clavulanic acid', NULL, 'tablet', 'tab', 'Antibiotics',
    ARRAY[]::TEXT[], ARRAY['625mg tab', '1g tab', '228mg/5mL susp'], 'BID', 'PO', NULL, 21, TRUE),
  ('COTRIM', 'Cotrimoxazole', NULL, 'tablet', 'tab', 'Antibiotics',
    ARRAY[]::TEXT[], ARRAY['480mg tab', '960mg tab', '240mg/5mL susp'], 'BID', 'PO', NULL, 22, TRUE),
  ('CIPRO', 'Ciprofloxacin', NULL, 'tablet', 'tab', 'Antibiotics',
    ARRAY[]::TEXT[], ARRAY['250mg tab', '500mg tab'], 'BID', 'PO', NULL, 23, TRUE),
  ('METRO', 'Metronidazole', NULL, 'tablet', 'tab', 'Antibiotics',
    ARRAY[]::TEXT[], ARRAY['200mg tab', '400mg tab', '200mg/5mL susp'], 'TID', 'PO', NULL, 24, TRUE),
  ('ERY', 'Erythromycin', NULL, 'tablet', 'tab', 'Antibiotics',
    ARRAY[]::TEXT[], ARRAY['250mg tab', '125mg/5mL susp'], 'QID', 'PO', NULL, 25, TRUE),
  ('DOXY', 'Doxycycline', NULL, 'capsule', 'cap', 'Antibiotics',
    ARRAY[]::TEXT[], ARRAY['100mg cap'], 'BID', 'PO', 'Contraindicated <8y and in pregnancy.', 26, TRUE),
  ('MEBEN', 'Mebendazole', NULL, 'tablet', 'tab', 'Antihelminthics',
    ARRAY[]::TEXT[], ARRAY['100mg tab', '500mg tab'], 'STAT', 'PO', NULL, 30, TRUE),
  ('ALBEN', 'Albendazole', NULL, 'tablet', 'tab', 'Antihelminthics',
    ARRAY[]::TEXT[], ARRAY['400mg tab'], 'STAT', 'PO', NULL, 31, TRUE),
  ('PARA', 'Paracetamol', NULL, 'tablet', 'tab', 'Analgesics',
    ARRAY[]::TEXT[], ARRAY['500mg tab', '120mg/5mL susp', '250mg/5mL susp'], 'QID', 'PO', NULL, 40, TRUE),
  ('IBU', 'Ibuprofen', NULL, 'tablet', 'tab', 'Analgesics',
    ARRAY[]::TEXT[], ARRAY['200mg tab', '400mg tab', '100mg/5mL susp'], 'TID', 'PO', NULL, 41, TRUE),
  ('DICLO', 'Diclofenac', NULL, 'tablet', 'tab', 'Analgesics',
    ARRAY[]::TEXT[], ARRAY['50mg tab', '75mg IM'], 'BID', 'PO', NULL, 42, TRUE),
  ('ORS', 'ORS (oral rehydration salts)', NULL, 'sachet', 'sachet', 'Rehydration',
    ARRAY[]::TEXT[], ARRAY['1L sachet'], 'PRN', 'PO', NULL, 50, TRUE),
  ('ZINC', 'Zinc sulfate', NULL, 'tablet', 'tab', 'Supplements',
    ARRAY[]::TEXT[], ARRAY['20mg tab'], 'OD', 'PO', NULL, 51, TRUE),
  ('IRON_FOLATE', 'Iron + folic acid', NULL, 'tablet', 'tab', 'Supplements',
    ARRAY[]::TEXT[], ARRAY['60mg/0.4mg', 'tablet'], 'OD', 'PO', NULL, 52, TRUE),
  ('VITA', 'Vitamin A', NULL, 'capsule', 'cap', 'Supplements',
    ARRAY[]::TEXT[], ARRAY['100,000 IU', '200,000 IU'], 'STAT', 'PO', NULL, 53, TRUE),
  ('HCTZ', 'Hydrochlorothiazide', NULL, 'tablet', 'tab', 'Cardiovascular',
    ARRAY[]::TEXT[], ARRAY['25mg tab'], 'OD', 'PO', NULL, 60, TRUE),
  ('NIFED', 'Nifedipine (LA)', NULL, 'tablet', 'tab', 'Cardiovascular',
    ARRAY[]::TEXT[], ARRAY['20mg LA', '30mg LA'], 'BID', 'PO', NULL, 61, TRUE),
  ('METHYL', 'Methyldopa', NULL, 'tablet', 'tab', 'Cardiovascular',
    ARRAY[]::TEXT[], ARRAY['250mg tab', '500mg tab'], 'BID', 'PO', 'First-line for hypertension in pregnancy.', 62, TRUE),
  ('SALB', 'Salbutamol', NULL, 'inhaler', 'dose', 'Respiratory',
    ARRAY[]::TEXT[], ARRAY['4mg tab', '2mg/5mL syrup', '100mcg MDI', 'Neb'], 'PRN', 'Inhaled', NULL, 70, TRUE),
  ('PRED', 'Prednisolone', NULL, 'tablet', 'tab', 'Respiratory',
    ARRAY[]::TEXT[], ARRAY['5mg tab'], 'OD', 'PO', NULL, 71, TRUE),
  ('PROMETH', 'Promethazine', NULL, 'tablet', 'tab', 'Antihistamines',
    ARRAY[]::TEXT[], ARRAY['25mg tab', '5mg/5mL syrup'], 'HS', 'PO', NULL, 80, TRUE),
  ('CETIRI', 'Cetirizine', NULL, 'tablet', 'tab', 'Antihistamines',
    ARRAY[]::TEXT[], ARRAY['10mg tab', '5mg/5mL syrup'], 'OD', 'PO', NULL, 81, TRUE),
  ('OXY', 'Oxytocin (IV/IM)', '10IU/mL', 'injection', 'vial', 'Obstetrics',
    ARRAY[]::TEXT[], ARRAY['10IU/mL'], 'STAT', 'IM', 'PPH protocol — refer for ongoing infusion.', 90, TRUE),
  ('MGSO4', 'Magnesium sulfate', '50%', 'injection', 'vial', 'Obstetrics',
    ARRAY[]::TEXT[], ARRAY['50% inj'], 'STAT', 'IM', 'Eclampsia / pre-eclampsia — Pritchard regimen.', 91, TRUE),
  ('TT', 'Tetanus toxoid (TT)', '0.5mL', 'injection', 'dose', 'Vaccines',
    ARRAY[]::TEXT[], ARRAY['0.5mL'], 'STAT', 'IM', NULL, 100, TRUE)
ON CONFLICT (code) DO UPDATE SET
  generic_name = EXCLUDED.generic_name,
  strength = COALESCE(EXCLUDED.strength, medication_catalog.strength),
  formulation = EXCLUDED.formulation,
  unit = EXCLUDED.unit,
  category = EXCLUDED.category,
  aliases = EXCLUDED.aliases,
  strengths = EXCLUDED.strengths,
  default_frequency = EXCLUDED.default_frequency,
  default_route = EXCLUDED.default_route,
  warning_text = EXCLUDED.warning_text,
  display_order = EXCLUDED.display_order,
  active = EXCLUDED.active;

-- Migration 064 seeded ERYTHRO / VIT_A; 080 adds canonical ERY / VITA rows with the
-- same generic_name. Deactivate legacy codes so the catalog + formulary materialize
-- step never proposes duplicate (clinic_id, drug_name) pairs in one INSERT.
UPDATE medication_catalog
SET active = FALSE
WHERE code IN ('ERYTHRO', 'VIT_A')
  AND EXISTS (
    SELECT 1 FROM medication_catalog mc2
    WHERE mc2.code IN ('ERY', 'VITA')
      AND LOWER(TRIM(mc2.generic_name)) = LOWER(TRIM(medication_catalog.generic_name))
  );

-- Backfill overlay codes from existing code column or name match
UPDATE clinic_pharmacy_formulary cpf
SET medication_code = mc.code
FROM medication_catalog mc
WHERE cpf.medication_code IS NULL
  AND cpf.code IS NOT NULL
  AND UPPER(TRIM(cpf.code)) = mc.code;

-- Exact name match only — avoid LIKE matching multiple catalog rows per overlay row.
UPDATE clinic_pharmacy_formulary cpf
SET medication_code = mc.code
FROM medication_catalog mc
WHERE cpf.medication_code IS NULL
  AND mc.active
  AND LOWER(TRIM(cpf.drug_name)) = LOWER(TRIM(mc.generic_name));

UPDATE clinic_pharmacy_formulary cpf
SET code = medication_code
WHERE medication_code IS NOT NULL AND (code IS NULL OR code = '');

-- Materialize catalog entries for clinics missing overlay rows (opt-in by default).
-- DISTINCT ON prevents 21000 when multiple active catalog codes share a generic_name.
INSERT INTO clinic_pharmacy_formulary (
  clinic_id, drug_name, medication_code, code, category, in_stock, display_order, active
)
SELECT DISTINCT ON (c.id, LOWER(TRIM(mc.generic_name)))
  c.id,
  mc.generic_name,
  mc.code,
  mc.code,
  mc.category,
  TRUE,
  mc.display_order,
  TRUE
FROM clinics c
CROSS JOIN medication_catalog mc
WHERE mc.active
ORDER BY c.id, LOWER(TRIM(mc.generic_name)), mc.display_order, mc.code
ON CONFLICT (clinic_id, drug_name) DO UPDATE SET
  medication_code = COALESCE(clinic_pharmacy_formulary.medication_code, EXCLUDED.medication_code),
  code = COALESCE(clinic_pharmacy_formulary.code, EXCLUDED.code),
  category = COALESCE(clinic_pharmacy_formulary.category, EXCLUDED.category);

-- =============================================================================
-- 4. rpc_get_clinic_catalog — join catalog for prescribing metadata
-- =============================================================================

CREATE OR REPLACE FUNCTION rpc_get_clinic_catalog(p_clinic_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_clerk_user_id TEXT;
BEGIN
  v_clerk_user_id := auth.jwt()->>'sub';
  IF v_clerk_user_id IS NOT NULL THEN
    PERFORM assert_staff_in_clinic(p_clinic_id);
  END IF;

  RETURN jsonb_build_object(
    'labs', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'test_name', test_name,
          'code', code,
          'category', category,
          'display_order', display_order,
          'is_available', is_available AND active,
          'notes', notes
        ) ORDER BY display_order, test_name
      )
      FROM clinic_lab_capabilities
      WHERE clinic_id = p_clinic_id AND active = TRUE
    ), '[]'::jsonb),
    'formulary', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'drug_name', mc.generic_name,
          'code', mc.code,
          'category', COALESCE(cpf.category, mc.category),
          'display_order', COALESCE(cpf.display_order, mc.display_order),
          'is_available', (
            mc.active
            AND COALESCE(cpf.active, TRUE)
            AND COALESCE(cpf.in_stock, TRUE)
          ),
          'notes', cpf.notes,
          'aliases', to_jsonb(mc.aliases),
          'strengths', to_jsonb(mc.strengths),
          'default_frequency', mc.default_frequency,
          'default_route', mc.default_route,
          'warning_text', mc.warning_text,
          'formulation', mc.formulation,
          'quantity_unit', mc.unit
        ) ORDER BY COALESCE(cpf.display_order, mc.display_order), mc.generic_name
      )
      FROM medication_catalog mc
      LEFT JOIN clinic_pharmacy_formulary cpf
        ON cpf.clinic_id = p_clinic_id
       AND (
         cpf.medication_code = mc.code
         OR (cpf.medication_code IS NULL AND LOWER(TRIM(cpf.drug_name)) = LOWER(TRIM(mc.generic_name)))
       )
      WHERE mc.active
        AND NOT (
          cpf.clinic_id IS NOT NULL
          AND (cpf.active = FALSE OR cpf.in_stock = FALSE)
        )
    ), '[]'::jsonb)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Lightweight count for dashboard badge (avoids hydrating full visit rows)
CREATE OR REPLACE FUNCTION rpc_count_review_items(
  p_clinic_id UUID,
  p_from DATE,
  p_to DATE
)
RETURNS INTEGER AS $$
DECLARE
  v_unfinalized INTEGER;
  v_uncoded INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER INTO v_unfinalized
  FROM rpc_unfinalized_visits(p_clinic_id, p_from, p_to);

  SELECT COUNT(*)::INTEGER INTO v_uncoded
  FROM visits v
  WHERE v.clinic_id = p_clinic_id
    AND v.visit_date >= p_from
    AND v.visit_date <= p_to
    AND v.status IN ('sent', 'completed')
    AND NOT EXISTS (
      SELECT 1 FROM visit_diagnosis_codes vdc
      WHERE vdc.visit_id = v.id
        AND vdc.source IN ('manual', 'ai_confirmed')
    );

  RETURN COALESCE(v_unfinalized, 0) + COALESCE(v_uncoded, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION rpc_count_review_items(UUID, DATE, DATE) TO authenticated, service_role;

COMMIT;
