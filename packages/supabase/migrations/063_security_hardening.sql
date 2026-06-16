-- 063_security_hardening.sql
--
-- Closes the anon fail-open authorization holes found in the June 2026
-- security review. Root causes:
--
--   1. assert_staff_in_clinic (045) returned early — skipping ALL checks —
--      whenever the JWT had no `sub`, to let service-role callers through.
--      But the clinical RPCs are granted TO anon, and a bare anon-key
--      request also has no `sub`, so an unauthenticated caller holding the
--      public anon key (shipped in every client) passed every staff check.
--   2. The identity helpers (get_current_clinic_id / get_current_staff_id /
--      get_current_staff_role) return NULL when there is no staff match, and
--      callers compare with `!=` / `NOT IN`, which never raises on NULL —
--      so role and clinic gates fail OPEN for anon and for authenticated
--      Clerk users with no staff row.
--   3. The 053-060 inpatient/ANC/ebola tables shipped with no RLS at all,
--      and their per-id read RPCs filter only by the id passed in (IDOR).
--   4. `USING (true)` SELECT policies exposed note addendums/amendments and
--      stock movements (with visit linkage) to the anon key (043/044).
--
-- Design (matches how the clients actually authenticate):
--   - service_role (web server actions, edge functions, Inngest): TRUSTED.
--     They pre-scope every query by staff.clinic_id in app code. Helpers
--     keep returning NULL for service callers — existing function bodies
--     treat NULL as the trusted service path, and that contract is kept.
--   - authenticated (Android, Clerk JWT with `sub`): must map to an active
--     staff row; helpers now RAISE instead of returning NULL when they
--     don't. Clinic membership enforced via assert_staff_in_clinic.
--   - anon: no EXECUTE on any application function, no readable PHI.
--
-- DEPLOY ORDER NOTE: 062_hmis_corrections.sql (fix/hmis-correctness branch)
-- recreates check_in_patient and generate_hmis_105 WITHOUT this hardening
-- (it predates this file). 062 must be applied BEFORE 063 — which numeric
-- ordering guarantees in a combined deploy — and must never be re-applied
-- after 063. This file re-bases both functions on 062's bodies, so applying
-- 062 then 063 yields timezone fixes + hardening.

-- ============================================================================
-- 1. kampala_today() — defensive copy of 062's helper so this migration is
--    self-contained if it is deployed before 062 lands.
-- ============================================================================

CREATE OR REPLACE FUNCTION kampala_today()
RETURNS DATE AS $$
  SELECT (NOW() AT TIME ZONE 'Africa/Kampala')::DATE;
$$ LANGUAGE sql STABLE;

-- ============================================================================
-- 2. karibu_is_service_role() — is this call trusted backend traffic?
-- ============================================================================
-- PostgREST always sets request.jwt.claims. A missing/empty setting means a
-- direct database session (migrations, pg_cron, dashboard SQL) — trusted.
-- An anon-key request has claims with role 'anon' — NOT trusted.

CREATE OR REPLACE FUNCTION karibu_is_service_role()
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_claims TEXT;
BEGIN
  v_claims := current_setting('request.jwt.claims', true);
  IF v_claims IS NULL OR v_claims = '' THEN
    RETURN TRUE;  -- direct DB session, not PostgREST
  END IF;
  RETURN COALESCE(v_claims::jsonb->>'role', '') = 'service_role';
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE;
END;
$$;

-- ============================================================================
-- 3. assert_staff_in_clinic — fail CLOSED for everyone except service_role
-- ============================================================================
-- Replaces 045's version, whose "no sub -> skip" shortcut was the anon hole.

CREATE OR REPLACE FUNCTION assert_staff_in_clinic(p_clinic_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clerk_user_id TEXT;
BEGIN
  IF p_clinic_id IS NULL THEN
    RAISE EXCEPTION 'clinic_id required';
  END IF;

  IF karibu_is_service_role() THEN
    RETURN;  -- web server actions / edge functions pre-scope by clinic
  END IF;

  v_clerk_user_id := auth.jwt()->>'sub';
  IF v_clerk_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM staff
    WHERE clinic_id = p_clinic_id
      AND clerk_user_id = v_clerk_user_id
      AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Staff not authorized for this clinic';
  END IF;
END;
$$;

-- ============================================================================
-- 4. Identity helpers — RAISE instead of returning NULL for untrusted callers
-- ============================================================================
-- Every RPC from 029-051 gates with patterns like
--   IF v_clinic != get_current_clinic_id() THEN RAISE
--   IF get_current_staff_role() NOT IN (...) THEN RAISE
-- which are no-ops when the helper returns NULL. Rather than recreating ~40
-- functions, the helpers themselves now fail closed: a non-service caller
-- with no active staff row gets an exception, so every NULL-pass comparison
-- upstream becomes unreachable. Service callers keep getting NULL (the
-- existing trusted-path contract). Deactivated staff are now locked out of
-- all three (002's originals did not filter is_active).

CREATE OR REPLACE FUNCTION get_current_clinic_id()
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sub TEXT;
  v_clinic UUID;
BEGIN
  IF karibu_is_service_role() THEN
    RETURN NULL;
  END IF;
  v_sub := auth.jwt()->>'sub';
  IF v_sub IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  SELECT clinic_id INTO v_clinic FROM staff
  WHERE clerk_user_id = v_sub
    AND is_active = TRUE
    AND deactivated_at IS NULL
  LIMIT 1;
  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'No active staff record for caller';
  END IF;
  RETURN v_clinic;
END;
$$;

CREATE OR REPLACE FUNCTION get_current_staff_id()
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sub TEXT;
  v_id UUID;
BEGIN
  IF karibu_is_service_role() THEN
    RETURN NULL;
  END IF;
  v_sub := auth.jwt()->>'sub';
  IF v_sub IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  SELECT id INTO v_id FROM staff
  WHERE clerk_user_id = v_sub
    AND is_active = TRUE
    AND deactivated_at IS NULL
  LIMIT 1;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'No active staff record for caller';
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION get_current_staff_role()
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sub TEXT;
  v_role TEXT;
BEGIN
  IF karibu_is_service_role() THEN
    RETURN NULL;
  END IF;
  v_sub := auth.jwt()->>'sub';
  IF v_sub IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  SELECT role INTO v_role FROM staff
  WHERE clerk_user_id = v_sub
    AND is_active = TRUE
    AND deactivated_at IS NULL
  LIMIT 1;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'No active staff record for caller';
  END IF;
  RETURN v_role;
END;
$$;

-- ============================================================================
-- 5. Queue family — caller membership was only checked when the client
--    volunteered a p_staff_id. assert_staff_in_clinic added to each.
-- ============================================================================

-- Drop the stale 008-era overloads so the unhardened versions can't be
-- invoked by explicit signature (027 already did this for check_in_patient).
DROP FUNCTION IF EXISTS mark_ready_for_doctor(UUID);
DROP FUNCTION IF EXISTS complete_visit_queue(UUID);

-- Base: 062 (kampala_today). Adds caller assert; keeps the existing
-- p_staff_id consistency check on top.
CREATE OR REPLACE FUNCTION check_in_patient(
  p_clinic_id UUID,
  p_patient_id UUID,
  p_chief_complaint TEXT DEFAULT NULL,
  p_priority TEXT DEFAULT 'normal',
  p_staff_id UUID DEFAULT NULL,
  p_department TEXT DEFAULT 'opd'
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_visit_id UUID;
  v_queue_position INTEGER;
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);

  IF p_staff_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM staff
      WHERE id = p_staff_id
        AND clinic_id = p_clinic_id
        AND is_active = TRUE
    ) THEN
      RAISE EXCEPTION 'Staff not authorized for this clinic';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM patients WHERE id = p_patient_id AND clinic_id = p_clinic_id
  ) THEN
    RAISE EXCEPTION 'Patient not found in this clinic';
  END IF;

  SELECT COALESCE(MAX(queue_position), 0) + 1
  INTO v_queue_position
  FROM visits
  WHERE clinic_id = p_clinic_id
    AND visit_date = kampala_today();

  INSERT INTO visits (
    clinic_id,
    patient_id,
    status,
    queue_status,
    queue_position,
    checked_in_at,
    chief_complaint,
    priority,
    visit_date,
    department
  ) VALUES (
    p_clinic_id,
    p_patient_id,
    'pending',
    'waiting',
    v_queue_position,
    NOW(),
    p_chief_complaint,
    p_priority,
    kampala_today(),
    p_department
  )
  RETURNING id INTO v_visit_id;

  RETURN v_visit_id;
END;
$$;

-- Base: 024. Adds caller assert after the clinic lookup.
CREATE OR REPLACE FUNCTION assign_to_nurse(
  p_visit_id UUID,
  p_nurse_id UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Visit not found';
  END IF;

  PERFORM assert_staff_in_clinic(v_clinic_id);

  IF NOT EXISTS (
    SELECT 1 FROM staff
    WHERE id = p_nurse_id
      AND clinic_id = v_clinic_id
      AND is_active = TRUE
      AND role IN ('doctor', 'clinical_officer', 'midwife', 'nurse', 'nursing_assistant', 'admin')
  ) THEN
    RAISE EXCEPTION 'Staff not authorized to triage at this clinic';
  END IF;

  UPDATE visits
  SET
    nurse_id = p_nurse_id,
    queue_status = 'with_nurse'
  WHERE id = p_visit_id
    AND queue_status = 'waiting';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visit not in waiting status';
  END IF;
END;
$$;

-- Base: 010 (latest definition). Adds caller assert after the visit lookup.
CREATE OR REPLACE FUNCTION mark_ready_for_doctor(
  p_visit_id UUID,
  p_staff_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_visit RECORD;
BEGIN
  SELECT * INTO v_visit FROM visits WHERE id = p_visit_id;

  IF v_visit IS NULL THEN
    RAISE EXCEPTION 'Visit not found';
  END IF;

  PERFORM assert_staff_in_clinic(v_visit.clinic_id);

  IF p_staff_id IS NOT NULL THEN
    IF v_visit.nurse_id != p_staff_id THEN
      IF NOT EXISTS (
        SELECT 1 FROM staff
        WHERE id = p_staff_id
          AND clinic_id = v_visit.clinic_id
          AND role = 'admin'
          AND is_active = TRUE
      ) THEN
        RAISE EXCEPTION 'Only assigned nurse or admin can mark ready';
      END IF;
    END IF;
  END IF;

  UPDATE visits
  SET queue_status = 'ready_for_doctor'
  WHERE id = p_visit_id
    AND queue_status = 'with_nurse';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visit not in with_nurse status';
  END IF;
END;
$$;

-- Base: 024. Adds caller assert after the clinic lookup.
CREATE OR REPLACE FUNCTION claim_patient(
  p_visit_id UUID,
  p_doctor_id UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Visit not found';
  END IF;

  PERFORM assert_staff_in_clinic(v_clinic_id);

  IF NOT EXISTS (
    SELECT 1 FROM staff
    WHERE id = p_doctor_id
      AND clinic_id = v_clinic_id
      AND is_active = TRUE
      AND role IN ('doctor', 'clinical_officer', 'midwife', 'nurse', 'admin')
  ) THEN
    RAISE EXCEPTION 'Staff not authorized as lead clinician for this clinic';
  END IF;

  UPDATE visits
  SET
    doctor_id = p_doctor_id,
    queue_status = 'with_doctor'
  WHERE id = p_visit_id
    AND queue_status = 'ready_for_doctor';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visit not in ready_for_doctor status';
  END IF;
END;
$$;

-- Base: 024. Adds caller assert after the clinic lookup.
CREATE OR REPLACE FUNCTION start_visit_self_triage(
  p_visit_id UUID,
  p_clinician_id UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Visit not found';
  END IF;

  PERFORM assert_staff_in_clinic(v_clinic_id);

  IF NOT EXISTS (
    SELECT 1 FROM staff
    WHERE id = p_clinician_id
      AND clinic_id = v_clinic_id
      AND is_active = TRUE
      AND role IN ('doctor', 'clinical_officer', 'midwife', 'nurse', 'admin')
  ) THEN
    RAISE EXCEPTION 'Staff not authorized as lead clinician for this clinic';
  END IF;

  UPDATE visits
  SET
    doctor_id = p_clinician_id,
    nurse_id = COALESCE(nurse_id, p_clinician_id),
    queue_status = 'with_doctor'
  WHERE id = p_visit_id
    AND queue_status = 'waiting';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visit not in waiting status (cannot self-triage)';
  END IF;
END;
$$;

-- Base: 037. Adds caller assert after the visit lookup.
CREATE OR REPLACE FUNCTION complete_visit_queue(
  p_visit_id UUID,
  p_staff_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_visit RECORD;
BEGIN
  SELECT * INTO v_visit FROM visits WHERE id = p_visit_id;

  IF v_visit IS NULL THEN
    RAISE EXCEPTION 'Visit not found';
  END IF;

  PERFORM assert_staff_in_clinic(v_visit.clinic_id);

  IF p_staff_id IS NOT NULL THEN
    IF v_visit.doctor_id IS DISTINCT FROM p_staff_id THEN
      IF NOT EXISTS (
        SELECT 1 FROM staff
        WHERE id = p_staff_id
          AND clinic_id = v_visit.clinic_id
          AND role IN ('admin','doctor','nurse','clinical_officer','midwife','nursing_assistant','records_officer')
          AND is_active = TRUE
      ) THEN
        RAISE EXCEPTION 'Only assigned clinician, records officer, or admin can complete visit';
      END IF;
    END IF;
  END IF;

  UPDATE visits
  SET queue_status = 'completed',
      status = 'completed',
      finalized_at = COALESCE(finalized_at, NOW()),
      updated_at = NOW()
  WHERE id = p_visit_id
    AND queue_status != 'cancelled';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visit cannot be completed from cancelled queue status';
  END IF;
END;
$$;

-- ============================================================================
-- 6. 053-060 read RPCs — were pure id-filtered SELECTs with no caller check
--    (IDOR: any admission/pregnancy/visit UUID read any clinic's record).
--    Each now derives the owning clinic and asserts membership. Unknown ids
--    return empty rather than acting as an existence oracle.
-- ============================================================================

-- Base: 053.
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
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);
  RETURN QUERY
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
END;
$$;

-- Base: 053.
CREATE OR REPLACE FUNCTION rpc_admission_observations(p_admission_id UUID)
RETURNS SETOF admission_observations
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT a.clinic_id INTO v_clinic_id FROM admissions a WHERE a.id = p_admission_id;
  IF v_clinic_id IS NULL THEN RETURN; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  RETURN QUERY
  SELECT * FROM admission_observations
  WHERE admission_id = p_admission_id
  ORDER BY observed_at DESC;
END;
$$;

-- Base: 054.
CREATE OR REPLACE FUNCTION rpc_admission_medication_orders(p_admission_id UUID)
RETURNS SETOF medication_orders
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT a.clinic_id INTO v_clinic_id FROM admissions a WHERE a.id = p_admission_id;
  IF v_clinic_id IS NULL THEN RETURN; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  RETURN QUERY
  SELECT * FROM medication_orders
  WHERE admission_id = p_admission_id
  ORDER BY active DESC, created_at DESC;
END;
$$;

-- Base: 054.
CREATE OR REPLACE FUNCTION rpc_admission_medication_admins(p_admission_id UUID)
RETURNS SETOF medication_administrations
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT a.clinic_id INTO v_clinic_id FROM admissions a WHERE a.id = p_admission_id;
  IF v_clinic_id IS NULL THEN RETURN; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  RETURN QUERY
  SELECT * FROM medication_administrations
  WHERE admission_id = p_admission_id
  ORDER BY administered_at DESC;
END;
$$;

-- Base: 056.
CREATE OR REPLACE FUNCTION rpc_admission_delivery(p_admission_id UUID)
RETURNS SETOF deliveries
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT a.clinic_id INTO v_clinic_id FROM admissions a WHERE a.id = p_admission_id;
  IF v_clinic_id IS NULL THEN RETURN; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  RETURN QUERY
  SELECT * FROM deliveries WHERE admission_id = p_admission_id LIMIT 1;
END;
$$;

-- Base: 057.
CREATE OR REPLACE FUNCTION rpc_admission_postnatal_obs(p_admission_id UUID)
RETURNS SETOF postnatal_observations
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT a.clinic_id INTO v_clinic_id FROM admissions a WHERE a.id = p_admission_id;
  IF v_clinic_id IS NULL THEN RETURN; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  RETURN QUERY
  SELECT * FROM postnatal_observations
  WHERE admission_id = p_admission_id
  ORDER BY observed_at DESC;
END;
$$;

-- Base: 058.
CREATE OR REPLACE FUNCTION rpc_admission_notes(p_admission_id UUID)
RETURNS TABLE (
  id UUID,
  admission_id UUID,
  note TEXT,
  author_name TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT a.clinic_id INTO v_clinic_id FROM admissions a WHERE a.id = p_admission_id;
  IF v_clinic_id IS NULL THEN RETURN; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  RETURN QUERY
  SELECT n.id, n.admission_id, n.note, s.display_name, n.created_at
  FROM admission_notes n
  LEFT JOIN staff s ON s.id = n.recorded_by
  WHERE n.admission_id = p_admission_id
  ORDER BY n.created_at DESC;
END;
$$;

-- Base: 059.
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
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);
  RETURN QUERY
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
END;
$$;

-- Base: 059.
CREATE OR REPLACE FUNCTION rpc_pregnancy_contacts(p_pregnancy_id UUID)
RETURNS SETOF anc_contacts
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT pg.clinic_id INTO v_clinic_id FROM pregnancies pg WHERE pg.id = p_pregnancy_id;
  IF v_clinic_id IS NULL THEN RETURN; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  RETURN QUERY
  SELECT * FROM anc_contacts WHERE pregnancy_id = p_pregnancy_id ORDER BY contact_date DESC;
END;
$$;

-- Base: 060.
CREATE OR REPLACE FUNCTION rpc_visit_ebola_screening(p_visit_id UUID)
RETURNS SETOF ebola_screenings
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT v.clinic_id INTO v_clinic_id FROM visits v WHERE v.id = p_visit_id;
  IF v_clinic_id IS NULL THEN RETURN; END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);
  RETURN QUERY
  SELECT * FROM ebola_screenings WHERE visit_id = p_visit_id ORDER BY created_at DESC LIMIT 1;
END;
$$;

-- ============================================================================
-- 7. generate_hmis_105 — Ministry aggregates were callable for ANY clinic by
--    any token. Body identical to 062's (confirmed-codes filter, dob_precision
--    age derivation); adds the caller assert.
-- ============================================================================

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
SET search_path = public, pg_temp
AS $$
DECLARE
  period_start DATE;
  period_end DATE;
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);

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
      CASE
        WHEN pat.dob_precision = 'exact' AND pat.date_of_birth IS NOT NULL
        THEN (v.visit_date::DATE - pat.date_of_birth::DATE)
        ELSE NULL
      END AS age_days,
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
      AND vdc.source IN ('manual', 'ai_confirmed')
  ) p ON p.hmis_code_id = h.id
  WHERE h.is_active = TRUE
  GROUP BY h.hmis_code, h.display_name, h.sort_order
  ORDER BY h.sort_order;
END;
$$;

-- ============================================================================
-- 8. rpc_record_payment — clients could attribute payments to any staff id.
--    Base: 045. Non-service callers now always record as themselves.
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_record_payment(
  p_id UUID,
  p_visit_id UUID,
  p_clinic_id UUID,
  p_patient_id UUID,
  p_amount_ugx INTEGER,
  p_payment_method TEXT,
  p_status TEXT DEFAULT 'paid',
  p_service_type TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_collected_by UUID DEFAULT NULL,
  p_client_op_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_collected_by UUID;
  v_row payments%ROWTYPE;
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);

  IF sync_op_already_applied(p_client_op_id) THEN
    SELECT * INTO v_row FROM payments WHERE id = p_id;
    IF FOUND THEN
      RETURN jsonb_build_object('id', v_row.id, 'receipt_number', v_row.receipt_number);
    END IF;
    RETURN jsonb_build_object('id', p_id, 'receipt_number', '');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM visits
    WHERE id = p_visit_id AND clinic_id = p_clinic_id AND patient_id = p_patient_id
  ) THEN
    RAISE EXCEPTION 'Visit/patient/clinic mismatch';
  END IF;

  IF karibu_is_service_role() THEN
    -- Web server actions pass the acting staff id (already clinic-scoped).
    v_collected_by := p_collected_by;
  ELSE
    -- Clients record payments as themselves; caller-supplied attribution
    -- is ignored.
    v_collected_by := get_current_staff_id();
  END IF;
  IF v_collected_by IS NULL THEN
    RAISE EXCEPTION 'collected_by required';
  END IF;

  INSERT INTO payments (
    id, visit_id, clinic_id, patient_id,
    amount_ugx, payment_method, status,
    service_type, notes, collected_by
  ) VALUES (
    p_id, p_visit_id, p_clinic_id, p_patient_id,
    p_amount_ugx, p_payment_method, p_status,
    p_service_type, p_notes, v_collected_by
  )
  ON CONFLICT (id) DO UPDATE SET
    amount_ugx = EXCLUDED.amount_ugx,
    payment_method = EXCLUDED.payment_method,
    status = EXCLUDED.status,
    service_type = EXCLUDED.service_type,
    notes = EXCLUDED.notes,
    updated_at = NOW();

  SELECT * INTO v_row FROM payments WHERE id = p_id;

  PERFORM sync_op_record(
    p_client_op_id, p_clinic_id, 'record_payment', 'payments', p_id
  );

  RETURN jsonb_build_object(
    'id', v_row.id,
    'receipt_number', v_row.receipt_number
  );
END;
$$;

-- ============================================================================
-- 9. rpc_append_consult_message — clients could insert role='assistant' rows
--    (forged AI replies). Base: 049. Assistant/system rows are now writable
--    only by service_role (the consult-chat edge function).
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_append_consult_message(
  p_thread_id UUID,
  p_role TEXT,
  p_content TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinic UUID;
  v_msg_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic FROM consult_threads WHERE id = p_thread_id;
  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT karibu_is_service_role() THEN
    IF v_clinic IS DISTINCT FROM get_current_clinic_id() THEN
      RAISE EXCEPTION 'Unauthorized';
    END IF;
    IF p_role <> 'user' THEN
      RAISE EXCEPTION 'Only user messages may be appended by clients';
    END IF;
  END IF;

  IF p_role NOT IN ('user', 'assistant', 'system') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  INSERT INTO consult_messages (thread_id, role, content)
  VALUES (p_thread_id, p_role, TRIM(p_content))
  RETURNING id INTO v_msg_id;

  UPDATE consult_threads SET updated_at = NOW() WHERE id = p_thread_id;
  RETURN v_msg_id;
END;
$$;

-- ============================================================================
-- 10. RLS for the 053-060 tables (shipped with none). Reads from clients go
--     through the RPCs above (verified: Android SupabaseApi uses rpc/ for all
--     of these), so clinic-scoped SELECT for authenticated is defense in
--     depth; writes stay default-deny (SECURITY DEFINER RPCs bypass RLS).
-- ============================================================================

ALTER TABLE admission_observations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE medication_orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE medication_administrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE postnatal_observations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_notes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE pregnancies                ENABLE ROW LEVEL SECURITY;
ALTER TABLE anc_contacts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE ebola_screenings           ENABLE ROW LEVEL SECURITY;

CREATE POLICY admission_observations_select_clinic ON admission_observations
  FOR SELECT TO authenticated USING (clinic_id = get_current_clinic_id());
CREATE POLICY medication_orders_select_clinic ON medication_orders
  FOR SELECT TO authenticated USING (clinic_id = get_current_clinic_id());
CREATE POLICY medication_administrations_select_clinic ON medication_administrations
  FOR SELECT TO authenticated USING (clinic_id = get_current_clinic_id());
CREATE POLICY deliveries_select_clinic ON deliveries
  FOR SELECT TO authenticated USING (clinic_id = get_current_clinic_id());
CREATE POLICY postnatal_observations_select_clinic ON postnatal_observations
  FOR SELECT TO authenticated USING (clinic_id = get_current_clinic_id());
CREATE POLICY admission_notes_select_clinic ON admission_notes
  FOR SELECT TO authenticated USING (clinic_id = get_current_clinic_id());
CREATE POLICY pregnancies_select_clinic ON pregnancies
  FOR SELECT TO authenticated USING (clinic_id = get_current_clinic_id());
CREATE POLICY anc_contacts_select_clinic ON anc_contacts
  FOR SELECT TO authenticated USING (clinic_id = get_current_clinic_id());
CREATE POLICY ebola_screenings_select_clinic ON ebola_screenings
  FOR SELECT TO authenticated USING (clinic_id = get_current_clinic_id());

-- ============================================================================
-- 11. Replace the USING (true) anon SELECT policies (043, 044) with
--     clinic-scoped authenticated-only versions.
-- ============================================================================

DROP POLICY IF EXISTS pharmacy_stock_items_select_clinic ON pharmacy_stock_items;
CREATE POLICY pharmacy_stock_items_select_clinic ON pharmacy_stock_items
  FOR SELECT TO authenticated USING (clinic_id = get_current_clinic_id());

DROP POLICY IF EXISTS pharmacy_stock_movements_select_clinic ON pharmacy_stock_movements;
CREATE POLICY pharmacy_stock_movements_select_clinic ON pharmacy_stock_movements
  FOR SELECT TO authenticated USING (clinic_id = get_current_clinic_id());

DROP POLICY IF EXISTS lab_stock_items_select_clinic ON lab_stock_items;
CREATE POLICY lab_stock_items_select_clinic ON lab_stock_items
  FOR SELECT TO authenticated USING (clinic_id = get_current_clinic_id());

DROP POLICY IF EXISTS lab_stock_movements_select_clinic ON lab_stock_movements;
CREATE POLICY lab_stock_movements_select_clinic ON lab_stock_movements
  FOR SELECT TO authenticated USING (clinic_id = get_current_clinic_id());

DROP POLICY IF EXISTS provider_note_addendums_select ON provider_note_addendums;
CREATE POLICY provider_note_addendums_select ON provider_note_addendums
  FOR SELECT TO authenticated USING (clinic_id = get_current_clinic_id());

DROP POLICY IF EXISTS provider_note_amendments_select ON provider_note_amendments;
CREATE POLICY provider_note_amendments_select ON provider_note_amendments
  FOR SELECT TO authenticated USING (clinic_id = get_current_clinic_id());

-- ============================================================================
-- 12. Patient-level hard-delete protection. Deleting one patient row
--     currently cascades away the entire medical + financial history
--     (visits -> notes/payments/...). Patient-level FKs become RESTRICT;
--     child-of-parent cascades (e.g. observations under an admission) are
--     intentionally left as-is.
-- ============================================================================

DO $$
DECLARE
  t RECORD;
  v_conname TEXT;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('visits',         'patient_id', 'patients'),
      ('payments',       'patient_id', 'patients'),
      ('payments',       'visit_id',   'visits'),
      ('provider_notes', 'patient_id', 'patients'),
      ('admissions',     'patient_id', 'patients'),
      ('pregnancies',    'patient_id', 'patients')
    ) AS x(child_table, child_col, parent_table)
  LOOP
    SELECT c.conname INTO v_conname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f'
      AND c.conrelid = t.child_table::regclass
      AND c.confrelid = t.parent_table::regclass
      AND a.attname = t.child_col
      AND array_length(c.conkey, 1) = 1
    LIMIT 1;

    IF v_conname IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', t.child_table, v_conname);
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE RESTRICT',
        t.child_table, t.child_table || '_' || t.child_col || '_fkey',
        t.child_col, t.parent_table
      );
    END IF;
    v_conname := NULL;
  END LOOP;
END $$;

-- ============================================================================
-- 13. Function privileges. Postgres grants EXECUTE to PUBLIC by default, and
--     dozens of RPCs were additionally granted TO anon. Nothing legitimate
--     calls application functions as anon (Android always attaches the Clerk
--     JWT; web and edge functions use service_role), so: revoke PUBLIC/anon
--     on every non-extension function in public, grant authenticated +
--     service_role, and fix the default for future functions.
-- ============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_proc'::regclass
          AND d.objid = p.oid
          AND d.deptype = 'e'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;

-- ============================================================================
-- 14. search_path hardening for every SECURITY DEFINER function in public
--     (052 set the convention; almost nothing before it complied).
-- ============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.prosecdef
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_proc'::regclass
          AND d.objid = p.oid
          AND d.deptype = 'e'
      )
  LOOP
    -- `extensions` included in case pg_trgm/vector live there on the deployed
    -- project (nonexistent schemas in a search_path are skipped harmlessly).
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions, pg_temp', r.sig);
  END LOOP;
END $$;
