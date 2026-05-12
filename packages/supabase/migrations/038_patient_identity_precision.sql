-- Migration 038: Patient identity precision + location + fuzzy search (Phase 1)
--
-- First concrete step of docs/patient-centered-architecture-plan.md.
-- Adds Uganda-appropriate identity capture: patients can be registered without
-- an exact date of birth (using birth year, approximate age, or no age info),
-- with village/parish/guardian/national_id as secondary identifiers. Adds
-- trigram-indexed fuzzy patient search and a duplicate-candidate RPC that
-- replaces the exact-name+exact-DOB Room query in Android PatientDao.
--
-- HMIS 105: generate_hmis_105 (last set in migration 024) currently reads
-- pat.date_of_birth directly and silently excludes patients without it. This
-- migration updates it to derive age from the best available source
-- (exact > birth_year > approximate_age + age_recorded_at), so subsidy
-- reporting works for the typical Ugandan rural patient who may know only
-- the year of their birth or their approximate age. The 0-28 day neonatal
-- bucket still requires exact DOB; older patients fall through to the year
-- buckets via the derived age_years.
--
-- Pre-launch: no production patients. Demo seed rows in 012 have date_of_birth
-- set, so we backfill dob_precision='exact' for them; the new table-level
-- consistency CHECK then holds. New patient registration writes precision
-- explicitly from the UI.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =============================================================================
-- 1. Identity columns: DOB precision model
-- =============================================================================

ALTER TABLE patients ADD COLUMN IF NOT EXISTS birth_year SMALLINT
  CHECK (birth_year IS NULL OR (birth_year >= 1900 AND birth_year <= EXTRACT(YEAR FROM CURRENT_DATE)));

ALTER TABLE patients ADD COLUMN IF NOT EXISTS approximate_age SMALLINT
  CHECK (approximate_age IS NULL OR (approximate_age >= 0 AND approximate_age <= 130));

ALTER TABLE patients ADD COLUMN IF NOT EXISTS age_recorded_at TIMESTAMPTZ;

ALTER TABLE patients ADD COLUMN IF NOT EXISTS dob_precision TEXT NOT NULL DEFAULT 'unknown'
  CHECK (dob_precision IN ('exact','year_only','age_estimate','unknown'));

-- Backfill demo seed rows: any pre-existing patient with date_of_birth set
-- was entered with intent (the old UI required it), so flag them as 'exact'.
-- Production has no rows yet (pre-launch) so this only touches 012 demo data.
UPDATE patients
  SET dob_precision = 'exact'
  WHERE date_of_birth IS NOT NULL
    AND dob_precision = 'unknown';

-- Table-level consistency: the precision must match what's populated.
-- Added after backfill so demo seed data passes the constraint.
ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_dob_precision_consistent;
ALTER TABLE patients ADD CONSTRAINT patients_dob_precision_consistent CHECK (
  (dob_precision = 'exact'        AND date_of_birth IS NOT NULL)
  OR (dob_precision = 'year_only' AND birth_year IS NOT NULL)
  OR (dob_precision = 'age_estimate' AND approximate_age IS NOT NULL AND age_recorded_at IS NOT NULL)
  OR (dob_precision = 'unknown')
);

-- =============================================================================
-- 2. Identity columns: location + guardian + national id
-- =============================================================================
-- Ugandan administrative hierarchy: village < parish < subcounty < district.
-- In rural HC III catchment, village + parish are the primary disambiguators
-- when DOB and phone are unknown. guardian_name is useful for paediatric
-- patients and the elderly. national_id is rare in the rural catchment but
-- worth indexing when present.

ALTER TABLE patients ADD COLUMN IF NOT EXISTS village TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS parish TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS subcounty TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS district TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS guardian_name TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS national_id TEXT;

-- =============================================================================
-- 3. Indexes for fuzzy lookup
-- =============================================================================
-- pg_trgm GIN indexes for fuzzy name + village search. Partial b-tree indexes
-- on clinic-scoped location fields for exact filters.

CREATE INDEX IF NOT EXISTS idx_patients_first_name_trgm
  ON patients USING gin (first_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_patients_last_name_trgm
  ON patients USING gin (last_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_patients_village_trgm
  ON patients USING gin (village gin_trgm_ops) WHERE village IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patients_clinic_village
  ON patients (clinic_id, village) WHERE village IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patients_clinic_parish
  ON patients (clinic_id, parish) WHERE parish IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patients_clinic_national_id
  ON patients (clinic_id, national_id) WHERE national_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patients_clinic_guardian
  ON patients (clinic_id, guardian_name) WHERE guardian_name IS NOT NULL;

-- =============================================================================
-- 4. Age helper — derive age in years from the best available source
-- =============================================================================
-- HMIS reporting and any downstream "what age band is this patient?" question
-- routes through here. Returns NULL only when dob_precision='unknown' (or when
-- the row is inconsistent, which the table CHECK constraint should prevent).
--
-- STABLE because the result only depends on the row + CURRENT_DATE; PostgreSQL
-- can reuse the computation within a single statement.

CREATE OR REPLACE FUNCTION patient_age_years(p_patient_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_precision TEXT;
  v_dob DATE;
  v_birth_year SMALLINT;
  v_approx_age SMALLINT;
  v_age_recorded_at TIMESTAMPTZ;
BEGIN
  SELECT dob_precision, date_of_birth, birth_year, approximate_age, age_recorded_at
    INTO v_precision, v_dob, v_birth_year, v_approx_age, v_age_recorded_at
    FROM patients WHERE id = p_patient_id;

  IF v_precision = 'exact' AND v_dob IS NOT NULL THEN
    RETURN EXTRACT(YEAR FROM age(CURRENT_DATE, v_dob))::INTEGER;
  ELSIF v_precision = 'year_only' AND v_birth_year IS NOT NULL THEN
    RETURN EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER - v_birth_year::INTEGER;
  ELSIF v_precision = 'age_estimate' AND v_approx_age IS NOT NULL AND v_age_recorded_at IS NOT NULL THEN
    RETURN v_approx_age + EXTRACT(YEAR FROM age(CURRENT_DATE, v_age_recorded_at::DATE))::INTEGER;
  ELSE
    RETURN NULL;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION patient_age_years(UUID) TO anon, authenticated, service_role;

-- =============================================================================
-- 5. rpc_search_patients — locality-aware fuzzy lookup
-- =============================================================================
-- Returns matches ranked by composite score (name similarity boosted by
-- location/id matches) with per-row match_reasons[] so the UI can show why
-- a candidate appeared. Requires at least one filter; with no filters, returns
-- nothing rather than a full clinic scan.
--
-- Auth pattern follows 022's get_clinic_queue: explicit p_clinic_id, Clerk
-- callers must be active staff at that clinic, service-role callers pass
-- through (web server actions are scoped explicitly at the app layer).

CREATE OR REPLACE FUNCTION rpc_search_patients(
  p_clinic_id UUID,
  p_query TEXT DEFAULT NULL,
  p_village TEXT DEFAULT NULL,
  p_parish TEXT DEFAULT NULL,
  p_national_id TEXT DEFAULT NULL,
  p_age_min INTEGER DEFAULT NULL,
  p_age_max INTEGER DEFAULT NULL,
  p_sex TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 20
) RETURNS TABLE (
  id UUID,
  patient_id BIGINT,
  first_name TEXT,
  last_name TEXT,
  sex TEXT,
  date_of_birth DATE,
  birth_year SMALLINT,
  approximate_age SMALLINT,
  dob_precision TEXT,
  village TEXT,
  parish TEXT,
  guardian_name TEXT,
  national_id TEXT,
  whatsapp_number TEXT,
  derived_age INTEGER,
  match_score REAL,
  match_reasons TEXT[]
) AS $$
DECLARE
  v_clerk_user_id TEXT;
BEGIN
  v_clerk_user_id := auth.jwt()->>'sub';
  IF v_clerk_user_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM staff
      WHERE clinic_id = p_clinic_id
        AND clerk_user_id = v_clerk_user_id
        AND is_active = TRUE
    ) THEN
      RAISE EXCEPTION 'Staff not authorized for this clinic';
    END IF;
  END IF;

  RETURN QUERY
  WITH candidate AS (
    SELECT
      p.id, p.patient_id, p.first_name, p.last_name, p.sex,
      p.date_of_birth, p.birth_year, p.approximate_age, p.dob_precision,
      p.village, p.parish, p.guardian_name, p.national_id, p.whatsapp_number,
      patient_age_years(p.id) AS derived_age,
      CASE WHEN p_query IS NULL THEN 0::REAL
        ELSE GREATEST(
          similarity(COALESCE(p.first_name, ''), p_query),
          similarity(COALESCE(p.last_name, ''), p_query),
          similarity(COALESCE(trim(p.first_name || ' ' || p.last_name), ''), p_query)
        )::REAL
      END AS name_sim,
      ARRAY_REMOVE(ARRAY[
        CASE WHEN p_query IS NOT NULL AND (
          p.first_name % p_query OR
          p.last_name % p_query OR
          p.first_name ILIKE '%' || p_query || '%' OR
          p.last_name ILIKE '%' || p_query || '%'
        ) THEN 'name_match' END,
        CASE WHEN p_village IS NOT NULL AND p.village ILIKE p_village THEN 'same_village' END,
        CASE WHEN p_parish IS NOT NULL AND p.parish ILIKE p_parish THEN 'same_parish' END,
        CASE WHEN p_national_id IS NOT NULL AND p.national_id = p_national_id THEN 'national_id_match' END,
        CASE WHEN p_age_min IS NOT NULL AND p_age_max IS NOT NULL
          AND patient_age_years(p.id) BETWEEN p_age_min AND p_age_max THEN 'age_match' END
      ], NULL) AS match_reasons_arr
    FROM patients p
    WHERE p.clinic_id = p_clinic_id
      AND (p_sex IS NULL OR p.sex = p_sex)
      AND (
        (p_query IS NOT NULL AND (
          p.first_name % p_query OR
          p.last_name % p_query OR
          p.first_name ILIKE '%' || p_query || '%' OR
          p.last_name ILIKE '%' || p_query || '%'
        ))
        OR (p_village IS NOT NULL AND p.village ILIKE p_village)
        OR (p_parish IS NOT NULL AND p.parish ILIKE p_parish)
        OR (p_national_id IS NOT NULL AND p.national_id = p_national_id)
      )
  )
  SELECT
    c.id, c.patient_id, c.first_name, c.last_name, c.sex,
    c.date_of_birth, c.birth_year, c.approximate_age, c.dob_precision,
    c.village, c.parish, c.guardian_name, c.national_id, c.whatsapp_number,
    c.derived_age,
    (c.name_sim
      + CASE WHEN 'same_village' = ANY(c.match_reasons_arr) THEN 0.5::REAL ELSE 0::REAL END
      + CASE WHEN 'same_parish' = ANY(c.match_reasons_arr) THEN 0.3::REAL ELSE 0::REAL END
      + CASE WHEN 'national_id_match' = ANY(c.match_reasons_arr) THEN 1.0::REAL ELSE 0::REAL END
      + CASE WHEN 'age_match' = ANY(c.match_reasons_arr) THEN 0.2::REAL ELSE 0::REAL END
    )::REAL AS match_score,
    c.match_reasons_arr AS match_reasons
  FROM candidate c
  WHERE array_length(c.match_reasons_arr, 1) > 0
  ORDER BY match_score DESC, c.last_name, c.first_name
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION rpc_search_patients(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, INTEGER)
  TO anon, authenticated;

-- =============================================================================
-- 6. rpc_find_duplicate_candidates — used by new-patient registration
-- =============================================================================
-- Wraps rpc_search_patients with a ±3-year age band around an approximate age
-- and a match-score threshold to filter noise. Called from Android (replaces
-- PatientDao.findLikelyDuplicate) and web (replaces inline ilike check in
-- createPatientWithVisit).

CREATE OR REPLACE FUNCTION rpc_find_duplicate_candidates(
  p_clinic_id UUID,
  p_first_name TEXT,
  p_last_name TEXT,
  p_village TEXT DEFAULT NULL,
  p_parish TEXT DEFAULT NULL,
  p_age INTEGER DEFAULT NULL,
  p_sex TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 5
) RETURNS TABLE (
  id UUID,
  patient_id BIGINT,
  first_name TEXT,
  last_name TEXT,
  sex TEXT,
  date_of_birth DATE,
  birth_year SMALLINT,
  approximate_age SMALLINT,
  dob_precision TEXT,
  village TEXT,
  parish TEXT,
  guardian_name TEXT,
  national_id TEXT,
  whatsapp_number TEXT,
  derived_age INTEGER,
  match_score REAL,
  match_reasons TEXT[]
) AS $$
DECLARE
  v_age_min INTEGER;
  v_age_max INTEGER;
  v_query TEXT;
BEGIN
  v_query := trim(COALESCE(p_first_name, '') || ' ' || COALESCE(p_last_name, ''));
  IF v_query = '' THEN
    v_query := NULL;
  END IF;
  IF p_age IS NOT NULL THEN
    v_age_min := GREATEST(0, p_age - 3);
    v_age_max := p_age + 3;
  END IF;

  RETURN QUERY
  SELECT s.*
  FROM rpc_search_patients(
    p_clinic_id := p_clinic_id,
    p_query := v_query,
    p_village := p_village,
    p_parish := p_parish,
    p_age_min := v_age_min,
    p_age_max := v_age_max,
    p_sex := p_sex,
    p_limit := p_limit
  ) s
  WHERE s.match_score >= 0.3;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION rpc_find_duplicate_candidates(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, INTEGER)
  TO anon, authenticated;

-- =============================================================================
-- 7. generate_hmis_105 — derive age from best available source
-- =============================================================================
-- Replaces migration 024's version. Same structure; the age_days and age_years
-- derivations now consult dob_precision. age_days (neonatal bucket) requires
-- exact DOB; age_years works for exact, year_only, and age_estimate. Patients
-- with dob_precision='unknown' still drop out — they have no derivable age.

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
    COUNT(*) FILTER (WHERE p.sex = 'M' AND age_days IS NOT NULL AND age_days >= 0 AND age_days <= 28)::BIGINT AS male_0_28d,
    COUNT(*) FILTER (WHERE p.sex = 'F' AND age_days IS NOT NULL AND age_days >= 0 AND age_days <= 28)::BIGINT AS female_0_28d,
    COUNT(*) FILTER (WHERE p.sex = 'M' AND age_years IS NOT NULL AND (age_days IS NULL OR age_days > 28) AND age_years < 5)::BIGINT AS male_29d_4y,
    COUNT(*) FILTER (WHERE p.sex = 'F' AND age_years IS NOT NULL AND (age_days IS NULL OR age_days > 28) AND age_years < 5)::BIGINT AS female_29d_4y,
    COUNT(*) FILTER (WHERE p.sex = 'M' AND age_years IS NOT NULL AND age_years >= 5 AND age_years <= 14)::BIGINT AS male_5_14y,
    COUNT(*) FILTER (WHERE p.sex = 'F' AND age_years IS NOT NULL AND age_years >= 5 AND age_years <= 14)::BIGINT AS female_5_14y,
    COUNT(*) FILTER (WHERE p.sex = 'M' AND age_years IS NOT NULL AND age_years >= 15 AND age_years <= 59)::BIGINT AS male_15_59y,
    COUNT(*) FILTER (WHERE p.sex = 'F' AND age_years IS NOT NULL AND age_years >= 15 AND age_years <= 59)::BIGINT AS female_15_59y,
    COUNT(*) FILTER (WHERE p.sex = 'M' AND age_years IS NOT NULL AND age_years >= 60)::BIGINT AS male_60plus,
    COUNT(*) FILTER (WHERE p.sex = 'F' AND age_years IS NOT NULL AND age_years >= 60)::BIGINT AS female_60plus,
    COUNT(p.hmis_code_id)::BIGINT AS total
  FROM hmis_diagnosis_codes h
  LEFT JOIN (
    SELECT
      vdc.hmis_code_id,
      pat.sex,
      -- age_days: only computable when DOB is exact. Neonatal bucket (0-28d)
      -- requires it; year_only / age_estimate patients have age_days NULL and
      -- fall through to the year buckets via age_years.
      CASE
        WHEN pat.dob_precision = 'exact' AND pat.date_of_birth IS NOT NULL
        THEN (v.visit_date::DATE - pat.date_of_birth::DATE)
        ELSE NULL
      END AS age_days,
      -- age_years: best available source per dob_precision.
      CASE
        WHEN pat.dob_precision = 'exact' AND pat.date_of_birth IS NOT NULL
          THEN EXTRACT(YEAR FROM age(v.visit_date::DATE, pat.date_of_birth::DATE))::INT
        WHEN pat.dob_precision = 'year_only' AND pat.birth_year IS NOT NULL
          THEN EXTRACT(YEAR FROM v.visit_date::DATE)::INT - pat.birth_year::INT
        WHEN pat.dob_precision = 'age_estimate' AND pat.approximate_age IS NOT NULL AND pat.age_recorded_at IS NOT NULL
          THEN pat.approximate_age::INT
            + (EXTRACT(YEAR FROM v.visit_date::DATE)::INT - EXTRACT(YEAR FROM pat.age_recorded_at::DATE)::INT)
        ELSE NULL
      END AS age_years
    FROM visit_diagnosis_codes vdc
    JOIN visits v ON v.id = vdc.visit_id
    JOIN patients pat ON pat.id = v.patient_id
    WHERE v.clinic_id = p_clinic_id
      AND v.visit_date >= period_start
      AND v.visit_date < period_end
      AND v.status IN ('sent', 'completed')
      AND v.department = 'opd'
  ) p ON p.hmis_code_id = h.id
  WHERE h.is_active = TRUE
  GROUP BY h.hmis_code, h.display_name, h.sort_order
  ORDER BY h.sort_order;
END;
$$;
