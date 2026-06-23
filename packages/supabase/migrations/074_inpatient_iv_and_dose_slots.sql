-- 074_inpatient_iv_and_dose_slots.sql
--
-- Web inpatient chart: time-slotted med rounds + IV drip monitoring for HC III.
-- Adds scheduled_for on administrations (which dose slot was passed) and iv_infusions
-- with site/drip checks. Mirrors docs/hciii-inpatient-panel-spec.md treatment + fluid balance.

-- ── 1. Link administrations to a scheduled dose slot ─────────────────────
ALTER TABLE medication_administrations
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_medication_administrations_scheduled
  ON medication_administrations(order_id, scheduled_for);

-- Replace RPC to accept optional scheduled slot (signature change via CREATE OR REPLACE).
CREATE OR REPLACE FUNCTION rpc_record_medication_admin(
  p_id UUID,
  p_order_id UUID,
  p_status TEXT,
  p_not_given_reason TEXT DEFAULT NULL,
  p_administered_at TIMESTAMPTZ DEFAULT NULL,
  p_scheduled_for TIMESTAMPTZ DEFAULT NULL,
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
    id, order_id, admission_id, clinic_id, status, not_given_reason,
    administered_at, scheduled_for, recorded_by
  )
  VALUES (
    p_id, p_order_id, v_admission_id, v_clinic_id, p_status, p_not_given_reason,
    COALESCE(p_administered_at, NOW()), p_scheduled_for, get_current_staff_id()
  )
  ON CONFLICT (id) DO NOTHING;

  IF p_client_op_id IS NOT NULL AND NOT sync_op_already_applied(p_client_op_id) THEN
    PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'record_medication_admin', 'medication_administrations', p_id);
  END IF;
  RETURN p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_record_medication_admin(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID)
  TO anon, authenticated;

-- ── 2. IV infusions (fluids + IV drugs common at HC III) ───────────────────
CREATE TABLE IF NOT EXISTS iv_infusions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_id UUID NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  fluid_type TEXT NOT NULL,
  additive TEXT,
  volume_ml SMALLINT NOT NULL,
  rate_ml_hr SMALLINT,
  drops_per_min SMALLINT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stopped_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  site_location TEXT,
  notes TEXT,
  started_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_iv_infusions_admission
  ON iv_infusions(admission_id, active, started_at DESC);

CREATE TABLE IF NOT EXISTS iv_infusion_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  infusion_id UUID NOT NULL REFERENCES iv_infusions(id) ON DELETE CASCADE,
  admission_id UUID NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  drip_running BOOLEAN NOT NULL DEFAULT TRUE,
  site_ok BOOLEAN NOT NULL DEFAULT TRUE,
  note TEXT,
  recorded_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_iv_infusion_checks_infusion
  ON iv_infusion_checks(infusion_id, checked_at DESC);

ALTER TABLE iv_infusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE iv_infusion_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY iv_infusions_select_clinic ON iv_infusions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM staff s
      WHERE s.clinic_id = iv_infusions.clinic_id
        AND s.clerk_user_id = auth.jwt()->>'sub'
        AND s.is_active = TRUE
    )
  );

CREATE POLICY iv_infusion_checks_select_clinic ON iv_infusion_checks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM staff s
      WHERE s.clinic_id = iv_infusion_checks.clinic_id
        AND s.clerk_user_id = auth.jwt()->>'sub'
        AND s.is_active = TRUE
    )
  );

-- ── 3. RPC — start IV infusion ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_start_iv_infusion(
  p_id UUID,
  p_admission_id UUID,
  p_fluid_type TEXT,
  p_volume_ml SMALLINT,
  p_additive TEXT DEFAULT NULL,
  p_rate_ml_hr SMALLINT DEFAULT NULL,
  p_drops_per_min SMALLINT DEFAULT NULL,
  p_site_location TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
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

  IF p_volume_ml IS NULL OR p_volume_ml <= 0 THEN
    RAISE EXCEPTION 'volume_ml required';
  END IF;

  INSERT INTO iv_infusions (
    id, admission_id, clinic_id, patient_id, fluid_type, additive,
    volume_ml, rate_ml_hr, drops_per_min, site_location, notes, started_by
  )
  VALUES (
    p_id, p_admission_id, v_clinic_id, v_patient_id, p_fluid_type, p_additive,
    p_volume_ml, p_rate_ml_hr, p_drops_per_min, p_site_location, p_notes, get_current_staff_id()
  )
  ON CONFLICT (id) DO NOTHING;

  IF p_client_op_id IS NOT NULL AND NOT sync_op_already_applied(p_client_op_id) THEN
    PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'start_iv_infusion', 'iv_infusions', p_id);
  END IF;
  RETURN p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_start_iv_infusion(
  UUID, UUID, TEXT, SMALLINT, TEXT, SMALLINT, SMALLINT, TEXT, TEXT, UUID
) TO anon, authenticated;

-- ── 4. RPC — record drip/site check ────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_record_iv_infusion_check(
  p_id UUID,
  p_infusion_id UUID,
  p_drip_running BOOLEAN DEFAULT TRUE,
  p_site_ok BOOLEAN DEFAULT TRUE,
  p_note TEXT DEFAULT NULL,
  p_checked_at TIMESTAMPTZ DEFAULT NULL,
  p_client_op_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_clinic_id UUID;
  v_admission_id UUID;
BEGIN
  SELECT clinic_id, admission_id INTO v_clinic_id, v_admission_id
  FROM iv_infusions WHERE id = p_infusion_id;
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Infusion not found';
  END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);

  INSERT INTO iv_infusion_checks (
    id, infusion_id, admission_id, clinic_id, checked_at,
    drip_running, site_ok, note, recorded_by
  )
  VALUES (
    p_id, p_infusion_id, v_admission_id, v_clinic_id, COALESCE(p_checked_at, NOW()),
    p_drip_running, p_site_ok, p_note, get_current_staff_id()
  )
  ON CONFLICT (id) DO NOTHING;

  IF p_client_op_id IS NOT NULL AND NOT sync_op_already_applied(p_client_op_id) THEN
    PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'record_iv_infusion_check', 'iv_infusion_checks', p_id);
  END IF;
  RETURN p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_record_iv_infusion_check(
  UUID, UUID, BOOLEAN, BOOLEAN, TEXT, TIMESTAMPTZ, UUID
) TO anon, authenticated;

-- ── 5. RPC — stop infusion ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_stop_iv_infusion(
  p_infusion_id UUID,
  p_client_op_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM iv_infusions WHERE id = p_infusion_id;
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Infusion not found';
  END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);

  UPDATE iv_infusions
  SET active = FALSE, stopped_at = COALESCE(stopped_at, NOW())
  WHERE id = p_infusion_id;

  IF p_client_op_id IS NOT NULL AND NOT sync_op_already_applied(p_client_op_id) THEN
    PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'stop_iv_infusion', 'iv_infusions', p_infusion_id);
  END IF;
  RETURN p_infusion_id;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_stop_iv_infusion(UUID, UUID) TO anon, authenticated;

-- ── 6. Read RPCs ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_admission_iv_infusions(p_admission_id UUID)
RETURNS SETOF iv_infusions
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT a.clinic_id INTO v_clinic_id FROM admissions a WHERE a.id = p_admission_id;
  IF v_clinic_id IS NULL THEN RETURN; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  RETURN QUERY
  SELECT * FROM iv_infusions
  WHERE admission_id = p_admission_id
  ORDER BY active DESC, started_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_admission_iv_infusions(UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION rpc_admission_iv_infusion_checks(p_admission_id UUID)
RETURNS SETOF iv_infusion_checks
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT a.clinic_id INTO v_clinic_id FROM admissions a WHERE a.id = p_admission_id;
  IF v_clinic_id IS NULL THEN RETURN; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  RETURN QUERY
  SELECT * FROM iv_infusion_checks
  WHERE admission_id = p_admission_id
  ORDER BY checked_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_admission_iv_infusion_checks(UUID) TO anon, authenticated;
