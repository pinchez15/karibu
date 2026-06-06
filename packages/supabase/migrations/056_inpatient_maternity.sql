-- 056_inpatient_maternity.sql
--
-- HC III maternity — delivery + nested newborn record (docs/hciii-inpatient-panel-spec.md,
-- Phase 3). Maternity is the bulk of HC III inpatient load. This records the
-- delivery event and the immediate newborn outcome, feeding HMIS 105
-- delivery / live-birth / stillbirth / LBW tallies.
--
-- Per the panel's reality-check the newborn is kept NESTED under the mother's
-- delivery (not its own census admission) — promotion to a full patient record
-- happens at discharge/registration, not here. Maternal danger-sign alerts and
-- the (clinically signed-off) MgSO4/oxytocin first-response checklists live on
-- the device; no new server table is needed for them.

CREATE TABLE IF NOT EXISTS deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_id UUID NOT NULL UNIQUE REFERENCES admissions(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  mode TEXT,                       -- svd | assisted | breech | referred_for_cs
  -- Third stage / maternal.
  oxytocin_given BOOLEAN NOT NULL DEFAULT FALSE,
  blood_loss_ml INTEGER,
  placenta_complete BOOLEAN,
  -- Newborn (nested).
  outcome TEXT,                    -- live | stillbirth
  baby_sex TEXT,
  birth_weight_g INTEGER,
  apgar_1 SMALLINT,
  apgar_5 SMALLINT,
  resuscitation_done BOOLEAN NOT NULL DEFAULT FALSE,
  vitamin_k_given BOOLEAN NOT NULL DEFAULT FALSE,
  early_breastfeeding BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  recorded_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deliveries_clinic ON deliveries(clinic_id, delivered_at DESC);

-- Record (or update) the delivery for an admission. Idempotent on the row id.
CREATE OR REPLACE FUNCTION rpc_record_delivery(
  p_id UUID,
  p_admission_id UUID,
  p_mode TEXT DEFAULT NULL,
  p_delivered_at TIMESTAMPTZ DEFAULT NULL,
  p_oxytocin_given BOOLEAN DEFAULT FALSE,
  p_blood_loss_ml INTEGER DEFAULT NULL,
  p_placenta_complete BOOLEAN DEFAULT NULL,
  p_outcome TEXT DEFAULT NULL,
  p_baby_sex TEXT DEFAULT NULL,
  p_birth_weight_g INTEGER DEFAULT NULL,
  p_apgar_1 SMALLINT DEFAULT NULL,
  p_apgar_5 SMALLINT DEFAULT NULL,
  p_resuscitation_done BOOLEAN DEFAULT FALSE,
  p_vitamin_k_given BOOLEAN DEFAULT FALSE,
  p_early_breastfeeding BOOLEAN DEFAULT FALSE,
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

  INSERT INTO deliveries AS d (
    id, admission_id, clinic_id, patient_id, delivered_at, mode,
    oxytocin_given, blood_loss_ml, placenta_complete,
    outcome, baby_sex, birth_weight_g, apgar_1, apgar_5,
    resuscitation_done, vitamin_k_given, early_breastfeeding, notes, recorded_by
  )
  VALUES (
    p_id, p_admission_id, v_clinic_id, v_patient_id, COALESCE(p_delivered_at, NOW()), p_mode,
    p_oxytocin_given, p_blood_loss_ml, p_placenta_complete,
    p_outcome, p_baby_sex, p_birth_weight_g, p_apgar_1, p_apgar_5,
    p_resuscitation_done, p_vitamin_k_given, p_early_breastfeeding, p_notes, get_current_staff_id()
  )
  ON CONFLICT (admission_id) DO UPDATE SET
    mode = EXCLUDED.mode,
    delivered_at = EXCLUDED.delivered_at,
    oxytocin_given = EXCLUDED.oxytocin_given,
    blood_loss_ml = EXCLUDED.blood_loss_ml,
    placenta_complete = EXCLUDED.placenta_complete,
    outcome = EXCLUDED.outcome,
    baby_sex = EXCLUDED.baby_sex,
    birth_weight_g = EXCLUDED.birth_weight_g,
    apgar_1 = EXCLUDED.apgar_1,
    apgar_5 = EXCLUDED.apgar_5,
    resuscitation_done = EXCLUDED.resuscitation_done,
    vitamin_k_given = EXCLUDED.vitamin_k_given,
    early_breastfeeding = EXCLUDED.early_breastfeeding,
    notes = EXCLUDED.notes,
    updated_at = NOW();

  IF p_client_op_id IS NOT NULL AND NOT sync_op_already_applied(p_client_op_id) THEN
    PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'record_delivery', 'deliveries', p_id);
  END IF;
  RETURN p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_record_delivery(
  UUID, UUID, TEXT, TIMESTAMPTZ, BOOLEAN, INTEGER, BOOLEAN, TEXT, TEXT, INTEGER,
  SMALLINT, SMALLINT, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, UUID
) TO anon, authenticated;

CREATE OR REPLACE FUNCTION rpc_admission_delivery(p_admission_id UUID)
RETURNS SETOF deliveries
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT * FROM deliveries WHERE admission_id = p_admission_id LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION rpc_admission_delivery(UUID) TO anon, authenticated;
