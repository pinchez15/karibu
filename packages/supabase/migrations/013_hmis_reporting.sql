-- Migration 013: HMIS 105 Reporting
-- Adds sex to patients, HMIS diagnosis codes lookup, visit diagnosis coding,
-- and aggregation function for HMIS 105 monthly OPD report generation.

-- 1a. Add sex to patients
ALTER TABLE patients ADD COLUMN IF NOT EXISTS sex TEXT CHECK (sex IN ('M', 'F'));

-- 1b. HMIS diagnosis codes lookup table
CREATE TABLE IF NOT EXISTS hmis_diagnosis_codes (
  id SERIAL PRIMARY KEY,
  hmis_code TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  display_name TEXT NOT NULL,
  icd10_codes TEXT[],
  sort_order INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT TRUE
);

-- 1c. Visit diagnosis codes junction table
CREATE TABLE IF NOT EXISTS visit_diagnosis_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  hmis_code_id INTEGER NOT NULL REFERENCES hmis_diagnosis_codes(id),
  confidence NUMERIC,
  source TEXT NOT NULL DEFAULT 'ai'
    CHECK (source IN ('ai', 'manual', 'ai_confirmed')),
  coded_by UUID REFERENCES staff(id),
  coded_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(visit_id, hmis_code_id)
);

CREATE INDEX IF NOT EXISTS idx_visit_diagnosis_codes_visit ON visit_diagnosis_codes(visit_id);
CREATE INDEX IF NOT EXISTS idx_visit_diagnosis_codes_hmis ON visit_diagnosis_codes(hmis_code_id);

-- Seed HMIS 105 OPD diagnosis line items
INSERT INTO hmis_diagnosis_codes (hmis_code, category, subcategory, display_name, icd10_codes, sort_order) VALUES
  ('HMIS_105_1.1',  'Malaria',           'Confirmed (microscopy/RDT)', 'Malaria - Confirmed',              ARRAY['B50','B51','B52','B53','B54'], 1),
  ('HMIS_105_1.2',  'Malaria',           'Clinical (suspected)',       'Malaria - Clinical (suspected)',    ARRAY['B54'],                         2),
  ('HMIS_105_2.1',  'Pneumonia',         NULL,                         'Pneumonia',                         ARRAY['J12','J13','J14','J15','J16','J17','J18'], 3),
  ('HMIS_105_3.1',  'Diarrhoea',         'Acute watery',               'Diarrhoea - Acute watery',         ARRAY['A09','K52.9'],                 4),
  ('HMIS_105_3.2',  'Diarrhoea',         'Bloody (dysentery)',         'Diarrhoea - Bloody (dysentery)',    ARRAY['A06.0','A03','A04'],           5),
  ('HMIS_105_3.3',  'Diarrhoea',         'Persistent',                 'Diarrhoea - Persistent',           ARRAY['A09','K52.9'],                 6),
  ('HMIS_105_4',    'Urinary Tract Infection', NULL,                   'Urinary Tract Infection',           ARRAY['N39.0','N30'],                 7),
  ('HMIS_105_5',    'Intestinal Worms',  NULL,                         'Intestinal Worms',                  ARRAY['B76','B77','B79','B68','B82'], 8),
  ('HMIS_105_6',    'Skin Diseases',     NULL,                         'Skin Diseases',                     ARRAY['L00','L08','L20','L30','B35','B36','B37'], 9),
  ('HMIS_105_7',    'Eye Conditions',    NULL,                         'Eye Conditions',                    ARRAY['H10','H00','H04','H16'],       10),
  ('HMIS_105_8',    'Ear Conditions',    NULL,                         'Ear Conditions',                    ARRAY['H60','H65','H66','H70'],       11),
  ('HMIS_105_9',    'Dental Conditions', NULL,                         'Dental Conditions',                 ARRAY['K00','K01','K02','K04','K05'], 12),
  ('HMIS_105_10',   'Injuries',          'Road traffic',               'Injuries - Road traffic',           ARRAY['V01-V99'],                     13),
  ('HMIS_105_11',   'Injuries',          'Other trauma',               'Injuries - Other trauma',           ARRAY['W00-X59','S00-T98'],           14),
  ('HMIS_105_12',   'Anaemia',           NULL,                         'Anaemia',                           ARRAY['D50','D51','D52','D53','D64'], 15),
  ('HMIS_105_13',   'Hypertension',      NULL,                         'Hypertension',                      ARRAY['I10','I11','I12','I13','I15'], 16),
  ('HMIS_105_14',   'Diabetes Mellitus', NULL,                         'Diabetes Mellitus',                 ARRAY['E10','E11','E13','E14'],       17),
  ('HMIS_105_15',   'Mental Health Disorders', NULL,                   'Mental Health Disorders',            ARRAY['F00','F20','F30','F32','F40','F41','F99'], 18),
  ('HMIS_105_16',   'Epilepsy',          NULL,                         'Epilepsy',                          ARRAY['G40','G41'],                   19),
  ('HMIS_105_17',   'HIV/AIDS',          'New positive',               'HIV/AIDS - New positive',           ARRAY['B20','B21','B22','B23','B24'], 20),
  ('HMIS_105_18',   'Tuberculosis',      'New',                        'Tuberculosis - New',                ARRAY['A15','A16','A19'],             21),
  ('HMIS_105_19',   'Tuberculosis',      'Relapse',                    'Tuberculosis - Relapse',            ARRAY['A15','A16','A19'],             22),
  ('HMIS_105_20',   'Sexually Transmitted Infections', NULL,           'Sexually Transmitted Infections',   ARRAY['A50','A51','A52','A54','A55','A56','A63','A64'], 23),
  ('HMIS_105_21',   'Hepatitis B',       NULL,                         'Hepatitis B',                       ARRAY['B16','B18.1'],                 24),
  ('HMIS_105_22',   'Typhoid Fever',     NULL,                         'Typhoid Fever',                     ARRAY['A01.0'],                       25),
  ('HMIS_105_23',   'Measles',           NULL,                         'Measles',                           ARRAY['B05'],                         26),
  ('HMIS_105_24',   'Meningitis',        NULL,                         'Meningitis',                        ARRAY['G00','G01','G02','G03'],       27),
  ('HMIS_105_25',   'Cough / Cold (URTI)', NULL,                      'Cough / Cold (URTI)',               ARRAY['J00','J01','J02','J03','J04','J06'], 28),
  ('HMIS_105_26',   'Abdominal Conditions', NULL,                     'Abdominal Conditions',              ARRAY['K35','K40','K59','R10'],       29),
  ('HMIS_105_27',   'Musculoskeletal Conditions', NULL,               'Musculoskeletal Conditions',         ARRAY['M54','M79','M25'],             30),
  ('HMIS_105_28',   'Malnutrition',      NULL,                         'Malnutrition',                      ARRAY['E40','E41','E42','E43','E44','E46'], 31),
  ('HMIS_105_29',   'Obstetric Conditions', NULL,                     'Obstetric Conditions',               ARRAY['O00','O10','O20','O60','O80'], 32),
  ('HMIS_105_30',   'Neonatal Conditions', NULL,                      'Neonatal Conditions',                ARRAY['P07','P22','P36','P59'],       33),
  ('HMIS_105_31',   'Cardiovascular Disease', NULL,                   'Cardiovascular Disease (other)',     ARRAY['I20','I25','I50','I63','I64'], 34),
  ('HMIS_105_32',   'Asthma',            NULL,                         'Asthma',                            ARRAY['J45','J46'],                   35),
  ('HMIS_105_33',   'Sickle Cell Disease', NULL,                      'Sickle Cell Disease',                ARRAY['D57'],                         36),
  ('HMIS_105_34',   'Cancer',            NULL,                         'Cancer (all types)',                 ARRAY['C00-C97'],                     37),
  ('HMIS_105_35',   'Poisoning',         NULL,                         'Poisoning',                         ARRAY['T36-T65'],                     38),
  ('HMIS_105_36',   'Animal Bites',      NULL,                         'Animal Bites (rabies exposure)',     ARRAY['W54','T14.1'],                 39),
  ('HMIS_105_99',   'Other Diagnoses',   NULL,                         'All Other Diagnoses',               ARRAY[]::TEXT[],                       40),
  ('HMIS_105_OPD_DEATHS', 'OPD Deaths',  NULL,                        'Deaths in OPD',                     ARRAY[]::TEXT[],                       41)
ON CONFLICT (hmis_code) DO NOTHING;


-- 1d. Aggregation function for HMIS 105 report
CREATE OR REPLACE FUNCTION generate_hmis_105(
  p_clinic_id UUID,
  p_year INT,
  p_month INT
)
RETURNS TABLE (
  hmis_code TEXT,
  display_name TEXT,
  sort_order INT,
  male_0_28d BIGINT,
  female_0_28d BIGINT,
  male_29d_4y BIGINT,
  female_29d_4y BIGINT,
  male_5_14y BIGINT,
  female_5_14y BIGINT,
  male_15_59y BIGINT,
  female_15_59y BIGINT,
  male_60plus BIGINT,
  female_60plus BIGINT,
  total BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  period_start DATE;
  period_end DATE;
BEGIN
  period_start := make_date(p_year, p_month, 1);
  period_end := (period_start + INTERVAL '1 month')::DATE;

  RETURN QUERY
  SELECT
    h.hmis_code,
    h.display_name,
    h.sort_order,
    -- Male 0-28 days
    COUNT(*) FILTER (WHERE p.sex = 'M' AND age_days >= 0 AND age_days <= 28)::BIGINT AS male_0_28d,
    -- Female 0-28 days
    COUNT(*) FILTER (WHERE p.sex = 'F' AND age_days >= 0 AND age_days <= 28)::BIGINT AS female_0_28d,
    -- Male 29 days - 4 years
    COUNT(*) FILTER (WHERE p.sex = 'M' AND age_days > 28 AND age_years < 5)::BIGINT AS male_29d_4y,
    -- Female 29 days - 4 years
    COUNT(*) FILTER (WHERE p.sex = 'F' AND age_days > 28 AND age_years < 5)::BIGINT AS female_29d_4y,
    -- Male 5-14 years
    COUNT(*) FILTER (WHERE p.sex = 'M' AND age_years >= 5 AND age_years <= 14)::BIGINT AS male_5_14y,
    -- Female 5-14 years
    COUNT(*) FILTER (WHERE p.sex = 'F' AND age_years >= 5 AND age_years <= 14)::BIGINT AS female_5_14y,
    -- Male 15-59 years
    COUNT(*) FILTER (WHERE p.sex = 'M' AND age_years >= 15 AND age_years <= 59)::BIGINT AS male_15_59y,
    -- Female 15-59 years
    COUNT(*) FILTER (WHERE p.sex = 'F' AND age_years >= 15 AND age_years <= 59)::BIGINT AS female_15_59y,
    -- Male 60+
    COUNT(*) FILTER (WHERE p.sex = 'M' AND age_years >= 60)::BIGINT AS male_60plus,
    -- Female 60+
    COUNT(*) FILTER (WHERE p.sex = 'F' AND age_years >= 60)::BIGINT AS female_60plus,
    -- Total (count non-NULL join rows only; LEFT JOIN produces NULLs for unmatched codes)
    COUNT(p.hmis_code_id)::BIGINT AS total
  FROM hmis_diagnosis_codes h
  LEFT JOIN (
    SELECT
      vdc.hmis_code_id,
      pat.sex,
      pat.date_of_birth,
      CASE
        WHEN pat.date_of_birth IS NOT NULL
        THEN (v.visit_date::DATE - pat.date_of_birth::DATE)
        ELSE NULL
      END AS age_days,
      CASE
        WHEN pat.date_of_birth IS NOT NULL
        THEN EXTRACT(YEAR FROM age(v.visit_date::DATE, pat.date_of_birth::DATE))::INT
        ELSE NULL
      END AS age_years
    FROM visit_diagnosis_codes vdc
    JOIN visits v ON v.id = vdc.visit_id
    JOIN patients pat ON pat.id = v.patient_id
    WHERE v.clinic_id = p_clinic_id
      AND v.visit_date >= period_start
      AND v.visit_date < period_end
      AND v.status IN ('sent', 'completed')
  ) p ON p.hmis_code_id = h.id
  WHERE h.is_active = TRUE
  GROUP BY h.hmis_code, h.display_name, h.sort_order
  ORDER BY h.sort_order;
END;
$$;

-- RLS policies for new tables
ALTER TABLE hmis_diagnosis_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_diagnosis_codes ENABLE ROW LEVEL SECURITY;

-- hmis_diagnosis_codes: readable by all authenticated staff (lookup table)
CREATE POLICY hmis_codes_read ON hmis_diagnosis_codes
  FOR SELECT USING (TRUE);

-- visit_diagnosis_codes: staff can read/write for visits in their clinic
CREATE POLICY visit_dx_read ON visit_diagnosis_codes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM visits v
      JOIN staff s ON s.clinic_id = v.clinic_id
      WHERE v.id = visit_diagnosis_codes.visit_id
        AND s.clerk_user_id = auth.jwt()->>'sub'
        AND s.is_active = TRUE
    )
  );

CREATE POLICY visit_dx_insert ON visit_diagnosis_codes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM visits v
      JOIN staff s ON s.clinic_id = v.clinic_id
      WHERE v.id = visit_diagnosis_codes.visit_id
        AND s.clerk_user_id = auth.jwt()->>'sub'
        AND s.is_active = TRUE
    )
  );

CREATE POLICY visit_dx_delete ON visit_diagnosis_codes
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM visits v
      JOIN staff s ON s.clinic_id = v.clinic_id
      WHERE v.id = visit_diagnosis_codes.visit_id
        AND s.clerk_user_id = auth.jwt()->>'sub'
        AND s.is_active = TRUE
    )
  );
