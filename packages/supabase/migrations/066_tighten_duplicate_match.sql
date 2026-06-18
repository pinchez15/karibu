-- 066_tighten_duplicate_match.sql
--
-- S-DEDUPE (#5) — the "Possible existing patient found" matcher was far too
-- loose: it wrapped rpc_search_patients with a ±3-year age band and accepted
-- any candidate scoring >= 0.3, so a shared village alone surfaced unrelated
-- people (e.g. "Theodore Swiggly", b.1956 matched "Tim Burke", 3y, same village).
--
-- New rule (locked): only surface a candidate when BOTH
--   * the name is identical or within 2 characters (Levenshtein <= 2 on the
--     normalized "first last"), AND
--   * the birth year is the same — approximated by equal derived age, which is
--     what the create-patient form supplies (p_age).
-- Village is no longer a match trigger (it remains a displayed reason badge).
-- When age is unknown (p_age NULL) we can't confirm birth year, so we only
-- surface an EXACT name match — avoiding false positives on name alone.

CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;

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
  v_name TEXT;
BEGIN
  v_name := lower(trim(COALESCE(p_first_name, '') || ' ' || COALESCE(p_last_name, '')));
  IF v_name = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH scored AS (
    SELECT
      p.*,
      patient_age_years(p.id) AS d_age,
      levenshtein(v_name, lower(trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')))) AS name_dist
    FROM patients p
    WHERE p.clinic_id = p_clinic_id
  )
  SELECT
    sc.id,
    sc.patient_id,
    sc.first_name,
    sc.last_name,
    sc.sex,
    sc.date_of_birth,
    sc.birth_year,
    sc.approximate_age,
    sc.dob_precision,
    sc.village,
    sc.parish,
    sc.guardian_name,
    sc.national_id,
    sc.whatsapp_number,
    sc.d_age AS derived_age,
    (1.0 - LEAST(sc.name_dist, 5)::REAL / 5.0) AS match_score,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN sc.name_dist = 0 THEN 'name_match' ELSE 'similar_name' END,
      CASE WHEN p_age IS NOT NULL AND sc.d_age = p_age THEN 'same_age' END,
      CASE WHEN p_village IS NOT NULL AND lower(sc.village) = lower(p_village) THEN 'same_village' END
    ], NULL) AS match_reasons
  FROM scored sc
  WHERE sc.name_dist <= 2
    AND (
      (p_age IS NOT NULL AND sc.d_age = p_age)   -- same name (<=2) AND same birth year
      OR (p_age IS NULL AND sc.name_dist = 0)     -- unknown age: only exact-name dups
    )
  ORDER BY sc.name_dist ASC, sc.d_age NULLS LAST
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION rpc_find_duplicate_candidates(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, INTEGER)
  TO authenticated, service_role;
