-- 076_billing_itemized.sql
--
-- Itemized billing: catalog prices (UGX), per-patient bills from care delivered,
-- void charges, partial/split payments (cash + barter).

-- ── 1. National lab price list (HC III defaults; diocese RDT = UGX 1,500) ───
ALTER TABLE lab_test_catalog
  ADD COLUMN IF NOT EXISTS default_price_ugx INTEGER NOT NULL DEFAULT 0;

UPDATE lab_test_catalog SET default_price_ugx = CASE code
  WHEN 'MRDT'       THEN 1500
  WHEN 'BS_MPS'     THEN 3000
  WHEN 'HIV_RDT'    THEN 2000
  WHEN 'HB'         THEN 3500
  WHEN 'AFB'        THEN 4000
  WHEN 'URINALYSIS' THEN 2500
  WHEN 'STOOL_OC'   THEN 3000
  WHEN 'RBS'        THEN 2500
  WHEN 'SYPHILIS'   THEN 3000
  WHEN 'UCG'        THEN 2000
  WHEN 'WIDAL'      THEN 3500
  WHEN 'STOOL_RDT'  THEN 2500
  ELSE default_price_ugx
END;

-- ── 2. Consultation fee per clinic ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clinic_billing_rates (
  clinic_id UUID PRIMARY KEY REFERENCES clinics(id) ON DELETE CASCADE,
  consultation_fee_ugx INTEGER NOT NULL DEFAULT 5000 CHECK (consultation_fee_ugx >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO clinic_billing_rates (clinic_id, consultation_fee_ugx)
SELECT id, 5000 FROM clinics
ON CONFLICT (clinic_id) DO NOTHING;

-- ── 3. Medication catalog unit prices (per tablet/cap/dose) ──────────────────
UPDATE medication_catalog SET default_price_ugx = CASE code
  WHEN 'AL'          THEN 500
  WHEN 'ARTESUNATE'  THEN 8000
  WHEN 'DHA_PPQ'     THEN 600
  WHEN 'AMOX'        THEN 200
  WHEN 'AMOX_CLAV'   THEN 400
  WHEN 'COTRIM'      THEN 150
  WHEN 'CIPRO'       THEN 300
  WHEN 'ERYTHRO'     THEN 250
  WHEN 'METRO'       THEN 200
  WHEN 'PARA'        THEN 100
  WHEN 'IBU'         THEN 150
  WHEN 'ORS'         THEN 500
  WHEN 'ZINC'        THEN 100
  WHEN 'IRON_FOLATE' THEN 100
  WHEN 'MEBEND'      THEN 200
  WHEN 'ALBEND'      THEN 200
  WHEN 'PROMETH'     THEN 150
  WHEN 'HCTZ'        THEN 100
  WHEN 'NIFED'       THEN 200
  WHEN 'METHYL'      THEN 150
  WHEN 'SALB'        THEN 500
  WHEN 'OXY'         THEN 5000
  WHEN 'MGSO4'       THEN 3000
  WHEN 'TT'          THEN 2000
  WHEN 'VIT_A'       THEN 300
  ELSE COALESCE(default_price_ugx, 200)
END
WHERE default_price_ugx IS NULL OR default_price_ugx = 0;

-- ── 4. Itemized charge lines ─────────────────────────────────────────────────
ALTER TABLE charges
  ADD COLUMN IF NOT EXISTS quantity NUMERIC(10, 2) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS unit_price_ugx INTEGER,
  ADD COLUMN IF NOT EXISTS item_code TEXT;

-- Backfill unit_price from total where missing.
UPDATE charges
SET unit_price_ugx = amount_ugx
WHERE unit_price_ugx IS NULL;

-- ── 5. Payments: barter + patient-level (visit optional) ─────────────────────
ALTER TABLE payments
  ALTER COLUMN visit_id DROP NOT NULL;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS amount_barter_ugx INTEGER NOT NULL DEFAULT 0 CHECK (amount_barter_ugx >= 0),
  ADD COLUMN IF NOT EXISTS barter_description TEXT;

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_payment_method_check;
ALTER TABLE payments ADD CONSTRAINT payments_payment_method_check
  CHECK (payment_method IN ('cash', 'mtn_momo', 'airtel_money', 'barter', 'mixed'));

-- ── 6. Void a charge (soft delete) ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_void_charge(p_charge_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_clinic_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM charges WHERE id = p_charge_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Charge not found'; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  IF NOT is_admin() THEN RAISE EXCEPTION 'Admin only'; END IF;
  UPDATE charges SET voided = TRUE WHERE id = p_charge_id;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_void_charge(UUID) TO authenticated, service_role;

-- ── 7. Patient balance (cash + barter credit) ────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_patient_balance(p_clinic_id UUID, p_patient_id UUID)
RETURNS TABLE (charged BIGINT, paid BIGINT, balance BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);
  RETURN QUERY
  SELECT
    COALESCE((SELECT SUM(amount_ugx) FROM charges c
              WHERE c.clinic_id = p_clinic_id AND c.patient_id = p_patient_id AND NOT c.voided), 0)::BIGINT,
    COALESCE((SELECT SUM(amount_ugx + COALESCE(amount_barter_ugx, 0)) FROM payments pm
              WHERE pm.clinic_id = p_clinic_id AND pm.patient_id = p_patient_id AND pm.status = 'paid'), 0)::BIGINT,
    (COALESCE((SELECT SUM(amount_ugx) FROM charges c
               WHERE c.clinic_id = p_clinic_id AND c.patient_id = p_patient_id AND NOT c.voided), 0)
     - COALESCE((SELECT SUM(amount_ugx + COALESCE(amount_barter_ugx, 0)) FROM payments pm
                 WHERE pm.clinic_id = p_clinic_id AND pm.patient_id = p_patient_id AND pm.status = 'paid'), 0))::BIGINT;
END;
$$;

-- ── 8. Record payment at patient level (partial / barter / mixed) ────────────
CREATE OR REPLACE FUNCTION rpc_record_billing_payment(
  p_clinic_id UUID,
  p_patient_id UUID,
  p_amount_cash_ugx INTEGER,
  p_payment_method TEXT,
  p_visit_id UUID DEFAULT NULL,
  p_amount_barter_ugx INTEGER DEFAULT 0,
  p_barter_description TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id UUID := gen_random_uuid();
  v_row payments%ROWTYPE;
  v_collected_by UUID;
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);
  IF NOT is_admin() THEN RAISE EXCEPTION 'Billing is admin-only'; END IF;

  IF p_amount_cash_ugx < 0 OR COALESCE(p_amount_barter_ugx, 0) < 0 THEN
    RAISE EXCEPTION 'Amounts must be non-negative';
  END IF;
  IF (p_amount_cash_ugx + COALESCE(p_amount_barter_ugx, 0)) <= 0 THEN
    RAISE EXCEPTION 'Payment total must be positive';
  END IF;
  IF p_payment_method NOT IN ('cash', 'mtn_momo', 'airtel_money', 'barter', 'mixed') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;
  IF p_payment_method IN ('barter', 'mixed') AND COALESCE(p_amount_barter_ugx, 0) <= 0 THEN
    RAISE EXCEPTION 'Barter amount required';
  END IF;

  v_collected_by := get_current_staff_id();
  IF v_collected_by IS NULL THEN RAISE EXCEPTION 'collected_by required'; END IF;

  INSERT INTO payments (
    id, visit_id, clinic_id, patient_id,
    amount_ugx, amount_barter_ugx, barter_description,
    payment_method, status, notes, collected_by
  ) VALUES (
    v_id, p_visit_id, p_clinic_id, p_patient_id,
    p_amount_cash_ugx, COALESCE(p_amount_barter_ugx, 0), p_barter_description,
    p_payment_method, 'paid', p_notes, v_collected_by
  );

  SELECT * INTO v_row FROM payments WHERE id = v_id;
  RETURN jsonb_build_object('id', v_row.id, 'receipt_number', v_row.receipt_number);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_record_billing_payment(
  UUID, UUID, INTEGER, TEXT, UUID, INTEGER, TEXT, TEXT
) TO authenticated, service_role;

-- ── 9. Auto-compose charges from a visit's care ──────────────────────────────
CREATE OR REPLACE FUNCTION rpc_generate_charges_from_visit(p_visit_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_visit RECORD;
  v_fee INTEGER;
  v_added INTEGER := 0;
  v_lab JSONB;
  v_test TEXT;
  v_price INTEGER;
  v_po RECORD;
  v_unit_price INTEGER;
  v_qty NUMERIC;
  v_name TEXT;
BEGIN
  SELECT * INTO v_visit FROM visits WHERE id = p_visit_id;

  IF v_visit.id IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;
  PERFORM assert_staff_in_clinic(v_visit.clinic_id);
  IF NOT is_admin() THEN RAISE EXCEPTION 'Admin only'; END IF;

  SELECT consultation_fee_ugx INTO v_fee
  FROM clinic_billing_rates WHERE clinic_id = v_visit.clinic_id;
  v_fee := COALESCE(v_fee, 5000);

  IF NOT EXISTS (
    SELECT 1 FROM charges
    WHERE visit_id = p_visit_id AND category = 'consultation' AND NOT voided
  ) THEN
    INSERT INTO charges (
      clinic_id, patient_id, visit_id, description, category, amount_ugx,
      quantity, unit_price_ugx, source, created_by
    ) VALUES (
      v_visit.clinic_id, v_visit.patient_id, p_visit_id,
      'OPD consultation', 'consultation', v_fee,
      1, v_fee, 'consultation', get_current_staff_id()
    );
    v_added := v_added + 1;
  END IF;

  FOR v_lab IN
    SELECT elem FROM jsonb_array_elements(COALESCE(v_visit.lab_test_results, '[]'::jsonb)) AS elem
    WHERE elem->>'status' IN ('done', 'abnormal')
  LOOP
    v_test := v_lab.elem->>'test';
    IF v_test IS NULL OR TRIM(v_test) = '' THEN CONTINUE; END IF;

    IF EXISTS (
      SELECT 1 FROM charges
      WHERE visit_id = p_visit_id AND category = 'lab'
        AND description = v_test AND NOT voided
    ) THEN CONTINUE; END IF;

    SELECT COALESCE(l.default_price_ugx, 2000) INTO v_price
    FROM lab_test_catalog l
    WHERE LOWER(l.test_name) = LOWER(v_test)
       OR LOWER(l.code) = LOWER(v_test)
    LIMIT 1;
    v_price := COALESCE(v_price, 2000);

    INSERT INTO charges (
      clinic_id, patient_id, visit_id, description, category, amount_ugx,
      quantity, unit_price_ugx, item_code, source, created_by
    ) VALUES (
      v_visit.clinic_id, v_visit.patient_id, p_visit_id,
      v_test, 'lab', v_price,
      1, v_price, NULL, 'lab', get_current_staff_id()
    );
    v_added := v_added + 1;
  END LOOP;

  FOR v_po IN
    SELECT po.*, dr.quantity_dispensed AS qty_dispensed
    FROM prescription_orders po
    LEFT JOIN LATERAL (
      SELECT SUM(quantity_dispensed) AS quantity_dispensed
      FROM dispense_records dr WHERE dr.prescription_order_id = po.id
    ) dr ON TRUE
    WHERE po.visit_id = p_visit_id
      AND po.status IN ('dispensed', 'partially_dispensed')
  LOOP
    v_qty := COALESCE(v_po.qty_dispensed, v_po.quantity_prescribed, 1);
    v_name := COALESCE(
      (SELECT generic_name FROM medication_catalog WHERE code = v_po.medication_code),
      v_po.free_text_name,
      'Medication'
    );

    IF EXISTS (
      SELECT 1 FROM charges
      WHERE visit_id = p_visit_id AND category = 'pharmacy'
        AND item_code = COALESCE(v_po.medication_code, v_po.id::text)
        AND NOT voided
    ) THEN CONTINUE; END IF;

    SELECT COALESCE(
      (SELECT psi.unit_price_ugx FROM pharmacy_stock_items psi
       WHERE psi.clinic_id = v_visit.clinic_id
         AND psi.drug_code = v_po.medication_code
         AND psi.active
       ORDER BY psi.updated_at DESC LIMIT 1),
      (SELECT mc.default_price_ugx FROM medication_catalog mc WHERE mc.code = v_po.medication_code),
      200
    ) INTO v_unit_price;

    INSERT INTO charges (
      clinic_id, patient_id, visit_id, description, category, amount_ugx,
      quantity, unit_price_ugx, item_code, source, created_by
    ) VALUES (
      v_visit.clinic_id, v_visit.patient_id, p_visit_id,
      v_name || COALESCE(' × ' || v_qty::text || ' ' || COALESCE(v_po.quantity_unit, ''), ''),
      'pharmacy',
      ROUND(v_unit_price * v_qty)::INTEGER,
      v_qty, v_unit_price, v_po.medication_code, 'pharmacy', get_current_staff_id()
    );
    v_added := v_added + 1;
  END LOOP;

  RETURN v_added;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_generate_charges_from_visit(UUID) TO authenticated, service_role;

-- ── 10. Patients with outstanding balances ─────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_billing_patient_balances(p_clinic_id UUID)
RETURNS TABLE (
  patient_id UUID,
  patient_name TEXT,
  charged BIGINT,
  paid BIGINT,
  balance BIGINT,
  last_charge_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);
  RETURN QUERY
  WITH charge_totals AS (
    SELECT c.patient_id,
           SUM(c.amount_ugx)::BIGINT AS charged,
           MAX(c.created_at) AS last_charge_at
    FROM charges c
    WHERE c.clinic_id = p_clinic_id AND NOT c.voided
    GROUP BY c.patient_id
  ),
  pay_totals AS (
    SELECT pm.patient_id,
           SUM(pm.amount_ugx + COALESCE(pm.amount_barter_ugx, 0))::BIGINT AS paid
    FROM payments pm
    WHERE pm.clinic_id = p_clinic_id AND pm.status = 'paid'
    GROUP BY pm.patient_id
  )
  SELECT
    p.id,
    TRIM(COALESCE(p.display_name, p.first_name || ' ' || p.last_name))::TEXT,
    COALESCE(ct.charged, 0),
    COALESCE(pt.paid, 0),
    COALESCE(ct.charged, 0) - COALESCE(pt.paid, 0),
    ct.last_charge_at
  FROM patients p
  LEFT JOIN charge_totals ct ON ct.patient_id = p.id
  LEFT JOIN pay_totals pt ON pt.patient_id = p.id
  WHERE p.clinic_id = p_clinic_id
    AND (COALESCE(ct.charged, 0) > 0 OR COALESCE(pt.paid, 0) > 0)
  ORDER BY (COALESCE(ct.charged, 0) - COALESCE(pt.paid, 0)) DESC, ct.last_charge_at DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_billing_patient_balances(UUID) TO authenticated, service_role;

-- Cashflow: revenue = cash/mobile only (not barter goods)
CREATE OR REPLACE FUNCTION rpc_clinic_cashflow(p_clinic_id UUID, p_from DATE, p_to DATE)
RETURNS TABLE (revenue BIGINT, charged BIGINT, outstanding BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);
  RETURN QUERY
  SELECT
    COALESCE((SELECT SUM(amount_ugx) FROM payments pm
              WHERE pm.clinic_id = p_clinic_id AND pm.status = 'paid'
                AND pm.created_at::date BETWEEN p_from AND p_to), 0)::BIGINT,
    COALESCE((SELECT SUM(amount_ugx) FROM charges c
              WHERE c.clinic_id = p_clinic_id AND NOT c.voided
                AND c.created_at::date BETWEEN p_from AND p_to), 0)::BIGINT,
    GREATEST(0, (
      COALESCE((SELECT SUM(amount_ugx) FROM charges c
                WHERE c.clinic_id = p_clinic_id AND NOT c.voided
                  AND c.created_at::date BETWEEN p_from AND p_to), 0)
      - COALESCE((SELECT SUM(amount_ugx + COALESCE(amount_barter_ugx, 0)) FROM payments pm
                  WHERE pm.clinic_id = p_clinic_id AND pm.status = 'paid'
                    AND pm.created_at::date BETWEEN p_from AND p_to), 0)
    ))::BIGINT;
END;
$$;
