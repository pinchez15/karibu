-- 057_inpatient_postnatal.sql
--
-- HC III postnatal observations — mother + newborn first-24h (docs/hciii-inpatient-panel-spec.md,
-- Phase 4). Append-only rounds for the postnatal pair: the mother (BP/pulse/temp,
-- lochia/bleeding, fundus) and the newborn (temp, breathing, feeding + danger
-- signs). The newborn is still nested under the mother's admission (subject
-- discriminator), per the panel's reality-check.
--
-- Newborn danger-sign evaluation (LBW, hypothermia, fast breathing, not feeding,
-- convulsions, jaundice) runs on-device; this table is the record.

CREATE TABLE IF NOT EXISTS postnatal_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_id UUID NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  subject TEXT NOT NULL CHECK (subject IN ('mother', 'newborn')),
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  temp_c NUMERIC,
  pulse_bpm SMALLINT,
  resp_rate SMALLINT,
  bp_systolic SMALLINT,
  bp_diastolic SMALLINT,
  bleeding TEXT,                  -- mother: normal | heavy
  fundus_firm BOOLEAN,            -- mother
  feeding_well BOOLEAN,           -- newborn
  not_feeding BOOLEAN NOT NULL DEFAULT FALSE,
  convulsions BOOLEAN NOT NULL DEFAULT FALSE,
  jaundice BOOLEAN NOT NULL DEFAULT FALSE,
  note TEXT,
  recorded_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_postnatal_observations_admission
  ON postnatal_observations(admission_id, observed_at DESC);

CREATE OR REPLACE FUNCTION rpc_record_postnatal_obs(
  p_id UUID,
  p_admission_id UUID,
  p_subject TEXT,
  p_observed_at TIMESTAMPTZ DEFAULT NULL,
  p_temp_c NUMERIC DEFAULT NULL,
  p_pulse_bpm SMALLINT DEFAULT NULL,
  p_resp_rate SMALLINT DEFAULT NULL,
  p_bp_systolic SMALLINT DEFAULT NULL,
  p_bp_diastolic SMALLINT DEFAULT NULL,
  p_bleeding TEXT DEFAULT NULL,
  p_fundus_firm BOOLEAN DEFAULT NULL,
  p_feeding_well BOOLEAN DEFAULT NULL,
  p_not_feeding BOOLEAN DEFAULT FALSE,
  p_convulsions BOOLEAN DEFAULT FALSE,
  p_jaundice BOOLEAN DEFAULT FALSE,
  p_note TEXT DEFAULT NULL,
  p_client_op_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_clinic_id UUID;
  v_patient_id UUID;
BEGIN
  IF p_subject NOT IN ('mother', 'newborn') THEN
    RAISE EXCEPTION 'invalid subject: %', p_subject;
  END IF;
  SELECT clinic_id, patient_id INTO v_clinic_id, v_patient_id
  FROM admissions WHERE id = p_admission_id;
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Admission not found';
  END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);

  INSERT INTO postnatal_observations (
    id, admission_id, clinic_id, patient_id, subject, observed_at,
    temp_c, pulse_bpm, resp_rate, bp_systolic, bp_diastolic,
    bleeding, fundus_firm, feeding_well, not_feeding, convulsions, jaundice,
    note, recorded_by
  )
  VALUES (
    p_id, p_admission_id, v_clinic_id, v_patient_id, p_subject, COALESCE(p_observed_at, NOW()),
    p_temp_c, p_pulse_bpm, p_resp_rate, p_bp_systolic, p_bp_diastolic,
    p_bleeding, p_fundus_firm, p_feeding_well, p_not_feeding, p_convulsions, p_jaundice,
    p_note, get_current_staff_id()
  )
  ON CONFLICT (id) DO NOTHING;

  IF p_client_op_id IS NOT NULL AND NOT sync_op_already_applied(p_client_op_id) THEN
    PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'record_postnatal_obs', 'postnatal_observations', p_id);
  END IF;
  RETURN p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_record_postnatal_obs(
  UUID, UUID, TEXT, TIMESTAMPTZ, NUMERIC, SMALLINT, SMALLINT, SMALLINT, SMALLINT,
  TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, UUID
) TO anon, authenticated;

CREATE OR REPLACE FUNCTION rpc_admission_postnatal_obs(p_admission_id UUID)
RETURNS SETOF postnatal_observations
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT * FROM postnatal_observations
  WHERE admission_id = p_admission_id
  ORDER BY observed_at DESC;
$$;

GRANT EXECUTE ON FUNCTION rpc_admission_postnatal_obs(UUID) TO anon, authenticated;
