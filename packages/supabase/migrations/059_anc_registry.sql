-- 059_anc_registry.sql
--
-- Antenatal care (ANC) registry (docs/maternal-neonatal-research.md). The HC III
-- is the diocese's birth hub, so it must hold every pregnancy: who is pregnant,
-- when they are due, and which Uganda MOH ANC protocols they have/haven't
-- completed (ANC8 schedule, IPTp-SP x3, Td, IFAS, HIV/syphilis/HepB, BP/urine
-- pre-eclampsia screening). This is the longitudinal front half of the continuum
-- that links into the maternity admission/delivery records (migration 056).
--
-- Protocol "done vs due" is DERIVED on-device from the contacts, so there is one
-- source of truth. Offline-first: all writes go through the outbox -> SECURITY
-- DEFINER RPC path, idempotent on client_op_id.

CREATE TABLE IF NOT EXISTS pregnancies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  lmp DATE,                         -- last menstrual period
  edd DATE,                         -- estimated date of delivery
  gravida SMALLINT,
  para SMALLINT,
  blood_group TEXT,
  hiv_status TEXT,                  -- positive | negative | unknown
  syphilis_status TEXT,
  hepb_status TEXT,
  risk_notes TEXT,                  -- free-text high-risk flags (prior CS, etc.)
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'closed')),
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pregnancies_clinic_status ON pregnancies(clinic_id, status, edd);
CREATE INDEX IF NOT EXISTS idx_pregnancies_patient ON pregnancies(patient_id);

CREATE TABLE IF NOT EXISTS anc_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pregnancy_id UUID NOT NULL REFERENCES pregnancies(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  contact_number SMALLINT,          -- 1..8 (ANC8)
  contact_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  gestation_weeks SMALLINT,
  bp_systolic SMALLINT,
  bp_diastolic SMALLINT,
  weight_kg NUMERIC,
  fundal_height_cm SMALLINT,
  fetal_heart_rate SMALLINT,
  urine_protein TEXT,               -- neg | + | ++ | +++
  hb NUMERIC,
  iptp_given BOOLEAN NOT NULL DEFAULT FALSE,
  ifas_given BOOLEAN NOT NULL DEFAULT FALSE,
  td_given BOOLEAN NOT NULL DEFAULT FALSE,
  dewormed BOOLEAN NOT NULL DEFAULT FALSE,
  itn_given BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  recorded_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_anc_contacts_pregnancy ON anc_contacts(pregnancy_id, contact_date DESC);

-- ── Start / update a pregnancy ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_start_pregnancy(
  p_id UUID,
  p_patient_id UUID,
  p_lmp DATE DEFAULT NULL,
  p_edd DATE DEFAULT NULL,
  p_gravida SMALLINT DEFAULT NULL,
  p_para SMALLINT DEFAULT NULL,
  p_blood_group TEXT DEFAULT NULL,
  p_hiv_status TEXT DEFAULT NULL,
  p_syphilis_status TEXT DEFAULT NULL,
  p_hepb_status TEXT DEFAULT NULL,
  p_risk_notes TEXT DEFAULT NULL,
  p_client_op_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM patients WHERE id = p_patient_id;
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Patient not found';
  END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);

  INSERT INTO pregnancies AS pg (
    id, clinic_id, patient_id, lmp, edd, gravida, para,
    blood_group, hiv_status, syphilis_status, hepb_status, risk_notes, created_by
  )
  VALUES (
    p_id, v_clinic_id, p_patient_id, p_lmp,
    COALESCE(p_edd, p_lmp + INTERVAL '280 days'), p_gravida, p_para,
    p_blood_group, p_hiv_status, p_syphilis_status, p_hepb_status, p_risk_notes, get_current_staff_id()
  )
  ON CONFLICT (id) DO UPDATE SET
    lmp = EXCLUDED.lmp, edd = EXCLUDED.edd, gravida = EXCLUDED.gravida, para = EXCLUDED.para,
    blood_group = EXCLUDED.blood_group, hiv_status = EXCLUDED.hiv_status,
    syphilis_status = EXCLUDED.syphilis_status, hepb_status = EXCLUDED.hepb_status,
    risk_notes = EXCLUDED.risk_notes, updated_at = NOW();

  IF p_client_op_id IS NOT NULL AND NOT sync_op_already_applied(p_client_op_id) THEN
    PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'start_pregnancy', 'pregnancies', p_id);
  END IF;
  RETURN p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_start_pregnancy(
  UUID, UUID, DATE, DATE, SMALLINT, SMALLINT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID
) TO anon, authenticated;

-- ── Record an ANC contact ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_record_anc_contact(
  p_id UUID,
  p_pregnancy_id UUID,
  p_contact_number SMALLINT DEFAULT NULL,
  p_contact_date TIMESTAMPTZ DEFAULT NULL,
  p_gestation_weeks SMALLINT DEFAULT NULL,
  p_bp_systolic SMALLINT DEFAULT NULL,
  p_bp_diastolic SMALLINT DEFAULT NULL,
  p_weight_kg NUMERIC DEFAULT NULL,
  p_fundal_height_cm SMALLINT DEFAULT NULL,
  p_fetal_heart_rate SMALLINT DEFAULT NULL,
  p_urine_protein TEXT DEFAULT NULL,
  p_hb NUMERIC DEFAULT NULL,
  p_iptp_given BOOLEAN DEFAULT FALSE,
  p_ifas_given BOOLEAN DEFAULT FALSE,
  p_td_given BOOLEAN DEFAULT FALSE,
  p_dewormed BOOLEAN DEFAULT FALSE,
  p_itn_given BOOLEAN DEFAULT FALSE,
  p_notes TEXT DEFAULT NULL,
  p_client_op_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_clinic_id UUID;
  v_patient_id UUID;
BEGIN
  SELECT clinic_id, patient_id INTO v_clinic_id, v_patient_id
  FROM pregnancies WHERE id = p_pregnancy_id;
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Pregnancy not found';
  END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);

  INSERT INTO anc_contacts (
    id, pregnancy_id, clinic_id, patient_id, contact_number, contact_date, gestation_weeks,
    bp_systolic, bp_diastolic, weight_kg, fundal_height_cm, fetal_heart_rate, urine_protein, hb,
    iptp_given, ifas_given, td_given, dewormed, itn_given, notes, recorded_by
  )
  VALUES (
    p_id, p_pregnancy_id, v_clinic_id, v_patient_id, p_contact_number, COALESCE(p_contact_date, NOW()), p_gestation_weeks,
    p_bp_systolic, p_bp_diastolic, p_weight_kg, p_fundal_height_cm, p_fetal_heart_rate, p_urine_protein, p_hb,
    p_iptp_given, p_ifas_given, p_td_given, p_dewormed, p_itn_given, p_notes, get_current_staff_id()
  )
  ON CONFLICT (id) DO NOTHING;

  UPDATE pregnancies SET updated_at = NOW() WHERE id = p_pregnancy_id;

  IF p_client_op_id IS NOT NULL AND NOT sync_op_already_applied(p_client_op_id) THEN
    PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'record_anc_contact', 'anc_contacts', p_id);
  END IF;
  RETURN p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_record_anc_contact(
  UUID, UUID, SMALLINT, TIMESTAMPTZ, SMALLINT, SMALLINT, SMALLINT, NUMERIC, SMALLINT, SMALLINT,
  TEXT, NUMERIC, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, UUID
) TO anon, authenticated;

-- ── Registry: active pregnancies for a clinic, with derived counts ──────────
CREATE OR REPLACE FUNCTION rpc_active_pregnancies(p_clinic_id UUID)
RETURNS TABLE (
  id UUID,
  patient_id UUID,
  patient_name TEXT,
  lmp DATE,
  edd DATE,
  gravida SMALLINT,
  para SMALLINT,
  blood_group TEXT,
  hiv_status TEXT,
  syphilis_status TEXT,
  hepb_status TEXT,
  risk_notes TEXT,
  contact_count BIGINT,
  iptp_count BIGINT,
  td_count BIGINT,
  last_contact_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    pg.id, pg.patient_id,
    COALESCE(NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), p.display_name),
    pg.lmp, pg.edd, pg.gravida, pg.para,
    pg.blood_group, pg.hiv_status, pg.syphilis_status, pg.hepb_status, pg.risk_notes,
    (SELECT COUNT(*) FROM anc_contacts c WHERE c.pregnancy_id = pg.id),
    (SELECT COUNT(*) FROM anc_contacts c WHERE c.pregnancy_id = pg.id AND c.iptp_given),
    (SELECT COUNT(*) FROM anc_contacts c WHERE c.pregnancy_id = pg.id AND c.td_given),
    (SELECT MAX(c.contact_date) FROM anc_contacts c WHERE c.pregnancy_id = pg.id)
  FROM pregnancies pg
  JOIN patients p ON p.id = pg.patient_id
  WHERE pg.clinic_id = p_clinic_id AND pg.status = 'active'
  ORDER BY pg.edd NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION rpc_active_pregnancies(UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION rpc_pregnancy_contacts(p_pregnancy_id UUID)
RETURNS SETOF anc_contacts
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT * FROM anc_contacts WHERE pregnancy_id = p_pregnancy_id ORDER BY contact_date DESC;
$$;

GRANT EXECUTE ON FUNCTION rpc_pregnancy_contacts(UUID) TO anon, authenticated;
