-- 111_retire_patients.sql — soft-retire duplicate patient registrations
-- =============================================================================
-- Front-desk staff sometimes register a returning patient a second time.
-- Locked design decision: soft-retire, never hard-delete — clinical rows
-- (visits, notes, vitals, payments) are preserved and keep resolving the
-- retired patient's name in historical joins and HMIS reports.
--
-- A retired patient:
--   * disappears from patient search / lists / check-in candidate flows
--     (web filters on retired_at IS NULL; rpc_find_duplicate_candidates is
--     redefined below to skip retired rows),
--   * keeps their chart reachable via old links — the web chart renders a
--     "Retired" banner pointing at merged_into_patient_id when set,
--   * keeps every historical visit intact (nothing here touches visits, so
--     HMIS 105 report counts are unchanged).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Additive retire columns
-- -----------------------------------------------------------------------------
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retired_by UUID REFERENCES staff(id),
  ADD COLUMN IF NOT EXISTS retired_reason TEXT,
  ADD COLUMN IF NOT EXISTS merged_into_patient_id UUID REFERENCES patients(id);

-- Active-patient scans (search / lists / dedupe) all filter on this.
CREATE INDEX IF NOT EXISTS idx_patients_clinic_active
  ON patients (clinic_id)
  WHERE retired_at IS NULL;

-- -----------------------------------------------------------------------------
-- 2. retire_patient — SECURITY DEFINER, admin-only, idempotent
-- -----------------------------------------------------------------------------
-- Gate order follows the house replay-tolerance style (migration 101):
-- assert clinic membership first, then short-circuit replays, then validate.
--
-- Role gate: destructive-adjacent, so admin only. Service-role callers (web
-- server actions bypass RLS) must pass the acting staff id via p_retired_by;
-- the function re-verifies that staff row is an active admin in the
-- patient's clinic (defense in depth on top of the server action's check).

CREATE OR REPLACE FUNCTION retire_patient(
  p_patient_id UUID,
  p_reason TEXT,
  p_merged_into UUID DEFAULT NULL,
  p_client_op_id UUID DEFAULT NULL,
  p_retired_by UUID DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_clinic_id UUID;
  v_retired_at TIMESTAMPTZ;
  v_actor UUID;
  v_actor_role TEXT;
  v_target_clinic UUID;
  v_target_retired TIMESTAMPTZ;
BEGIN
  SELECT clinic_id, retired_at INTO v_clinic_id, v_retired_at
  FROM patients WHERE id = p_patient_id;

  IF v_clinic_id IS NOT NULL THEN
    PERFORM assert_staff_in_clinic(v_clinic_id);
  END IF;

  IF sync_op_already_applied(p_client_op_id) THEN RETURN; END IF;

  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Patient not found'; END IF;

  IF karibu_is_service_role() THEN
    v_actor := p_retired_by;
  ELSE
    v_actor := get_current_staff_id();
  END IF;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Acting staff id required to retire a patient';
  END IF;

  SELECT role INTO v_actor_role FROM staff
  WHERE id = v_actor AND clinic_id = v_clinic_id AND is_active = TRUE;

  IF v_actor_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only an admin can retire a patient record';
  END IF;

  IF NULLIF(TRIM(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required to retire a patient';
  END IF;

  IF p_merged_into IS NOT NULL THEN
    IF p_merged_into = p_patient_id THEN
      RAISE EXCEPTION 'Cannot merge a patient into itself';
    END IF;

    SELECT clinic_id, retired_at INTO v_target_clinic, v_target_retired
    FROM patients WHERE id = p_merged_into;

    IF v_target_clinic IS NULL OR v_target_clinic IS DISTINCT FROM v_clinic_id THEN
      RAISE EXCEPTION 'Merge target not found in this clinic';
    END IF;
    IF v_target_retired IS NOT NULL THEN
      RAISE EXCEPTION 'Merge target is itself retired';
    END IF;
  END IF;

  -- Idempotent: already retired is a no-op success (record the op so a
  -- replayed client_op_id short-circuits at the gate next time).
  IF v_retired_at IS NOT NULL THEN
    PERFORM sync_op_record(
      p_client_op_id, v_clinic_id, 'retire_patient', 'patients', p_patient_id
    );
    RETURN;
  END IF;

  -- Refuse while the patient has an open visit today (Kampala calendar day,
  -- matching check_in_patient's visit_date stamp). Complete or cancel the
  -- visit first — retiring mid-visit would strand an active queue entry.
  IF EXISTS (
    SELECT 1 FROM visits
    WHERE patient_id = p_patient_id
      AND clinic_id = v_clinic_id
      AND visit_date = kampala_today()
      AND status IS DISTINCT FROM 'completed'
      AND queue_status IS DISTINCT FROM 'cancelled'
  ) THEN
    RAISE EXCEPTION 'Patient has an open visit today — complete or cancel it before retiring';
  END IF;

  UPDATE patients
  SET retired_at = NOW(),
      retired_by = v_actor,
      retired_reason = TRIM(p_reason),
      merged_into_patient_id = p_merged_into,
      updated_at = NOW()
  WHERE id = p_patient_id
    AND clinic_id = v_clinic_id;

  PERFORM sync_op_record(
    p_client_op_id, v_clinic_id, 'retire_patient', 'patients', p_patient_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION retire_patient(UUID, TEXT, UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION retire_patient(UUID, TEXT, UUID, UUID, UUID)
  TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. rpc_find_duplicate_candidates — exclude retired rows
-- -----------------------------------------------------------------------------
-- Same signature and matching rules as migration 066; the only change is
-- `p.retired_at IS NULL` in the scored CTE so a retired duplicate can no
-- longer surface as an "existing patient" candidate at registration.

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
      AND p.retired_at IS NULL
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

COMMIT;
