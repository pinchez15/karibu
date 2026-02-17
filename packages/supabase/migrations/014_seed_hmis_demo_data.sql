-- ============================================================
-- HMIS DEMO SEED DATA
-- Adds sex to demo patients, assigns HMIS diagnosis codes to
-- finalized demo visits. Run after 013_hmis_reporting.sql.
-- Copy-paste into Supabase SQL Editor to seed.
-- ============================================================

-- ============================================================
-- 1. UPDATE PATIENT SEX
-- ============================================================
-- Based on names from the demo seed data

UPDATE patients SET sex = 'F' WHERE id = '00000000-0000-0000-0000-000000000201'; -- Asiimwe Patience (F)
UPDATE patients SET sex = 'M' WHERE id = '00000000-0000-0000-0000-000000000202'; -- Mugisha Robert (M)
UPDATE patients SET sex = 'F' WHERE id = '00000000-0000-0000-0000-000000000203'; -- Natukunda Grace (F)
UPDATE patients SET sex = 'M' WHERE id = '00000000-0000-0000-0000-000000000204'; -- Tumusiime David (M)
UPDATE patients SET sex = 'F' WHERE id = '00000000-0000-0000-0000-000000000205'; -- Kyomuhendo Florence (F)
UPDATE patients SET sex = 'F' WHERE id = '00000000-0000-0000-0000-000000000206'; -- Ampumuza Joy (F)
UPDATE patients SET sex = 'F' WHERE id = '00000000-0000-0000-0000-000000000207'; -- Ninsiima Betty (F)
UPDATE patients SET sex = 'M' WHERE id = '00000000-0000-0000-0000-000000000208'; -- Twinomugisha Emmanuel (M)
UPDATE patients SET sex = 'F' WHERE id = '00000000-0000-0000-0000-000000000209'; -- Kabagambe Sarah (F)
UPDATE patients SET sex = 'M' WHERE id = '00000000-0000-0000-0000-000000000210'; -- Byamukama Peter (M)
UPDATE patients SET sex = 'F' WHERE id = '00000000-0000-0000-0000-000000000211'; -- Kemigisha Diana (F)
UPDATE patients SET sex = 'M' WHERE id = '00000000-0000-0000-0000-000000000212'; -- Owomugisha Ivan (M)

-- ============================================================
-- 2. FIX AGGREGATION FUNCTION (total was counting LEFT JOIN nulls)
-- ============================================================

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
    COUNT(p.hmis_code_id) FILTER (WHERE p.sex = 'M' AND age_days >= 0 AND age_days <= 28)::BIGINT AS male_0_28d,
    COUNT(p.hmis_code_id) FILTER (WHERE p.sex = 'F' AND age_days >= 0 AND age_days <= 28)::BIGINT AS female_0_28d,
    COUNT(p.hmis_code_id) FILTER (WHERE p.sex = 'M' AND age_days > 28 AND age_years < 5)::BIGINT AS male_29d_4y,
    COUNT(p.hmis_code_id) FILTER (WHERE p.sex = 'F' AND age_days > 28 AND age_years < 5)::BIGINT AS female_29d_4y,
    COUNT(p.hmis_code_id) FILTER (WHERE p.sex = 'M' AND age_years >= 5 AND age_years <= 14)::BIGINT AS male_5_14y,
    COUNT(p.hmis_code_id) FILTER (WHERE p.sex = 'F' AND age_years >= 5 AND age_years <= 14)::BIGINT AS female_5_14y,
    COUNT(p.hmis_code_id) FILTER (WHERE p.sex = 'M' AND age_years >= 15 AND age_years <= 59)::BIGINT AS male_15_59y,
    COUNT(p.hmis_code_id) FILTER (WHERE p.sex = 'F' AND age_years >= 15 AND age_years <= 59)::BIGINT AS female_15_59y,
    COUNT(p.hmis_code_id) FILTER (WHERE p.sex = 'M' AND age_years >= 60)::BIGINT AS male_60plus,
    COUNT(p.hmis_code_id) FILTER (WHERE p.sex = 'F' AND age_years >= 60)::BIGINT AS female_60plus,
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

-- ============================================================
-- 3. ASSIGN HMIS DIAGNOSIS CODES TO FINALIZED DEMO VISITS
-- ============================================================
-- Only finalized visits (status='sent'/'completed') are included in
-- the HMIS 105 report. The demo data has these finalized visits:
--
-- Visit 301: Asiimwe Patience - HIV diagnosis (90 days ago)
-- Visit 302: Asiimwe Patience - ART initiation (45 days ago)
-- Visit 303: Mugisha Robert  - HTN + DM diagnosis (180 days ago)
-- Visit 304: Mugisha Robert  - HTN/DM follow-up (90 days ago)
-- Visit 305: Natukunda Grace - ANC booking (60 days ago)
-- Visit 306: Natukunda Grace - ANC 24 weeks (30 days ago)
-- Visit 307: Tumusiime David - Sickle cell VOC crisis (120 days ago)
-- Visit 308: Tumusiime David - Hydroxyurea initiation (60 days ago)
-- Visit 322: Owomugisha Ivan - BPH (today, sent)
--
-- Today's visits 311 (Asiimwe, review) and 321 (Kemigisha, review)
-- are in 'review' status — not 'sent'/'completed' — so they won't
-- appear in the HMIS report yet. Included here for coding practice.

-- Clean up any previous demo HMIS coding
DELETE FROM visit_diagnosis_codes WHERE visit_id IN (
  '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000302',
  '00000000-0000-0000-0000-000000000303',
  '00000000-0000-0000-0000-000000000304',
  '00000000-0000-0000-0000-000000000305',
  '00000000-0000-0000-0000-000000000306',
  '00000000-0000-0000-0000-000000000307',
  '00000000-0000-0000-0000-000000000308',
  '00000000-0000-0000-0000-000000000311',
  '00000000-0000-0000-0000-000000000321',
  '00000000-0000-0000-0000-000000000322'
);

-- Visit 301: Asiimwe Patience — HIV diagnosis
-- Dx: HIV Stage 3
INSERT INTO visit_diagnosis_codes (visit_id, hmis_code_id, confidence, source)
SELECT '00000000-0000-0000-0000-000000000301', id, 0.95, 'ai_confirmed'
FROM hmis_diagnosis_codes WHERE hmis_code = 'HMIS_105_17';  -- HIV/AIDS

-- Visit 302: Asiimwe Patience — ART initiation follow-up
-- Dx: HIV on treatment (still coded as HIV)
INSERT INTO visit_diagnosis_codes (visit_id, hmis_code_id, confidence, source)
SELECT '00000000-0000-0000-0000-000000000302', id, 0.95, 'ai_confirmed'
FROM hmis_diagnosis_codes WHERE hmis_code = 'HMIS_105_17';  -- HIV/AIDS

-- Visit 303: Mugisha Robert — HTN + DM diagnosis
-- Dx: Hypertension, Diabetes
INSERT INTO visit_diagnosis_codes (visit_id, hmis_code_id, confidence, source)
SELECT '00000000-0000-0000-0000-000000000303', id, 0.92, 'ai_confirmed'
FROM hmis_diagnosis_codes WHERE hmis_code = 'HMIS_105_13';  -- Hypertension

INSERT INTO visit_diagnosis_codes (visit_id, hmis_code_id, confidence, source)
SELECT '00000000-0000-0000-0000-000000000303', id, 0.90, 'ai_confirmed'
FROM hmis_diagnosis_codes WHERE hmis_code = 'HMIS_105_14';  -- Diabetes

-- Visit 304: Mugisha Robert — HTN/DM follow-up
-- Dx: Hypertension, Diabetes (follow-up counts as a new OPD attendance)
INSERT INTO visit_diagnosis_codes (visit_id, hmis_code_id, confidence, source)
SELECT '00000000-0000-0000-0000-000000000304', id, 0.95, 'ai_confirmed'
FROM hmis_diagnosis_codes WHERE hmis_code = 'HMIS_105_13';  -- Hypertension

INSERT INTO visit_diagnosis_codes (visit_id, hmis_code_id, confidence, source)
SELECT '00000000-0000-0000-0000-000000000304', id, 0.93, 'ai_confirmed'
FROM hmis_diagnosis_codes WHERE hmis_code = 'HMIS_105_14';  -- Diabetes

-- Visit 305: Natukunda Grace — ANC booking
-- Dx: Obstetric condition (ANC, G2P1)
INSERT INTO visit_diagnosis_codes (visit_id, hmis_code_id, confidence, source)
SELECT '00000000-0000-0000-0000-000000000305', id, 0.88, 'ai_confirmed'
FROM hmis_diagnosis_codes WHERE hmis_code = 'HMIS_105_29';  -- Obstetric Conditions

-- Visit 306: Natukunda Grace — ANC 24 weeks
-- Dx: Obstetric condition + Hypertension (pre-eclampsia risk)
INSERT INTO visit_diagnosis_codes (visit_id, hmis_code_id, confidence, source)
SELECT '00000000-0000-0000-0000-000000000306', id, 0.90, 'ai_confirmed'
FROM hmis_diagnosis_codes WHERE hmis_code = 'HMIS_105_29';  -- Obstetric Conditions

INSERT INTO visit_diagnosis_codes (visit_id, hmis_code_id, confidence, source)
SELECT '00000000-0000-0000-0000-000000000306', id, 0.72, 'ai'
FROM hmis_diagnosis_codes WHERE hmis_code = 'HMIS_105_13';  -- Hypertension (trace proteinuria)

-- Visit 307: Tumusiime David — Sickle cell VOC crisis
-- Dx: Sickle cell disease, Anaemia
INSERT INTO visit_diagnosis_codes (visit_id, hmis_code_id, confidence, source)
SELECT '00000000-0000-0000-0000-000000000307', id, 0.97, 'ai_confirmed'
FROM hmis_diagnosis_codes WHERE hmis_code = 'HMIS_105_33';  -- Sickle Cell Disease

INSERT INTO visit_diagnosis_codes (visit_id, hmis_code_id, confidence, source)
SELECT '00000000-0000-0000-0000-000000000307', id, 0.85, 'ai_confirmed'
FROM hmis_diagnosis_codes WHERE hmis_code = 'HMIS_105_12';  -- Anaemia

-- Visit 308: Tumusiime David — Hydroxyurea initiation
-- Dx: Sickle cell disease (ongoing management)
INSERT INTO visit_diagnosis_codes (visit_id, hmis_code_id, confidence, source)
SELECT '00000000-0000-0000-0000-000000000308', id, 0.96, 'ai_confirmed'
FROM hmis_diagnosis_codes WHERE hmis_code = 'HMIS_105_33';  -- Sickle Cell Disease

-- Visit 311: Asiimwe Patience — TB-IRIS (today, status='review')
-- Dx: TB new, HIV
INSERT INTO visit_diagnosis_codes (visit_id, hmis_code_id, confidence, source)
SELECT '00000000-0000-0000-0000-000000000311', id, 0.88, 'ai'
FROM hmis_diagnosis_codes WHERE hmis_code = 'HMIS_105_18';  -- TB New

INSERT INTO visit_diagnosis_codes (visit_id, hmis_code_id, confidence, source)
SELECT '00000000-0000-0000-0000-000000000311', id, 0.92, 'ai'
FROM hmis_diagnosis_codes WHERE hmis_code = 'HMIS_105_17';  -- HIV/AIDS

-- Visit 321: Kemigisha Diana — Recurrent UTI (today, status='review')
-- Dx: UTI
INSERT INTO visit_diagnosis_codes (visit_id, hmis_code_id, confidence, source)
SELECT '00000000-0000-0000-0000-000000000321', id, 0.95, 'ai'
FROM hmis_diagnosis_codes WHERE hmis_code = 'HMIS_105_4';   -- UTI

-- Visit 322: Owomugisha Ivan — BPH (today, status='sent')
-- Dx: No exact HMIS code for BPH → Other Diagnoses + Hypertension (controlled)
INSERT INTO visit_diagnosis_codes (visit_id, hmis_code_id, confidence, source)
SELECT '00000000-0000-0000-0000-000000000322', id, 0.80, 'ai_confirmed'
FROM hmis_diagnosis_codes WHERE hmis_code = 'HMIS_105_99';  -- Other Diagnoses

INSERT INTO visit_diagnosis_codes (visit_id, hmis_code_id, confidence, source)
SELECT '00000000-0000-0000-0000-000000000322', id, 0.70, 'ai'
FROM hmis_diagnosis_codes WHERE hmis_code = 'HMIS_105_13';  -- Hypertension (on amlodipine)

-- ============================================================
-- VERIFICATION QUERIES (run after seeding to confirm)
-- ============================================================

-- Check patient sex was set
-- SELECT id, display_name, sex, date_of_birth FROM patients
-- WHERE id LIKE '00000000-0000-0000-0000-0000000002%'
-- ORDER BY id;

-- Check diagnosis codes assigned
-- SELECT v.visit_date, p.display_name, h.display_name AS hmis_diagnosis, vdc.source, vdc.confidence
-- FROM visit_diagnosis_codes vdc
-- JOIN visits v ON v.id = vdc.visit_id
-- JOIN patients p ON p.id = v.patient_id
-- JOIN hmis_diagnosis_codes h ON h.id = vdc.hmis_code_id
-- ORDER BY v.visit_date, p.display_name;

-- Test the report function for current month (today's visits)
-- SELECT * FROM generate_hmis_105('30033fce-aab4-4d87-b580-191d516f60b2', 2026, 2);

-- Test for a historical month (e.g., November 2025 = ~90 days ago)
-- SELECT * FROM generate_hmis_105('30033fce-aab4-4d87-b580-191d516f60b2', 2025, 11);
