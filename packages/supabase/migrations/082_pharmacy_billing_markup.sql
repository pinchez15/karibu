-- 082_pharmacy_billing_markup.sql
-- Bill patients stock unit price + configurable clinic markup (default 10%).
-- Lab charges prefer lab_stock_items.unit_price_ugx when set.

BEGIN;

ALTER TABLE clinic_billing_rates
  ADD COLUMN IF NOT EXISTS pharmacy_markup_percent INTEGER NOT NULL DEFAULT 10
    CHECK (pharmacy_markup_percent >= 0 AND pharmacy_markup_percent <= 200);

COMMENT ON COLUMN clinic_billing_rates.pharmacy_markup_percent IS
  'Percent added to pharmacy stock unit_price_ugx when raising patient charges.';

CREATE OR REPLACE FUNCTION billing_pharmacy_unit_price(p_clinic_id UUID, p_medication_code TEXT)
RETURNS INTEGER
LANGUAGE plpgsql STABLE SET search_path = public
AS $$
DECLARE
  v_cost INTEGER;
  v_markup INTEGER;
BEGIN
  SELECT COALESCE(
    (SELECT psi.unit_price_ugx FROM pharmacy_stock_items psi
     WHERE psi.clinic_id = p_clinic_id
       AND psi.drug_code = p_medication_code
       AND psi.active
       AND psi.unit_price_ugx IS NOT NULL
     ORDER BY psi.updated_at DESC LIMIT 1),
    (SELECT mc.default_price_ugx FROM medication_catalog mc WHERE mc.code = p_medication_code),
    200
  ) INTO v_cost;

  v_cost := COALESCE(v_cost, 200);

  SELECT COALESCE(pharmacy_markup_percent, 10) INTO v_markup
  FROM clinic_billing_rates
  WHERE clinic_id = p_clinic_id;

  v_markup := COALESCE(v_markup, 10);

  RETURN ROUND(v_cost * (1 + v_markup / 100.0))::INTEGER;
END;
$$;

CREATE OR REPLACE FUNCTION billing_lab_test_price(p_clinic_id UUID, p_test_name TEXT)
RETURNS INTEGER
LANGUAGE plpgsql STABLE SET search_path = public
AS $$
DECLARE v_price INTEGER;
BEGIN
  SELECT COALESCE(
    (SELECT lsi.unit_price_ugx FROM lab_stock_items lsi
     WHERE lsi.clinic_id = p_clinic_id
       AND lsi.active
       AND lsi.unit_price_ugx IS NOT NULL
       AND (
         LOWER(lsi.test_name) = LOWER(p_test_name)
         OR LOWER(COALESCE(lsi.test_code, '')) = LOWER(p_test_name)
       )
     ORDER BY lsi.updated_at DESC
     LIMIT 1),
    (SELECT l.default_price_ugx FROM lab_test_catalog l
     WHERE LOWER(l.test_name) = LOWER(p_test_name)
        OR LOWER(l.code) = LOWER(p_test_name)
     LIMIT 1),
    2000
  ) INTO v_price;

  RETURN COALESCE(v_price, 2000);
END;
$$;

COMMIT;
