-- 054_inpatient_treatment_chart.sql
--
-- HC III inpatient treatment chart (docs/hciii-inpatient-panel-spec.md, Phase 2).
--
-- The drug round is the most error-prone lone-nurse night task. A chart that
-- pretends stock is infinite is dangerous and ignored, so this separates what
-- was ORDERED from what was actually GIVEN — and treats "not given (stockout)"
-- as a first-class, honest outcome rather than a silent gap. Per the panel's
-- reality-check, the ward administration record is deliberately DECOUPLED from
-- pharmacy stock sync (pharmacy reconciles separately) to avoid blocking/dup bugs.
--
-- MVP: orders carry a free-text frequency label (BD/TDS/…); administrations are
-- timestamped Given / Not-given events. A computed dose-schedule ("due now")
-- lands in a follow-up. All writes are the offline outbox → SECURITY DEFINER RPC
-- path, idempotent on client_op_id (orders) / row id (administrations).

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Medication orders (active treatment for an admission).
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS medication_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_id UUID NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  drug_name TEXT NOT NULL,
  dose TEXT,
  route TEXT,
  frequency TEXT,          -- free-text label for now (e.g. "BD", "TDS", "stat")
  instructions TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  ordered_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_medication_orders_admission
  ON medication_orders(admission_id, active);

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Medication administrations (append-only drug-round record).
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS medication_administrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES medication_orders(id) ON DELETE CASCADE,
  admission_id UUID NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  -- 'given' or 'not_given'. not_given_reason is first-class: stockout / refused /
  -- nbm (nil by mouth) / absent / other.
  status TEXT NOT NULL CHECK (status IN ('given', 'not_given')),
  not_given_reason TEXT,
  administered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_medication_administrations_order
  ON medication_administrations(order_id, administered_at DESC);
CREATE INDEX IF NOT EXISTS idx_medication_administrations_admission
  ON medication_administrations(admission_id, administered_at DESC);

-- ──────────────────────────────────────────────────────────────────────────
-- 3. RPC — add a medication order (idempotent on client_op_id).
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_add_medication_order(
  p_id UUID,
  p_admission_id UUID,
  p_drug_name TEXT,
  p_dose TEXT DEFAULT NULL,
  p_route TEXT DEFAULT NULL,
  p_frequency TEXT DEFAULT NULL,
  p_instructions TEXT DEFAULT NULL,
  p_client_op_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_clinic_id UUID;
  v_patient_id UUID;
BEGIN
  SELECT clinic_id, patient_id INTO v_clinic_id, v_patient_id
  FROM admissions WHERE id = p_admission_id;
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Admission not found';
  END IF;

  PERFORM assert_staff_in_clinic(v_clinic_id);

  INSERT INTO medication_orders (
    id, admission_id, clinic_id, patient_id,
    drug_name, dose, route, frequency, instructions, ordered_by
  )
  VALUES (
    p_id, p_admission_id, v_clinic_id, v_patient_id,
    p_drug_name, p_dose, p_route, p_frequency, p_instructions, get_current_staff_id()
  )
  ON CONFLICT (id) DO NOTHING;

  IF p_client_op_id IS NOT NULL AND NOT sync_op_already_applied(p_client_op_id) THEN
    PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'add_medication_order', 'medication_orders', p_id);
  END IF;

  RETURN p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_add_medication_order(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID)
  TO anon, authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 4. RPC — stop (deactivate) a medication order.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_stop_medication_order(
  p_order_id UUID,
  p_client_op_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM medication_orders WHERE id = p_order_id;
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);

  UPDATE medication_orders SET active = FALSE, updated_at = NOW() WHERE id = p_order_id;

  IF p_client_op_id IS NOT NULL AND NOT sync_op_already_applied(p_client_op_id) THEN
    PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'stop_medication_order', 'medication_orders', p_order_id);
  END IF;
  RETURN p_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_stop_medication_order(UUID, UUID) TO anon, authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 5. RPC — record an administration (append-only, idempotent on row id).
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_record_medication_admin(
  p_id UUID,
  p_order_id UUID,
  p_status TEXT,
  p_not_given_reason TEXT DEFAULT NULL,
  p_administered_at TIMESTAMPTZ DEFAULT NULL,
  p_client_op_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_clinic_id UUID;
  v_admission_id UUID;
BEGIN
  IF p_status NOT IN ('given', 'not_given') THEN
    RAISE EXCEPTION 'invalid status: %', p_status;
  END IF;

  SELECT clinic_id, admission_id INTO v_clinic_id, v_admission_id
  FROM medication_orders WHERE id = p_order_id;
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);

  INSERT INTO medication_administrations (
    id, order_id, admission_id, clinic_id, status, not_given_reason, administered_at, recorded_by
  )
  VALUES (
    p_id, p_order_id, v_admission_id, v_clinic_id, p_status, p_not_given_reason,
    COALESCE(p_administered_at, NOW()), get_current_staff_id()
  )
  ON CONFLICT (id) DO NOTHING;

  IF p_client_op_id IS NOT NULL AND NOT sync_op_already_applied(p_client_op_id) THEN
    PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'record_medication_admin', 'medication_administrations', p_id);
  END IF;
  RETURN p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_record_medication_admin(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, UUID)
  TO anon, authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 6. Read RPCs — active orders + administrations for an admission.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_admission_medication_orders(p_admission_id UUID)
RETURNS SETOF medication_orders
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT * FROM medication_orders
  WHERE admission_id = p_admission_id
  ORDER BY active DESC, created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION rpc_admission_medication_orders(UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION rpc_admission_medication_admins(p_admission_id UUID)
RETURNS SETOF medication_administrations
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT * FROM medication_administrations
  WHERE admission_id = p_admission_id
  ORDER BY administered_at DESC;
$$;

GRANT EXECUTE ON FUNCTION rpc_admission_medication_admins(UUID) TO anon, authenticated;
