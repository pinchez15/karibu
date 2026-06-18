-- 071_billing_charges.sql
--
-- Billing (user request B / #16) — a charges/ledger model on top of the
-- existing `payments` table (016, already multi-row per visit = partial pay).
-- Charges are what a patient OWES; payments are what they've paid. Balance =
-- charged − paid. Billing is decoupled from clinical closure (a charge/payment
-- never gates documentation).

CREATE TABLE IF NOT EXISTS charges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id  UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  visit_id    UUID REFERENCES visits(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  category    TEXT,   -- consultation | lab | pharmacy | procedure | other
  amount_ugx  INTEGER NOT NULL CHECK (amount_ugx >= 0),
  source      TEXT NOT NULL DEFAULT 'manual',  -- manual | lab | pharmacy | consultation
  voided      BOOLEAN NOT NULL DEFAULT FALSE,
  created_by  UUID REFERENCES staff(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_charges_clinic ON charges (clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_charges_patient ON charges (patient_id) WHERE NOT voided;
CREATE INDEX IF NOT EXISTS idx_charges_visit ON charges (visit_id) WHERE visit_id IS NOT NULL;

ALTER TABLE charges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS charges_select_clinic ON charges;
CREATE POLICY charges_select_clinic ON charges
  FOR SELECT TO authenticated USING (clinic_id = get_current_clinic_id());

-- Add a charge.
CREATE OR REPLACE FUNCTION rpc_add_charge(
  p_clinic_id UUID,
  p_patient_id UUID,
  p_description TEXT,
  p_amount_ugx INTEGER,
  p_visit_id UUID DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_source TEXT DEFAULT 'manual'
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id UUID;
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);
  INSERT INTO charges (clinic_id, patient_id, visit_id, description, category, amount_ugx, source, created_by)
  VALUES (p_clinic_id, p_patient_id, p_visit_id, p_description, p_category, p_amount_ugx, p_source, get_current_staff_id())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Outstanding balance for a patient: charged − paid.
CREATE OR REPLACE FUNCTION rpc_patient_balance(p_clinic_id UUID, p_patient_id UUID)
RETURNS TABLE (charged BIGINT, paid BIGINT, balance BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);
  RETURN QUERY
  SELECT
    COALESCE((SELECT SUM(amount_ugx) FROM charges c WHERE c.clinic_id = p_clinic_id AND c.patient_id = p_patient_id AND NOT c.voided), 0)::BIGINT,
    COALESCE((SELECT SUM(amount_ugx) FROM payments pm WHERE pm.clinic_id = p_clinic_id AND pm.patient_id = p_patient_id AND pm.status = 'paid'), 0)::BIGINT,
    (COALESCE((SELECT SUM(amount_ugx) FROM charges c WHERE c.clinic_id = p_clinic_id AND c.patient_id = p_patient_id AND NOT c.voided), 0)
     - COALESCE((SELECT SUM(amount_ugx) FROM payments pm WHERE pm.clinic_id = p_clinic_id AND pm.patient_id = p_patient_id AND pm.status = 'paid'), 0))::BIGINT;
END;
$$;

-- Clinic cashflow / profitability headline for a date range.
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
    COALESCE((SELECT SUM(amount_ugx) FROM charges c
              WHERE c.clinic_id = p_clinic_id AND NOT c.voided
                AND c.created_at::date BETWEEN p_from AND p_to), 0)::BIGINT
    - COALESCE((SELECT SUM(amount_ugx) FROM payments pm
                WHERE pm.clinic_id = p_clinic_id AND pm.status = 'paid'
                  AND pm.created_at::date BETWEEN p_from AND p_to), 0)::BIGINT;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_add_charge(UUID, UUID, TEXT, INTEGER, UUID, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION rpc_patient_balance(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION rpc_clinic_cashflow(UUID, DATE, DATE) TO authenticated, service_role;
