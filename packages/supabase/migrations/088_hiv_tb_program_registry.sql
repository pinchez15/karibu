-- 088_hiv_tb_program_registry.sql
--
-- HIV/TB program registers for Uganda HMIS 106a (DHIS2) quarterly reporting.
-- Longitudinal capture (HTS, ART, TB, TPT) via SECURITY DEFINER RPCs; aggregation
-- functions mirror HMIS 106a:01-02 (HIV) and 106a:03 (TB/Leprosy).

-- ── Age helper (matches migration 038 HMIS derivation) ───────────────────────
CREATE OR REPLACE FUNCTION patient_age_years_at(p_patient_id UUID, p_as_of DATE)
RETURNS INT
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN p.dob_precision = 'exact' AND p.date_of_birth IS NOT NULL THEN
      EXTRACT(YEAR FROM age(p_as_of, p.date_of_birth::DATE))::INT
    WHEN p.dob_precision = 'year_only' AND p.birth_year IS NOT NULL THEN
      EXTRACT(YEAR FROM p_as_of)::INT - p.birth_year
    WHEN p.dob_precision = 'age_estimate'
      AND p.approximate_age IS NOT NULL
      AND p.age_recorded_at IS NOT NULL THEN
      p.approximate_age
        + EXTRACT(YEAR FROM age(p_as_of, p.age_recorded_at::DATE))::INT
    ELSE NULL
  END
  FROM patients p
  WHERE p.id = p_patient_id;
$$;

-- Uganda FY quarter bounds (FY starts July). Q1=Jul-Sep … Q4=Apr-Jun.
CREATE OR REPLACE FUNCTION uganda_fy_quarter_bounds(
  p_fy_start_year INT,
  p_quarter INT
)
RETURNS TABLE (period_start DATE, period_end DATE)
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p_quarter NOT BETWEEN 1 AND 4 THEN
    RAISE EXCEPTION 'Quarter must be 1-4';
  END IF;
  period_start := CASE p_quarter
    WHEN 1 THEN make_date(p_fy_start_year, 7, 1)
    WHEN 2 THEN make_date(p_fy_start_year, 10, 1)
    WHEN 3 THEN make_date(p_fy_start_year + 1, 1, 1)
    WHEN 4 THEN make_date(p_fy_start_year + 1, 4, 1)
  END;
  period_end := CASE p_quarter
    WHEN 1 THEN make_date(p_fy_start_year, 10, 1)
    WHEN 2 THEN make_date(p_fy_start_year + 1, 1, 1)
    WHEN 3 THEN make_date(p_fy_start_year + 1, 4, 1)
    WHEN 4 THEN make_date(p_fy_start_year + 1, 7, 1)
  END;
  RETURN NEXT;
END;
$$;

-- HMIS 106a HIV age band: under_2 | age_2_4 | age_5_14 | age_15_49 | age_50_plus | unknown
CREATE OR REPLACE FUNCTION hiv_hmis_age_band(p_age_years INT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_age_years IS NULL THEN 'unknown'
    WHEN p_age_years < 2 THEN 'under_2'
    WHEN p_age_years < 5 THEN 'age_2_4'
    WHEN p_age_years < 15 THEN 'age_5_14'
    WHEN p_age_years < 50 THEN 'age_15_49'
    ELSE 'age_50_plus'
  END;
$$;

-- ── Lookup: HMIS 106a report line items ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS hmis_106a_elements (
  id SERIAL PRIMARY KEY,
  element_code TEXT UNIQUE NOT NULL,
  report TEXT NOT NULL CHECK (report IN ('hiv', 'tb')),
  section TEXT NOT NULL,
  display_name TEXT NOT NULL,
  dhis2_hint TEXT,
  sort_order INT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO hmis_106a_elements (element_code, report, section, display_name, dhis2_hint, sort_order) VALUES
  -- HCT (HMIS 106a HIV — TABLE 5 HCT)
  ('HIV_HCT_COUNSELED', 'hiv', 'hct', 'Individuals counseled for HIV/AIDS', 'HMIS 106a:01 HCT', 1),
  ('HIV_HCT_TESTED', 'hiv', 'hct', 'Individuals tested for HIV', NULL, 2),
  ('HIV_HCT_RESULT_RECEIVED', 'hiv', 'hct', 'Individuals who received HIV test results', NULL, 3),
  ('HIV_HCT_FIRST_RESULT_FY', 'hiv', 'hct', 'First HIV result in financial year', NULL, 4),
  ('HIV_HCT_POSITIVE', 'hiv', 'hct', 'Individuals who tested HIV positive', NULL, 5),
  ('HIV_HCT_SUSPECT_TB', 'hiv', 'hct', 'HIV positive with suspected TB', NULL, 6),
  ('HIV_HCT_STARTED_CPT', 'hiv', 'hct', 'HIV positive started on CPT', NULL, 7),
  ('HIV_HCT_RETESTER', 'hiv', 'hct', 'Re-testers (2+ tests in last 12 months)', NULL, 8),
  ('HIV_HCT_COUPLE_TESTED', 'hiv', 'hct', 'Couple tested together', NULL, 9),
  ('HIV_HCT_COUPLE_CONCORDANT', 'hiv', 'hct', 'Couple concordant positive', NULL, 10),
  ('HIV_HCT_COUPLE_DISCORDANT', 'hiv', 'hct', 'Couple discordant', NULL, 11),
  ('HIV_HCT_PEP', 'hiv', 'hct', 'Individuals counseled and tested for PEP', NULL, 12),
  ('HIV_HCT_SMC', 'hiv', 'hct', 'Safe male circumcision provided', NULL, 13),
  -- ART (HMIS 106a HIV — ART services)
  ('HIV_ART_NEW_ENROLLED', 'hiv', 'art', 'New patients enrolled in HIV care (quarter)', NULL, 20),
  ('HIV_ART_NEW_ON_ART', 'hiv', 'art', 'New patients started on ART (quarter)', NULL, 21),
  ('HIV_ART_PREGNANT_ENROLLED', 'hiv', 'art', 'Pregnant women enrolled in care (quarter)', NULL, 22),
  ('HIV_ART_PREGNANT_ON_ART', 'hiv', 'art', 'Pregnant women started on ART (quarter)', NULL, 23),
  ('HIV_ART_ACTIVE_PREART', 'hiv', 'art', 'Active on pre-ART care (end of quarter)', NULL, 24),
  ('HIV_ART_CPT_LAST_VISIT', 'hiv', 'art', 'Received CPT at last visit (quarter)', NULL, 25),
  ('HIV_ART_ELIGIBLE_NOT_ART', 'hiv', 'art', 'Eligible not yet on ART (end of quarter)', NULL, 26),
  ('HIV_ART_ACTIVE_ON_ART', 'hiv', 'art', 'Active on ART (end of quarter)', NULL, 27),
  ('HIV_ART_TB_SCREENED', 'hiv', 'art', 'PLHIV screened for TB at last visit', NULL, 28),
  ('HIV_ART_TB_TREATMENT', 'hiv', 'art', 'PLHIV started on TB treatment (quarter)', NULL, 29),
  ('HIV_VL_TESTED', 'hiv', 'art', 'Viral load tests done (quarter)', NULL, 30),
  ('HIV_VL_SUPPRESSED', 'hiv', 'art', 'Viral load suppressed (<1000 copies/mL)', NULL, 31),
  ('HIV_VL_NOT_SUPPRESSED', 'hiv', 'art', 'Viral load not suppressed', NULL, 32),
  -- TB case-finding (HMIS 106a:03)
  ('TB_NEW_SMEAR_POS', 'tb', 'casefinding', 'New pulmonary smear-positive', 'NTLP quarterly case-finding', 1),
  ('TB_NEW_SMEAR_NEG', 'tb', 'casefinding', 'New pulmonary smear-negative', NULL, 2),
  ('TB_NEW_EPT', 'tb', 'casefinding', 'New extrapulmonary', NULL, 3),
  ('TB_RELAPSE', 'tb', 'casefinding', 'Relapse', NULL, 4),
  ('TB_RETREAT_DEFAULT', 'tb', 'casefinding', 'Retreatment after default', NULL, 5),
  ('TB_FAILURE', 'tb', 'casefinding', 'Treatment failure', NULL, 6),
  ('TB_OTHER', 'tb', 'casefinding', 'Other registered cases', NULL, 7),
  ('TB_HIV_POSITIVE', 'tb', 'casefinding', 'TB cases HIV positive', NULL, 8),
  ('TB_TREATMENT_STARTED', 'tb', 'casefinding', 'Started on TB treatment (quarter)', NULL, 9),
  -- TB outcomes (cohort completing in quarter)
  ('TB_OUTCOME_CURED', 'tb', 'outcomes', 'Treatment outcome: Cured', NULL, 20),
  ('TB_OUTCOME_COMPLETED', 'tb', 'outcomes', 'Treatment outcome: Completed', NULL, 21),
  ('TB_OUTCOME_FAILURE', 'tb', 'outcomes', 'Treatment outcome: Failure', NULL, 22),
  ('TB_OUTCOME_DEFAULT', 'tb', 'outcomes', 'Treatment outcome: Default', NULL, 23),
  ('TB_OUTCOME_TRANSFERRED', 'tb', 'outcomes', 'Treatment outcome: Transferred out', NULL, 24),
  ('TB_OUTCOME_DIED', 'tb', 'outcomes', 'Treatment outcome: Died', NULL, 25),
  -- TPT
  ('TPT_PLHIV_STARTED', 'tb', 'tpt', 'TPT started — PLHIV', NULL, 30),
  ('TPT_PLHIV_COMPLETED', 'tb', 'tpt', 'TPT completed — PLHIV', NULL, 31),
  ('TPT_CHILD_STARTED', 'tb', 'tpt', 'TPT started — child <5 household contact', NULL, 32),
  ('TPT_CHILD_COMPLETED', 'tb', 'tpt', 'TPT completed — child <5 household contact', NULL, 33)
ON CONFLICT (element_code) DO NOTHING;

-- ── HTS events (HCT register) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hts_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  visit_id UUID REFERENCES visits(id) ON DELETE SET NULL,
  event_date DATE NOT NULL DEFAULT CURRENT_DATE,
  counseled BOOLEAN NOT NULL DEFAULT TRUE,
  tested BOOLEAN NOT NULL DEFAULT FALSE,
  result TEXT CHECK (result IN ('negative', 'positive', 'indeterminate', 'not_tested')),
  result_received BOOLEAN NOT NULL DEFAULT FALSE,
  first_result_in_fy BOOLEAN NOT NULL DEFAULT FALSE,
  suspected_tb BOOLEAN NOT NULL DEFAULT FALSE,
  started_cpt BOOLEAN NOT NULL DEFAULT FALSE,
  retester BOOLEAN NOT NULL DEFAULT FALSE,
  couple_test BOOLEAN NOT NULL DEFAULT FALSE,
  couple_concordant BOOLEAN,
  pep BOOLEAN NOT NULL DEFAULT FALSE,
  smc_provided BOOLEAN NOT NULL DEFAULT FALSE,
  pregnancy_id UUID REFERENCES pregnancies(id) ON DELETE SET NULL,
  notes TEXT,
  recorded_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hts_events_clinic_date ON hts_events(clinic_id, event_date);
CREATE INDEX IF NOT EXISTS idx_hts_events_patient ON hts_events(patient_id, event_date DESC);

-- ── HIV care enrollment (pre-ART / ART register spine) ─────────────────────
CREATE TABLE IF NOT EXISTS hiv_care_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  enrolled_at DATE NOT NULL DEFAULT CURRENT_DATE,
  care_status TEXT NOT NULL DEFAULT 'pre_art'
    CHECK (care_status IN ('pre_art', 'on_art', 'transferred_out', 'ltfu', 'dead', 'closed')),
  who_stage SMALLINT CHECK (who_stage BETWEEN 1 AND 4),
  art_start_date DATE,
  art_regimen TEXT,
  art_line TEXT CHECK (art_line IN ('first', 'second')),
  pregnant_at_enrollment BOOLEAN NOT NULL DEFAULT FALSE,
  eligible_not_on_art BOOLEAN NOT NULL DEFAULT FALSE,
  tb_assessed_last_visit BOOLEAN NOT NULL DEFAULT FALSE,
  tb_treatment_started BOOLEAN NOT NULL DEFAULT FALSE,
  cpt_at_last_visit BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hiv_care_clinic_status ON hiv_care_enrollments(clinic_id, care_status);
CREATE INDEX IF NOT EXISTS idx_hiv_care_patient ON hiv_care_enrollments(patient_id);

-- ── Viral load tests ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS viral_load_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  enrollment_id UUID REFERENCES hiv_care_enrollments(id) ON DELETE SET NULL,
  test_date DATE NOT NULL DEFAULT CURRENT_DATE,
  result_copies NUMERIC,
  suppressed BOOLEAN,
  notes TEXT,
  recorded_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vl_tests_clinic_date ON viral_load_tests(clinic_id, test_date);

-- ── TB episodes (unit TB register) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tb_episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  unit_tb_number TEXT,
  registered_at DATE NOT NULL DEFAULT CURRENT_DATE,
  case_type TEXT NOT NULL DEFAULT 'new'
    CHECK (case_type IN ('new', 'relapse', 'retreatment_default', 'failure', 'other')),
  disease_class TEXT NOT NULL DEFAULT 'pulmonary_smear_positive'
    CHECK (disease_class IN ('pulmonary_smear_positive', 'pulmonary_smear_negative', 'extrapulmonary')),
  ept_site TEXT,
  hiv_status TEXT CHECK (hiv_status IN ('positive', 'negative', 'unknown')),
  on_art_at_diagnosis BOOLEAN NOT NULL DEFAULT FALSE,
  on_cpt_at_diagnosis BOOLEAN NOT NULL DEFAULT FALSE,
  treatment_started_at DATE,
  regimen_category TEXT CHECK (regimen_category IN ('cat1', 'cat2', 'cat3')),
  treatment_phase TEXT CHECK (treatment_phase IN ('intensive', 'continuation')),
  outcome TEXT CHECK (outcome IN ('ongoing', 'cured', 'completed', 'failure', 'default', 'transferred_out', 'died')),
  outcome_date DATE,
  notes TEXT,
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tb_episodes_clinic_date ON tb_episodes(clinic_id, registered_at);
CREATE INDEX IF NOT EXISTS idx_tb_episodes_patient ON tb_episodes(patient_id);

-- ── TB preventive treatment ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tb_preventive_treatment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  indication TEXT NOT NULL CHECK (indication IN ('plhiv', 'child_contact', 'other')),
  started_at DATE NOT NULL DEFAULT CURRENT_DATE,
  completed_at DATE,
  regimen TEXT,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  recorded_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tpt_clinic_date ON tb_preventive_treatment(clinic_id, started_at);

-- ── RPC: record HTS event ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_record_hts_event(
  p_id UUID,
  p_patient_id UUID,
  p_event_date DATE DEFAULT NULL,
  p_visit_id UUID DEFAULT NULL,
  p_counseled BOOLEAN DEFAULT TRUE,
  p_tested BOOLEAN DEFAULT FALSE,
  p_result TEXT DEFAULT NULL,
  p_result_received BOOLEAN DEFAULT FALSE,
  p_first_result_in_fy BOOLEAN DEFAULT FALSE,
  p_suspected_tb BOOLEAN DEFAULT FALSE,
  p_started_cpt BOOLEAN DEFAULT FALSE,
  p_retester BOOLEAN DEFAULT FALSE,
  p_couple_test BOOLEAN DEFAULT FALSE,
  p_couple_concordant BOOLEAN DEFAULT NULL,
  p_pep BOOLEAN DEFAULT FALSE,
  p_smc_provided BOOLEAN DEFAULT FALSE,
  p_pregnancy_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_client_op_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM patients WHERE id = p_patient_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Patient not found'; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);

  INSERT INTO hts_events (
    id, clinic_id, patient_id, visit_id, event_date, counseled, tested, result,
    result_received, first_result_in_fy, suspected_tb, started_cpt, retester,
    couple_test, couple_concordant, pep, smc_provided, pregnancy_id, notes, recorded_by
  ) VALUES (
    p_id, v_clinic_id, p_patient_id, p_visit_id, COALESCE(p_event_date, CURRENT_DATE),
    COALESCE(p_counseled, TRUE), COALESCE(p_tested, FALSE), p_result,
    COALESCE(p_result_received, FALSE), COALESCE(p_first_result_in_fy, FALSE),
    COALESCE(p_suspected_tb, FALSE), COALESCE(p_started_cpt, FALSE),
    COALESCE(p_retester, FALSE), COALESCE(p_couple_test, FALSE), p_couple_concordant,
    COALESCE(p_pep, FALSE), COALESCE(p_smc_provided, FALSE), p_pregnancy_id, p_notes,
    get_current_staff_id()
  )
  ON CONFLICT (id) DO NOTHING;

  IF p_client_op_id IS NOT NULL AND NOT sync_op_already_applied(p_client_op_id) THEN
    PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'record_hts_event', 'hts_events', p_id);
  END IF;
  RETURN p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION rpc_record_hts_event(
  UUID, UUID, DATE, UUID, BOOLEAN, BOOLEAN, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN,
  BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, UUID, TEXT, UUID
) TO anon, authenticated;

-- ── RPC: enroll / update HIV care ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_upsert_hiv_care(
  p_id UUID,
  p_patient_id UUID,
  p_enrolled_at DATE DEFAULT NULL,
  p_care_status TEXT DEFAULT 'pre_art',
  p_who_stage SMALLINT DEFAULT NULL,
  p_art_start_date DATE DEFAULT NULL,
  p_art_regimen TEXT DEFAULT NULL,
  p_art_line TEXT DEFAULT NULL,
  p_pregnant_at_enrollment BOOLEAN DEFAULT FALSE,
  p_eligible_not_on_art BOOLEAN DEFAULT FALSE,
  p_tb_assessed_last_visit BOOLEAN DEFAULT FALSE,
  p_tb_treatment_started BOOLEAN DEFAULT FALSE,
  p_cpt_at_last_visit BOOLEAN DEFAULT FALSE,
  p_notes TEXT DEFAULT NULL,
  p_client_op_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM patients WHERE id = p_patient_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Patient not found'; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);

  INSERT INTO hiv_care_enrollments AS h (
    id, clinic_id, patient_id, enrolled_at, care_status, who_stage, art_start_date,
    art_regimen, art_line, pregnant_at_enrollment, eligible_not_on_art,
    tb_assessed_last_visit, tb_treatment_started, cpt_at_last_visit, notes, created_by
  ) VALUES (
    p_id, v_clinic_id, p_patient_id, COALESCE(p_enrolled_at, CURRENT_DATE),
    COALESCE(p_care_status, 'pre_art'), p_who_stage, p_art_start_date,
    p_art_regimen, p_art_line, COALESCE(p_pregnant_at_enrollment, FALSE),
    COALESCE(p_eligible_not_on_art, FALSE), COALESCE(p_tb_assessed_last_visit, FALSE),
    COALESCE(p_tb_treatment_started, FALSE), COALESCE(p_cpt_at_last_visit, FALSE),
    p_notes, get_current_staff_id()
  )
  ON CONFLICT (id) DO UPDATE SET
    care_status = EXCLUDED.care_status,
    who_stage = COALESCE(EXCLUDED.who_stage, h.who_stage),
    art_start_date = COALESCE(EXCLUDED.art_start_date, h.art_start_date),
    art_regimen = COALESCE(EXCLUDED.art_regimen, h.art_regimen),
    art_line = COALESCE(EXCLUDED.art_line, h.art_line),
    pregnant_at_enrollment = EXCLUDED.pregnant_at_enrollment,
    eligible_not_on_art = EXCLUDED.eligible_not_on_art,
    tb_assessed_last_visit = EXCLUDED.tb_assessed_last_visit,
    tb_treatment_started = EXCLUDED.tb_treatment_started,
    cpt_at_last_visit = EXCLUDED.cpt_at_last_visit,
    notes = COALESCE(EXCLUDED.notes, h.notes),
    updated_at = NOW();

  IF p_client_op_id IS NOT NULL AND NOT sync_op_already_applied(p_client_op_id) THEN
    PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'upsert_hiv_care', 'hiv_care_enrollments', p_id);
  END IF;
  RETURN p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION rpc_upsert_hiv_care(
  UUID, UUID, DATE, TEXT, SMALLINT, DATE, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN,
  BOOLEAN, BOOLEAN, TEXT, UUID
) TO anon, authenticated;

-- ── RPC: viral load ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_record_viral_load(
  p_id UUID,
  p_patient_id UUID,
  p_enrollment_id UUID DEFAULT NULL,
  p_test_date DATE DEFAULT NULL,
  p_result_copies NUMERIC DEFAULT NULL,
  p_suppressed BOOLEAN DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_client_op_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_clinic_id UUID;
  v_suppressed BOOLEAN;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM patients WHERE id = p_patient_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Patient not found'; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);

  v_suppressed := COALESCE(
    p_suppressed,
    CASE WHEN p_result_copies IS NOT NULL THEN p_result_copies < 1000 ELSE NULL END
  );

  INSERT INTO viral_load_tests (
    id, clinic_id, patient_id, enrollment_id, test_date, result_copies, suppressed, notes, recorded_by
  ) VALUES (
    p_id, v_clinic_id, p_patient_id, p_enrollment_id, COALESCE(p_test_date, CURRENT_DATE),
    p_result_copies, v_suppressed, p_notes, get_current_staff_id()
  )
  ON CONFLICT (id) DO NOTHING;

  IF p_client_op_id IS NOT NULL AND NOT sync_op_already_applied(p_client_op_id) THEN
    PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'record_viral_load', 'viral_load_tests', p_id);
  END IF;
  RETURN p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION rpc_record_viral_load(
  UUID, UUID, UUID, DATE, NUMERIC, BOOLEAN, TEXT, UUID
) TO anon, authenticated;

-- ── RPC: register / update TB episode ────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_upsert_tb_episode(
  p_id UUID,
  p_patient_id UUID,
  p_unit_tb_number TEXT DEFAULT NULL,
  p_registered_at DATE DEFAULT NULL,
  p_case_type TEXT DEFAULT 'new',
  p_disease_class TEXT DEFAULT 'pulmonary_smear_positive',
  p_ept_site TEXT DEFAULT NULL,
  p_hiv_status TEXT DEFAULT NULL,
  p_on_art_at_diagnosis BOOLEAN DEFAULT FALSE,
  p_on_cpt_at_diagnosis BOOLEAN DEFAULT FALSE,
  p_treatment_started_at DATE DEFAULT NULL,
  p_regimen_category TEXT DEFAULT NULL,
  p_treatment_phase TEXT DEFAULT NULL,
  p_outcome TEXT DEFAULT 'ongoing',
  p_outcome_date DATE DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_client_op_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM patients WHERE id = p_patient_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Patient not found'; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);

  INSERT INTO tb_episodes AS t (
    id, clinic_id, patient_id, unit_tb_number, registered_at, case_type, disease_class,
    ept_site, hiv_status, on_art_at_diagnosis, on_cpt_at_diagnosis, treatment_started_at,
    regimen_category, treatment_phase, outcome, outcome_date, notes, created_by
  ) VALUES (
    p_id, v_clinic_id, p_patient_id, p_unit_tb_number, COALESCE(p_registered_at, CURRENT_DATE),
    COALESCE(p_case_type, 'new'), COALESCE(p_disease_class, 'pulmonary_smear_positive'),
    p_ept_site, p_hiv_status, COALESCE(p_on_art_at_diagnosis, FALSE),
    COALESCE(p_on_cpt_at_diagnosis, FALSE), p_treatment_started_at,
    p_regimen_category, p_treatment_phase, COALESCE(p_outcome, 'ongoing'),
    p_outcome_date, p_notes, get_current_staff_id()
  )
  ON CONFLICT (id) DO UPDATE SET
    unit_tb_number = COALESCE(EXCLUDED.unit_tb_number, t.unit_tb_number),
    case_type = EXCLUDED.case_type,
    disease_class = EXCLUDED.disease_class,
    ept_site = COALESCE(EXCLUDED.ept_site, t.ept_site),
    hiv_status = COALESCE(EXCLUDED.hiv_status, t.hiv_status),
    on_art_at_diagnosis = EXCLUDED.on_art_at_diagnosis,
    on_cpt_at_diagnosis = EXCLUDED.on_cpt_at_diagnosis,
    treatment_started_at = COALESCE(EXCLUDED.treatment_started_at, t.treatment_started_at),
    regimen_category = COALESCE(EXCLUDED.regimen_category, t.regimen_category),
    treatment_phase = COALESCE(EXCLUDED.treatment_phase, t.treatment_phase),
    outcome = EXCLUDED.outcome,
    outcome_date = COALESCE(EXCLUDED.outcome_date, t.outcome_date),
    notes = COALESCE(EXCLUDED.notes, t.notes),
    updated_at = NOW();

  IF p_client_op_id IS NOT NULL AND NOT sync_op_already_applied(p_client_op_id) THEN
    PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'upsert_tb_episode', 'tb_episodes', p_id);
  END IF;
  RETURN p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION rpc_upsert_tb_episode(
  UUID, UUID, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, DATE, TEXT, TEXT, TEXT, DATE, TEXT, UUID
) TO anon, authenticated;

-- ── RPC: TB preventive treatment ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_record_tpt(
  p_id UUID,
  p_patient_id UUID,
  p_indication TEXT,
  p_started_at DATE DEFAULT NULL,
  p_completed_at DATE DEFAULT NULL,
  p_regimen TEXT DEFAULT NULL,
  p_completed BOOLEAN DEFAULT FALSE,
  p_notes TEXT DEFAULT NULL,
  p_client_op_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM patients WHERE id = p_patient_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Patient not found'; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);

  INSERT INTO tb_preventive_treatment (
    id, clinic_id, patient_id, indication, started_at, completed_at, regimen, completed, notes, recorded_by
  ) VALUES (
    p_id, v_clinic_id, p_patient_id, p_indication, COALESCE(p_started_at, CURRENT_DATE),
    p_completed_at, p_regimen, COALESCE(p_completed, FALSE), p_notes, get_current_staff_id()
  )
  ON CONFLICT (id) DO UPDATE SET
    completed_at = EXCLUDED.completed_at,
    regimen = COALESCE(EXCLUDED.regimen, tb_preventive_treatment.regimen),
    completed = EXCLUDED.completed,
    notes = COALESCE(EXCLUDED.notes, tb_preventive_treatment.notes);

  IF p_client_op_id IS NOT NULL AND NOT sync_op_already_applied(p_client_op_id) THEN
    PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'record_tpt', 'tb_preventive_treatment', p_id);
  END IF;
  RETURN p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION rpc_record_tpt(
  UUID, UUID, TEXT, DATE, DATE, TEXT, BOOLEAN, TEXT, UUID
) TO anon, authenticated;

-- ── Registry read RPCs ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_active_hiv_care(p_clinic_id UUID)
RETURNS TABLE (
  id UUID,
  patient_id UUID,
  patient_name TEXT,
  enrolled_at DATE,
  care_status TEXT,
  who_stage SMALLINT,
  art_start_date DATE,
  art_regimen TEXT,
  art_line TEXT,
  cpt_at_last_visit BOOLEAN,
  tb_assessed_last_visit BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    h.id, h.patient_id,
    COALESCE(NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), p.display_name),
    h.enrolled_at, h.care_status, h.who_stage, h.art_start_date, h.art_regimen, h.art_line,
    h.cpt_at_last_visit, h.tb_assessed_last_visit
  FROM hiv_care_enrollments h
  JOIN patients p ON p.id = h.patient_id
  WHERE h.clinic_id = p_clinic_id
    AND h.care_status IN ('pre_art', 'on_art')
  ORDER BY h.enrolled_at DESC;
$$;
GRANT EXECUTE ON FUNCTION rpc_active_hiv_care(UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION rpc_active_tb_episodes(p_clinic_id UUID)
RETURNS TABLE (
  id UUID,
  patient_id UUID,
  patient_name TEXT,
  unit_tb_number TEXT,
  registered_at DATE,
  case_type TEXT,
  disease_class TEXT,
  hiv_status TEXT,
  treatment_started_at DATE,
  outcome TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    t.id, t.patient_id,
    COALESCE(NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), p.display_name),
    t.unit_tb_number, t.registered_at, t.case_type, t.disease_class, t.hiv_status,
    t.treatment_started_at, t.outcome
  FROM tb_episodes t
  JOIN patients p ON p.id = t.patient_id
  WHERE t.clinic_id = p_clinic_id AND t.outcome = 'ongoing'
  ORDER BY t.registered_at DESC;
$$;
GRANT EXECUTE ON FUNCTION rpc_active_tb_episodes(UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION rpc_recent_hts_events(p_clinic_id UUID, p_limit INT DEFAULT 50)
RETURNS TABLE (
  id UUID,
  patient_id UUID,
  patient_name TEXT,
  event_date DATE,
  tested BOOLEAN,
  result TEXT,
  result_received BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    e.id, e.patient_id,
    COALESCE(NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), p.display_name),
    e.event_date, e.tested, e.result, e.result_received
  FROM hts_events e
  JOIN patients p ON p.id = e.patient_id
  WHERE e.clinic_id = p_clinic_id
  ORDER BY e.event_date DESC, e.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 200));
$$;
GRANT EXECUTE ON FUNCTION rpc_recent_hts_events(UUID, INT) TO anon, authenticated;

-- ── HMIS 106a HIV aggregation ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION generate_hmis_106a_hiv(
  p_clinic_id UUID,
  p_fy_start_year INT,
  p_quarter INT
)
RETURNS TABLE (
  element_code TEXT,
  section TEXT,
  display_name TEXT,
  sort_order INT,
  male_under_2 BIGINT,
  female_under_2 BIGINT,
  male_2_4 BIGINT,
  female_2_4 BIGINT,
  male_5_14 BIGINT,
  female_5_14 BIGINT,
  male_15_49 BIGINT,
  female_15_49 BIGINT,
  male_50_plus BIGINT,
  female_50_plus BIGINT,
  total BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_start DATE;
  v_end DATE;
BEGIN
  SELECT period_start, period_end INTO v_start, v_end
  FROM uganda_fy_quarter_bounds(p_fy_start_year, p_quarter);

  RETURN QUERY
  WITH base AS (
    SELECT e.element_code, e.section, e.display_name, e.sort_order
    FROM hmis_106a_elements e
    WHERE e.report = 'hiv' AND e.is_active
  ),
  hts AS (
    SELECT
      h.*,
      pat.sex,
      hiv_hmis_age_band(patient_age_years_at(h.patient_id, h.event_date)) AS age_band
    FROM hts_events h
    JOIN patients pat ON pat.id = h.patient_id
    WHERE h.clinic_id = p_clinic_id
      AND h.event_date >= v_start AND h.event_date < v_end
  ),
  hts_counts AS (
    SELECT 'HIV_HCT_COUNSELED' AS code, sex, age_band, COUNT(*)::BIGINT AS n
    FROM hts WHERE counseled GROUP BY sex, age_band
    UNION ALL SELECT 'HIV_HCT_TESTED', sex, age_band, COUNT(*) FROM hts WHERE tested GROUP BY sex, age_band
    UNION ALL SELECT 'HIV_HCT_RESULT_RECEIVED', sex, age_band, COUNT(*) FROM hts WHERE result_received GROUP BY sex, age_band
    UNION ALL SELECT 'HIV_HCT_FIRST_RESULT_FY', sex, age_band, COUNT(*) FROM hts WHERE first_result_in_fy GROUP BY sex, age_band
    UNION ALL SELECT 'HIV_HCT_POSITIVE', sex, age_band, COUNT(*) FROM hts WHERE result = 'positive' GROUP BY sex, age_band
    UNION ALL SELECT 'HIV_HCT_SUSPECT_TB', sex, age_band, COUNT(*) FROM hts WHERE result = 'positive' AND suspected_tb GROUP BY sex, age_band
    UNION ALL SELECT 'HIV_HCT_STARTED_CPT', sex, age_band, COUNT(*) FROM hts WHERE started_cpt GROUP BY sex, age_band
    UNION ALL SELECT 'HIV_HCT_RETESTER', sex, age_band, COUNT(*) FROM hts WHERE retester GROUP BY sex, age_band
    UNION ALL SELECT 'HIV_HCT_COUPLE_TESTED', sex, age_band, COUNT(*) FROM hts WHERE couple_test GROUP BY sex, age_band
    UNION ALL SELECT 'HIV_HCT_COUPLE_CONCORDANT', sex, age_band, COUNT(*) FROM hts WHERE couple_concordant IS TRUE GROUP BY sex, age_band
    UNION ALL SELECT 'HIV_HCT_COUPLE_DISCORDANT', sex, age_band, COUNT(*) FROM hts WHERE couple_concordant IS FALSE GROUP BY sex, age_band
    UNION ALL SELECT 'HIV_HCT_PEP', sex, age_band, COUNT(*) FROM hts WHERE pep GROUP BY sex, age_band
    UNION ALL SELECT 'HIV_HCT_SMC', sex, age_band, COUNT(*) FROM hts WHERE smc_provided GROUP BY sex, age_band
  ),
  care AS (
    SELECT
      c.*,
      pat.sex,
      hiv_hmis_age_band(patient_age_years_at(c.patient_id, c.enrolled_at)) AS age_band
    FROM hiv_care_enrollments c
    JOIN patients pat ON pat.id = c.patient_id
    WHERE c.clinic_id = p_clinic_id
  ),
  care_counts AS (
    SELECT 'HIV_ART_NEW_ENROLLED' AS code, sex, age_band, COUNT(*)::BIGINT AS n
    FROM care WHERE enrolled_at >= v_start AND enrolled_at < v_end GROUP BY sex, age_band
    UNION ALL
    SELECT 'HIV_ART_NEW_ON_ART', sex, age_band, COUNT(*)
    FROM care WHERE art_start_date >= v_start AND art_start_date < v_end GROUP BY sex, age_band
    UNION ALL
    SELECT 'HIV_ART_PREGNANT_ENROLLED', sex, age_band, COUNT(*)
    FROM care WHERE pregnant_at_enrollment AND enrolled_at >= v_start AND enrolled_at < v_end GROUP BY sex, age_band
    UNION ALL
    SELECT 'HIV_ART_PREGNANT_ON_ART', sex, age_band, COUNT(*)
    FROM care WHERE pregnant_at_enrollment AND art_start_date >= v_start AND art_start_date < v_end GROUP BY sex, age_band
    UNION ALL
    SELECT 'HIV_ART_ACTIVE_PREART', sex, age_band, COUNT(*)
    FROM care WHERE care_status = 'pre_art' AND enrolled_at < v_end GROUP BY sex, age_band
    UNION ALL
    SELECT 'HIV_ART_CPT_LAST_VISIT', sex, age_band, COUNT(*)
    FROM care WHERE cpt_at_last_visit AND care_status IN ('pre_art', 'on_art') AND updated_at::DATE < v_end GROUP BY sex, age_band
    UNION ALL
    SELECT 'HIV_ART_ELIGIBLE_NOT_ART', sex, age_band, COUNT(*)
    FROM care WHERE eligible_not_on_art AND care_status = 'pre_art' GROUP BY sex, age_band
    UNION ALL
    SELECT 'HIV_ART_ACTIVE_ON_ART', sex, age_band, COUNT(*)
    FROM care WHERE care_status = 'on_art' AND art_start_date IS NOT NULL AND art_start_date < v_end GROUP BY sex, age_band
    UNION ALL
    SELECT 'HIV_ART_TB_SCREENED', sex, age_band, COUNT(*)
    FROM care WHERE tb_assessed_last_visit AND care_status IN ('pre_art', 'on_art') GROUP BY sex, age_band
    UNION ALL
    SELECT 'HIV_ART_TB_TREATMENT', sex, age_band, COUNT(*)
    FROM care WHERE tb_treatment_started AND updated_at::DATE >= v_start AND updated_at::DATE < v_end GROUP BY sex, age_band
  ),
  vl AS (
    SELECT v.*, pat.sex, hiv_hmis_age_band(patient_age_years_at(v.patient_id, v.test_date)) AS age_band
    FROM viral_load_tests v
    JOIN patients pat ON pat.id = v.patient_id
    WHERE v.clinic_id = p_clinic_id AND v.test_date >= v_start AND v.test_date < v_end
  ),
  vl_counts AS (
    SELECT 'HIV_VL_TESTED' AS code, sex, age_band, COUNT(*)::BIGINT AS n FROM vl GROUP BY sex, age_band
    UNION ALL SELECT 'HIV_VL_SUPPRESSED', sex, age_band, COUNT(*) FROM vl WHERE suppressed IS TRUE GROUP BY sex, age_band
    UNION ALL SELECT 'HIV_VL_NOT_SUPPRESSED', sex, age_band, COUNT(*) FROM vl WHERE suppressed IS FALSE GROUP BY sex, age_band
  ),
  all_counts AS (
    SELECT * FROM hts_counts
    UNION ALL SELECT * FROM care_counts
    UNION ALL SELECT * FROM vl_counts
  )
  SELECT
    b.element_code,
    b.section,
    b.display_name,
    b.sort_order,
    COALESCE(SUM(ac.n) FILTER (WHERE ac.sex = 'M' AND ac.age_band = 'under_2'), 0)::BIGINT,
    COALESCE(SUM(ac.n) FILTER (WHERE ac.sex = 'F' AND ac.age_band = 'under_2'), 0)::BIGINT,
    COALESCE(SUM(ac.n) FILTER (WHERE ac.sex = 'M' AND ac.age_band = 'age_2_4'), 0)::BIGINT,
    COALESCE(SUM(ac.n) FILTER (WHERE ac.sex = 'F' AND ac.age_band = 'age_2_4'), 0)::BIGINT,
    COALESCE(SUM(ac.n) FILTER (WHERE ac.sex = 'M' AND ac.age_band = 'age_5_14'), 0)::BIGINT,
    COALESCE(SUM(ac.n) FILTER (WHERE ac.sex = 'F' AND ac.age_band = 'age_5_14'), 0)::BIGINT,
    COALESCE(SUM(ac.n) FILTER (WHERE ac.sex = 'M' AND ac.age_band = 'age_15_49'), 0)::BIGINT,
    COALESCE(SUM(ac.n) FILTER (WHERE ac.sex = 'F' AND ac.age_band = 'age_15_49'), 0)::BIGINT,
    COALESCE(SUM(ac.n) FILTER (WHERE ac.sex = 'M' AND ac.age_band = 'age_50_plus'), 0)::BIGINT,
    COALESCE(SUM(ac.n) FILTER (WHERE ac.sex = 'F' AND ac.age_band = 'age_50_plus'), 0)::BIGINT,
    COALESCE(SUM(ac.n), 0)::BIGINT
  FROM base b
  LEFT JOIN all_counts ac ON ac.code = b.element_code
  GROUP BY b.element_code, b.section, b.display_name, b.sort_order
  ORDER BY b.sort_order;
END;
$$;
GRANT EXECUTE ON FUNCTION generate_hmis_106a_hiv(UUID, INT, INT) TO anon, authenticated, service_role;

-- ── HMIS 106a TB aggregation ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION generate_hmis_106a_tb(
  p_clinic_id UUID,
  p_fy_start_year INT,
  p_quarter INT
)
RETURNS TABLE (
  element_code TEXT,
  section TEXT,
  display_name TEXT,
  sort_order INT,
  male_under_2 BIGINT,
  female_under_2 BIGINT,
  male_2_4 BIGINT,
  female_2_4 BIGINT,
  male_5_14 BIGINT,
  female_5_14 BIGINT,
  male_15_49 BIGINT,
  female_15_49 BIGINT,
  male_50_plus BIGINT,
  female_50_plus BIGINT,
  total BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_start DATE;
  v_end DATE;
BEGIN
  SELECT period_start, period_end INTO v_start, v_end
  FROM uganda_fy_quarter_bounds(p_fy_start_year, p_quarter);

  RETURN QUERY
  WITH base AS (
    SELECT e.element_code, e.section, e.display_name, e.sort_order
    FROM hmis_106a_elements e
    WHERE e.report = 'tb' AND e.is_active
  ),
  tb AS (
    SELECT
      t.*,
      pat.sex,
      hiv_hmis_age_band(patient_age_years_at(t.patient_id, t.registered_at)) AS age_band
    FROM tb_episodes t
    JOIN patients pat ON pat.id = t.patient_id
    WHERE t.clinic_id = p_clinic_id
  ),
  tb_registered AS (
    SELECT * FROM tb WHERE registered_at >= v_start AND registered_at < v_end
  ),
  tb_counts AS (
    SELECT 'TB_NEW_SMEAR_POS' AS code, sex, age_band, COUNT(*)::BIGINT AS n
    FROM tb_registered WHERE case_type = 'new' AND disease_class = 'pulmonary_smear_positive' GROUP BY sex, age_band
    UNION ALL SELECT 'TB_NEW_SMEAR_NEG', sex, age_band, COUNT(*)
    FROM tb_registered WHERE case_type = 'new' AND disease_class = 'pulmonary_smear_negative' GROUP BY sex, age_band
    UNION ALL SELECT 'TB_NEW_EPT', sex, age_band, COUNT(*)
    FROM tb_registered WHERE case_type = 'new' AND disease_class = 'extrapulmonary' GROUP BY sex, age_band
    UNION ALL SELECT 'TB_RELAPSE', sex, age_band, COUNT(*)
    FROM tb_registered WHERE case_type = 'relapse' GROUP BY sex, age_band
    UNION ALL SELECT 'TB_RETREAT_DEFAULT', sex, age_band, COUNT(*)
    FROM tb_registered WHERE case_type = 'retreatment_default' GROUP BY sex, age_band
    UNION ALL SELECT 'TB_FAILURE', sex, age_band, COUNT(*)
    FROM tb_registered WHERE case_type = 'failure' GROUP BY sex, age_band
    UNION ALL SELECT 'TB_OTHER', sex, age_band, COUNT(*)
    FROM tb_registered WHERE case_type = 'other' GROUP BY sex, age_band
    UNION ALL SELECT 'TB_HIV_POSITIVE', sex, age_band, COUNT(*)
    FROM tb_registered WHERE hiv_status = 'positive' GROUP BY sex, age_band
    UNION ALL SELECT 'TB_TREATMENT_STARTED', sex, age_band, COUNT(*)
    FROM tb_registered WHERE treatment_started_at IS NOT NULL
      AND treatment_started_at >= v_start AND treatment_started_at < v_end GROUP BY sex, age_band
    UNION ALL SELECT 'TB_OUTCOME_CURED', sex, age_band, COUNT(*)
    FROM tb WHERE outcome = 'cured' AND outcome_date >= v_start AND outcome_date < v_end GROUP BY sex, age_band
    UNION ALL SELECT 'TB_OUTCOME_COMPLETED', sex, age_band, COUNT(*)
    FROM tb WHERE outcome = 'completed' AND outcome_date >= v_start AND outcome_date < v_end GROUP BY sex, age_band
    UNION ALL SELECT 'TB_OUTCOME_FAILURE', sex, age_band, COUNT(*)
    FROM tb WHERE outcome = 'failure' AND outcome_date >= v_start AND outcome_date < v_end GROUP BY sex, age_band
    UNION ALL SELECT 'TB_OUTCOME_DEFAULT', sex, age_band, COUNT(*)
    FROM tb WHERE outcome = 'default' AND outcome_date >= v_start AND outcome_date < v_end GROUP BY sex, age_band
    UNION ALL SELECT 'TB_OUTCOME_TRANSFERRED', sex, age_band, COUNT(*)
    FROM tb WHERE outcome = 'transferred_out' AND outcome_date >= v_start AND outcome_date < v_end GROUP BY sex, age_band
    UNION ALL SELECT 'TB_OUTCOME_DIED', sex, age_band, COUNT(*)
    FROM tb WHERE outcome = 'died' AND outcome_date >= v_start AND outcome_date < v_end GROUP BY sex, age_band
  ),
  tpt AS (
    SELECT t.*, pat.sex, hiv_hmis_age_band(patient_age_years_at(t.patient_id, t.started_at)) AS age_band
    FROM tb_preventive_treatment t
    JOIN patients pat ON pat.id = t.patient_id
    WHERE t.clinic_id = p_clinic_id
  ),
  tpt_counts AS (
    SELECT 'TPT_PLHIV_STARTED' AS code, sex, age_band, COUNT(*)::BIGINT AS n
    FROM tpt WHERE indication = 'plhiv' AND started_at >= v_start AND started_at < v_end GROUP BY sex, age_band
    UNION ALL SELECT 'TPT_PLHIV_COMPLETED', sex, age_band, COUNT(*)
    FROM tpt WHERE indication = 'plhiv' AND completed AND completed_at >= v_start AND completed_at < v_end GROUP BY sex, age_band
    UNION ALL SELECT 'TPT_CHILD_STARTED', sex, age_band, COUNT(*)
    FROM tpt WHERE indication = 'child_contact' AND started_at >= v_start AND started_at < v_end GROUP BY sex, age_band
    UNION ALL SELECT 'TPT_CHILD_COMPLETED', sex, age_band, COUNT(*)
    FROM tpt WHERE indication = 'child_contact' AND completed AND completed_at >= v_start AND completed_at < v_end GROUP BY sex, age_band
  ),
  all_counts AS (
    SELECT * FROM tb_counts
    UNION ALL SELECT * FROM tpt_counts
  )
  SELECT
    b.element_code,
    b.section,
    b.display_name,
    b.sort_order,
    COALESCE(SUM(ac.n) FILTER (WHERE ac.sex = 'M' AND ac.age_band = 'under_2'), 0)::BIGINT,
    COALESCE(SUM(ac.n) FILTER (WHERE ac.sex = 'F' AND ac.age_band = 'under_2'), 0)::BIGINT,
    COALESCE(SUM(ac.n) FILTER (WHERE ac.sex = 'M' AND ac.age_band = 'age_2_4'), 0)::BIGINT,
    COALESCE(SUM(ac.n) FILTER (WHERE ac.sex = 'F' AND ac.age_band = 'age_2_4'), 0)::BIGINT,
    COALESCE(SUM(ac.n) FILTER (WHERE ac.sex = 'M' AND ac.age_band = 'age_5_14'), 0)::BIGINT,
    COALESCE(SUM(ac.n) FILTER (WHERE ac.sex = 'F' AND ac.age_band = 'age_5_14'), 0)::BIGINT,
    COALESCE(SUM(ac.n) FILTER (WHERE ac.sex = 'M' AND ac.age_band = 'age_15_49'), 0)::BIGINT,
    COALESCE(SUM(ac.n) FILTER (WHERE ac.sex = 'F' AND ac.age_band = 'age_15_49'), 0)::BIGINT,
    COALESCE(SUM(ac.n) FILTER (WHERE ac.sex = 'M' AND ac.age_band = 'age_50_plus'), 0)::BIGINT,
    COALESCE(SUM(ac.n) FILTER (WHERE ac.sex = 'F' AND ac.age_band = 'age_50_plus'), 0)::BIGINT,
    COALESCE(SUM(ac.n), 0)::BIGINT
  FROM base b
  LEFT JOIN all_counts ac ON ac.code = b.element_code
  GROUP BY b.element_code, b.section, b.display_name, b.sort_order
  ORDER BY b.sort_order;
END;
$$;
GRANT EXECUTE ON FUNCTION generate_hmis_106a_tb(UUID, INT, INT) TO anon, authenticated, service_role;

-- RLS: program tables clinic-scoped via staff JWT
ALTER TABLE hmis_106a_elements ENABLE ROW LEVEL SECURITY;
ALTER TABLE hts_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE hiv_care_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE viral_load_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE tb_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tb_preventive_treatment ENABLE ROW LEVEL SECURITY;

CREATE POLICY hmis_106a_elements_read ON hmis_106a_elements FOR SELECT USING (TRUE);

CREATE POLICY hts_events_clinic ON hts_events FOR ALL USING (
  EXISTS (
    SELECT 1 FROM staff s WHERE s.clinic_id = hts_events.clinic_id
      AND s.clerk_user_id = auth.jwt()->>'sub' AND s.is_active = TRUE
  )
);

CREATE POLICY hiv_care_clinic ON hiv_care_enrollments FOR ALL USING (
  EXISTS (
    SELECT 1 FROM staff s WHERE s.clinic_id = hiv_care_enrollments.clinic_id
      AND s.clerk_user_id = auth.jwt()->>'sub' AND s.is_active = TRUE
  )
);

CREATE POLICY vl_tests_clinic ON viral_load_tests FOR ALL USING (
  EXISTS (
    SELECT 1 FROM staff s WHERE s.clinic_id = viral_load_tests.clinic_id
      AND s.clerk_user_id = auth.jwt()->>'sub' AND s.is_active = TRUE
  )
);

CREATE POLICY tb_episodes_clinic ON tb_episodes FOR ALL USING (
  EXISTS (
    SELECT 1 FROM staff s WHERE s.clinic_id = tb_episodes.clinic_id
      AND s.clerk_user_id = auth.jwt()->>'sub' AND s.is_active = TRUE
  )
);

CREATE POLICY tpt_clinic ON tb_preventive_treatment FOR ALL USING (
  EXISTS (
    SELECT 1 FROM staff s WHERE s.clinic_id = tb_preventive_treatment.clinic_id
      AND s.clerk_user_id = auth.jwt()->>'sub' AND s.is_active = TRUE
  )
);

-- Bench tests commonly used in HIV/TB program workflows.
INSERT INTO lab_test_catalog (code, test_name, category, specimen, display_order) VALUES
  ('GENEXPERT', 'GeneXpert MTB/RIF',           'microbiology', 'sputum', 41),
  ('CD4',       'CD4 count',                   'serology',     'blood',  21),
  ('VIRAL_LOAD','HIV viral load',                'serology',     'blood',  22),
  ('CRAG',      'Cryptococcal antigen (CrAg)', 'serology',     'blood',  23)
ON CONFLICT (code) DO NOTHING;
