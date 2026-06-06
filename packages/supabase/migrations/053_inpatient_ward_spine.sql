-- 053_inpatient_ward_spine.sql
--
-- HC III inpatient Phase 1 — the ward spine (see docs/hciii-inpatient-panel-spec.md).
--
-- The current inpatient feature is an online-only "Admit" form that produces no
-- list, so admitted patients vanish and the commonest admission — a woman in
-- labour at 2am with no signal — cannot be recorded. This migration gives the
-- ward a spine: a richer admission record (ward, bed, type, weight, minimal
-- maternity fields), append-only rounds observations, and read RPCs the Android
-- app caches for an offline census + chart. Admission/observation writes are the
-- existing offline outbox → SECURITY DEFINER RPC path, idempotent on client_op_id.

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Extend the admissions record.
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE admissions
  ADD COLUMN IF NOT EXISTS ward TEXT NOT NULL DEFAULT 'general'
    CHECK (ward IN ('general', 'maternity')),
  ADD COLUMN IF NOT EXISTS bed_label TEXT,
  ADD COLUMN IF NOT EXISTS admission_type TEXT,
  ADD COLUMN IF NOT EXISTS weight_kg NUMERIC,        -- load-bearing for later paed dosing safety
  ADD COLUMN IF NOT EXISTS provisional_dx TEXT,
  -- Minimal maternity fields. Nullable — they must never gate the admission write.
  ADD COLUMN IF NOT EXISTS gravida SMALLINT,
  ADD COLUMN IF NOT EXISTS para SMALLINT,
  ADD COLUMN IF NOT EXISTS edd DATE,
  ADD COLUMN IF NOT EXISTS gestation_weeks SMALLINT,
  ADD COLUMN IF NOT EXISTS hiv_status TEXT,
  ADD COLUMN IF NOT EXISTS presenting_status TEXT;  -- in_labour | referred_in | postnatal | other

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Append-only rounds observations.
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admission_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_id UUID NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  -- Device-local time of the round; back-dateable for rounds written on paper
  -- in a blackout. Preserved on sync (the device clock is the source of truth).
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  temp_c NUMERIC,
  pulse_bpm SMALLINT,
  resp_rate SMALLINT,
  bp_systolic SMALLINT,
  bp_diastolic SMALLINT,
  spo2_pct SMALLINT,            -- optional; never required, never alert-gating
  avpu TEXT,                    -- A | V | P | U
  -- Under-5 IMCI danger signs.
  imci_not_feeding BOOLEAN NOT NULL DEFAULT FALSE,
  imci_vomiting_everything BOOLEAN NOT NULL DEFAULT FALSE,
  imci_convulsions BOOLEAN NOT NULL DEFAULT FALSE,
  imci_lethargic_unconscious BOOLEAN NOT NULL DEFAULT FALSE,
  note TEXT,
  recorded_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admission_observations_admission
  ON admission_observations(admission_id, observed_at DESC);

-- ──────────────────────────────────────────────────────────────────────────
-- 3. Admit (v2) — extended fields, same idempotent offline-outbox contract.
--    A new function (not a signature change) so queued v1 ops keep working.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_admit_patient_v2(
  p_patient_id UUID,
  p_ward TEXT DEFAULT 'general',
  p_bed_label TEXT DEFAULT NULL,
  p_chief_complaint TEXT DEFAULT NULL,
  p_admission_type TEXT DEFAULT NULL,
  p_weight_kg NUMERIC DEFAULT NULL,
  p_provisional_dx TEXT DEFAULT NULL,
  p_gravida SMALLINT DEFAULT NULL,
  p_para SMALLINT DEFAULT NULL,
  p_edd DATE DEFAULT NULL,
  p_gestation_weeks SMALLINT DEFAULT NULL,
  p_hiv_status TEXT DEFAULT NULL,
  p_presenting_status TEXT DEFAULT NULL,
  p_client_op_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_clinic_id UUID;
  v_admission_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM patients WHERE id = p_patient_id;
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Patient not found';
  END IF;

  PERFORM assert_staff_in_clinic(v_clinic_id);

  IF sync_op_already_applied(p_client_op_id) THEN
    SELECT id INTO v_admission_id FROM admissions
    WHERE patient_id = p_patient_id AND status = 'active'
    ORDER BY admitted_at DESC LIMIT 1;
    RETURN v_admission_id;
  END IF;

  INSERT INTO admissions (
    clinic_id, patient_id, ward, ward_label, bed_label, chief_complaint,
    admission_type, weight_kg, provisional_dx,
    gravida, para, edd, gestation_weeks, hiv_status, presenting_status,
    created_by
  )
  VALUES (
    v_clinic_id, p_patient_id, COALESCE(p_ward, 'general'), p_bed_label, p_bed_label, p_chief_complaint,
    p_admission_type, p_weight_kg, p_provisional_dx,
    p_gravida, p_para, p_edd, p_gestation_weeks, p_hiv_status, p_presenting_status,
    get_current_staff_id()
  )
  RETURNING id INTO v_admission_id;

  PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'admit_patient_v2', 'admissions', v_admission_id);
  RETURN v_admission_id;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_admit_patient_v2(
  UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, SMALLINT, SMALLINT, DATE, SMALLINT, TEXT, TEXT, UUID
) TO anon, authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 4. Record a rounds observation (append-only, idempotent).
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_record_admission_observation(
  p_id UUID,
  p_admission_id UUID,
  p_observed_at TIMESTAMPTZ DEFAULT NULL,
  p_temp_c NUMERIC DEFAULT NULL,
  p_pulse_bpm SMALLINT DEFAULT NULL,
  p_resp_rate SMALLINT DEFAULT NULL,
  p_bp_systolic SMALLINT DEFAULT NULL,
  p_bp_diastolic SMALLINT DEFAULT NULL,
  p_spo2_pct SMALLINT DEFAULT NULL,
  p_avpu TEXT DEFAULT NULL,
  p_imci_not_feeding BOOLEAN DEFAULT FALSE,
  p_imci_vomiting_everything BOOLEAN DEFAULT FALSE,
  p_imci_convulsions BOOLEAN DEFAULT FALSE,
  p_imci_lethargic_unconscious BOOLEAN DEFAULT FALSE,
  p_note TEXT DEFAULT NULL,
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

  -- Append-only: the row id is the client-generated UUID, so a replayed op is a
  -- no-op upsert rather than a duplicate round.
  INSERT INTO admission_observations (
    id, admission_id, clinic_id, patient_id, observed_at,
    temp_c, pulse_bpm, resp_rate, bp_systolic, bp_diastolic, spo2_pct, avpu,
    imci_not_feeding, imci_vomiting_everything, imci_convulsions, imci_lethargic_unconscious,
    note, recorded_by
  )
  VALUES (
    p_id, p_admission_id, v_clinic_id, v_patient_id, COALESCE(p_observed_at, NOW()),
    p_temp_c, p_pulse_bpm, p_resp_rate, p_bp_systolic, p_bp_diastolic, p_spo2_pct, p_avpu,
    p_imci_not_feeding, p_imci_vomiting_everything, p_imci_convulsions, p_imci_lethargic_unconscious,
    p_note, get_current_staff_id()
  )
  ON CONFLICT (id) DO NOTHING;

  IF p_client_op_id IS NOT NULL AND NOT sync_op_already_applied(p_client_op_id) THEN
    PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'record_admission_observation', 'admission_observations', p_id);
  END IF;

  RETURN p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_record_admission_observation(
  UUID, UUID, TIMESTAMPTZ, NUMERIC, SMALLINT, SMALLINT, SMALLINT, SMALLINT, SMALLINT, TEXT,
  BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, UUID
) TO anon, authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 5. Ward census — active admissions for a clinic, with patient + last-obs.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_active_admissions(p_clinic_id UUID)
RETURNS TABLE (
  id UUID,
  patient_id UUID,
  patient_name TEXT,
  date_of_birth DATE,
  sex TEXT,
  ward TEXT,
  bed_label TEXT,
  admission_type TEXT,
  chief_complaint TEXT,
  weight_kg NUMERIC,
  admitted_at TIMESTAMPTZ,
  last_observed_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    a.id,
    a.patient_id,
    COALESCE(NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), p.display_name) AS patient_name,
    p.date_of_birth,
    p.sex,
    a.ward,
    a.bed_label,
    a.admission_type,
    a.chief_complaint,
    a.weight_kg,
    a.admitted_at,
    (SELECT MAX(o.observed_at) FROM admission_observations o WHERE o.admission_id = a.id) AS last_observed_at
  FROM admissions a
  JOIN patients p ON p.id = a.patient_id
  WHERE a.clinic_id = p_clinic_id
    AND a.status = 'active'
  ORDER BY a.admitted_at DESC;
$$;

GRANT EXECUTE ON FUNCTION rpc_active_admissions(UUID) TO anon, authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 6. Observations for one admission (the chart).
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_admission_observations(p_admission_id UUID)
RETURNS SETOF admission_observations
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT * FROM admission_observations
  WHERE admission_id = p_admission_id
  ORDER BY observed_at DESC;
$$;

GRANT EXECUTE ON FUNCTION rpc_admission_observations(UUID) TO anon, authenticated;
