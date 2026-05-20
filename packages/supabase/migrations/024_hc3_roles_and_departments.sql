-- Migration 024: HC III roles and departments
--
-- Prepares the schema for the diocesan HC III rollout (and the 69 other
-- HC II/III/IV clinics behind it). Three substantive changes plus two latent
-- bug fixes that fall in the same area.
--
-- Substantive:
--   1. Expand staff.role from ('admin','doctor','nurse') to also accept the
--      Ugandan MoH HC III roster: clinical_officer, midwife, nursing_assistant,
--      records_officer, lab_tech, dispenser. The legacy 'doctor' and 'nurse'
--      values stay valid — the web app, shared types, and Clerk webhook are
--      hard-coded against them and would break on rename. Migrating
--      'doctor' -> 'clinical_officer' is a separate cleanup once web is
--      updated. For HC III, new staff are seeded directly as 'clinical_officer'
--      etc.
--   2. Add visits.department ∈ ('opd','anc','maternity','family_planning',
--      'immunization'). Existing rows default to 'opd'.
--   3. Patch generate_hmis_105 to scope to department = 'opd'. Without this,
--      future ANC/maternity visits would inflate the OPD report.
--   4. Add start_visit_self_triage(p_visit_id, p_clinician_id): a CO who
--      handles their own triage skips the nurse-then-doctor relay.
--
-- Latent bug fixes uncovered while reading the surrounding code:
--   5. check_in_patient inserts status = 'recording' (invalid since 023's
--      pivot to pending|review|sent|completed|error). Repoints to 'pending'
--      and adds a p_department parameter so check-ins land in the right
--      department from the start.
--   6. claim_patient and assign_to_nurse expand their role allowlist so the
--      new HC III clinician roles can act as lead clinician / triager.
--      Legacy 'doctor' and 'nurse' stay allowed.

-- =============================================================================
-- 1. Expand staff.role
-- =============================================================================

ALTER TABLE staff DROP CONSTRAINT IF EXISTS staff_role_check;
ALTER TABLE staff ADD CONSTRAINT staff_role_check CHECK (role IN (
  -- Legacy (pre-HC III rollout) — still in use by web + Clerk webhook
  'admin',
  'doctor',
  'nurse',
  -- HC III roster (Ugandan MoH approved structure)
  'clinical_officer',
  'midwife',
  'nursing_assistant',
  'records_officer',
  'lab_tech',
  'dispenser'
));
-- staff.role default stays 'doctor' for now; flip to 'clinical_officer' in a
-- future migration alongside the web/Clerk role rename.

-- =============================================================================
-- 2. visits.department
-- =============================================================================

ALTER TABLE visits ADD COLUMN IF NOT EXISTS department TEXT NOT NULL DEFAULT 'opd'
  CHECK (department IN (
    'opd',
    'anc',
    'maternity',
    'family_planning',
    'immunization'
  ));

CREATE INDEX IF NOT EXISTS idx_visits_clinic_dept_date
  ON visits(clinic_id, department, visit_date);

-- =============================================================================
-- 3. Patch generate_hmis_105 to OPD-only
-- =============================================================================
-- Identical body to migration 013 with one added predicate: v.department = 'opd'.
-- ANC visits will be reported via a future generate_hmis_106a; until then they
-- stay out of the OPD aggregate.

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
    COUNT(*) FILTER (WHERE p.sex = 'M' AND age_days >= 0 AND age_days <= 28)::BIGINT AS male_0_28d,
    COUNT(*) FILTER (WHERE p.sex = 'F' AND age_days >= 0 AND age_days <= 28)::BIGINT AS female_0_28d,
    COUNT(*) FILTER (WHERE p.sex = 'M' AND age_days > 28 AND age_years < 5)::BIGINT AS male_29d_4y,
    COUNT(*) FILTER (WHERE p.sex = 'F' AND age_days > 28 AND age_years < 5)::BIGINT AS female_29d_4y,
    COUNT(*) FILTER (WHERE p.sex = 'M' AND age_years >= 5 AND age_years <= 14)::BIGINT AS male_5_14y,
    COUNT(*) FILTER (WHERE p.sex = 'F' AND age_years >= 5 AND age_years <= 14)::BIGINT AS female_5_14y,
    COUNT(*) FILTER (WHERE p.sex = 'M' AND age_years >= 15 AND age_years <= 59)::BIGINT AS male_15_59y,
    COUNT(*) FILTER (WHERE p.sex = 'F' AND age_years >= 15 AND age_years <= 59)::BIGINT AS female_15_59y,
    COUNT(*) FILTER (WHERE p.sex = 'M' AND age_years >= 60)::BIGINT AS male_60plus,
    COUNT(*) FILTER (WHERE p.sex = 'F' AND age_years >= 60)::BIGINT AS female_60plus,
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
      AND v.department = 'opd'
  ) p ON p.hmis_code_id = h.id
  WHERE h.is_active = TRUE
  GROUP BY h.hmis_code, h.display_name, h.sort_order
  ORDER BY h.sort_order;
END;
$$;

-- =============================================================================
-- 4. check_in_patient: status='pending', accept department
-- =============================================================================

CREATE OR REPLACE FUNCTION check_in_patient(
  p_clinic_id UUID,
  p_patient_id UUID,
  p_chief_complaint TEXT DEFAULT NULL,
  p_priority TEXT DEFAULT 'normal',
  p_staff_id UUID DEFAULT NULL,
  p_department TEXT DEFAULT 'opd'
)
RETURNS UUID AS $$
DECLARE
  v_visit_id UUID;
  v_queue_position INTEGER;
BEGIN
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
    AND visit_date = CURRENT_DATE;

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
    CURRENT_DATE,
    p_department
  )
  RETURNING id INTO v_visit_id;

  RETURN v_visit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 5. assign_to_nurse: expand authorized roles for triage
-- =============================================================================

CREATE OR REPLACE FUNCTION assign_to_nurse(
  p_visit_id UUID,
  p_nurse_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Visit not found';
  END IF;

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 6. claim_patient: expand authorized lead-clinician roles
-- =============================================================================

CREATE OR REPLACE FUNCTION claim_patient(
  p_visit_id UUID,
  p_doctor_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Visit not found';
  END IF;

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 7. start_visit_self_triage: CO-only flow, skip nurse step
-- =============================================================================
-- Used when the lead clinician handles their own triage. Jumps queue_status
-- 'waiting' -> 'with_doctor' atomically and sets doctor_id = caller. Same
-- authorization as claim_patient (only roles that can be a lead clinician).

CREATE OR REPLACE FUNCTION start_visit_self_triage(
  p_visit_id UUID,
  p_clinician_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Visit not found';
  END IF;

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION start_visit_self_triage(UUID, UUID) TO anon, authenticated;

-- =============================================================================
-- 8. get_clinician_home: single round-trip payload for the CO home
-- =============================================================================
-- The CO home shows four sections: today's queue, my pending dictations,
-- my notes awaiting review, and a count of completed visits today. Older
-- Android phones on weak networks can't afford four separate round trips.
-- Returns a JSON object keyed by section. Service-role and same-clinic staff
-- only.

CREATE OR REPLACE FUNCTION get_clinician_home(
  p_clinic_id UUID,
  p_staff_id UUID,
  p_department TEXT DEFAULT 'opd'
)
RETURNS JSONB AS $$
DECLARE
  v_clerk_user_id TEXT;
  v_today DATE := CURRENT_DATE;
  v_queue JSONB;
  v_to_dictate JSONB;
  v_to_review JSONB;
  v_done_count INT;
BEGIN
  v_clerk_user_id := auth.jwt()->>'sub';

  -- Authorization: service-role bypasses; everyone else must be active staff
  -- of the requested clinic AND match the requested staff_id (no peeking at
  -- another clinician's home).
  IF v_clerk_user_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM staff
      WHERE id = p_staff_id
        AND clinic_id = p_clinic_id
        AND clerk_user_id = v_clerk_user_id
        AND is_active = TRUE
    ) THEN
      RAISE EXCEPTION 'Staff not authorized for this home';
    END IF;
  END IF;

  -- Today's queue: anyone in this department waiting or with me right now,
  -- plus patients triaged and ready (so I can claim them).
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.priority_order, t.queue_position NULLS LAST), '[]'::jsonb)
  INTO v_queue
  FROM (
    SELECT
      v.id AS visit_id,
      v.patient_id,
      trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS patient_name,
      p.sex,
      p.date_of_birth,
      v.queue_status,
      v.queue_position,
      v.priority,
      v.chief_complaint,
      v.checked_in_at,
      EXTRACT(EPOCH FROM (NOW() - v.checked_in_at))::INT / 60 AS wait_minutes,
      CASE v.priority
        WHEN 'urgent' THEN 0
        WHEN 'high' THEN 1
        WHEN 'normal' THEN 2
        WHEN 'low' THEN 3
      END AS priority_order
    FROM visits v
    JOIN patients p ON p.id = v.patient_id
    WHERE v.clinic_id = p_clinic_id
      AND v.department = p_department
      AND v.visit_date = v_today
      AND v.queue_status IN ('waiting', 'with_nurse', 'ready_for_doctor', 'with_doctor')
      AND (v.doctor_id IS NULL OR v.doctor_id = p_staff_id)
  ) t;

  -- Visits I'm leading that need a dictation (status=pending, queue=with_doctor).
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.checked_in_at), '[]'::jsonb)
  INTO v_to_dictate
  FROM (
    SELECT
      v.id AS visit_id,
      v.patient_id,
      trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS patient_name,
      v.chief_complaint,
      v.checked_in_at
    FROM visits v
    JOIN patients p ON p.id = v.patient_id
    WHERE v.clinic_id = p_clinic_id
      AND v.department = p_department
      AND v.visit_date = v_today
      AND v.doctor_id = p_staff_id
      AND v.status = 'pending'
      AND v.queue_status = 'with_doctor'
  ) t;

  -- AI-structured notes awaiting my review.
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.checked_in_at), '[]'::jsonb)
  INTO v_to_review
  FROM (
    SELECT
      v.id AS visit_id,
      v.patient_id,
      trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS patient_name,
      v.chief_complaint,
      v.checked_in_at
    FROM visits v
    JOIN patients p ON p.id = v.patient_id
    WHERE v.clinic_id = p_clinic_id
      AND v.department = p_department
      AND v.visit_date = v_today
      AND v.doctor_id = p_staff_id
      AND v.status = 'review'
  ) t;

  -- Completed-today count (cheap aggregate; the list itself is lazy-loaded).
  SELECT COUNT(*)::INT INTO v_done_count
  FROM visits v
  WHERE v.clinic_id = p_clinic_id
    AND v.department = p_department
    AND v.visit_date = v_today
    AND v.doctor_id = p_staff_id
    AND v.status IN ('sent', 'completed');

  RETURN jsonb_build_object(
    'queue', v_queue,
    'to_dictate', v_to_dictate,
    'to_review', v_to_review,
    'done_count', v_done_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION get_clinician_home(UUID, UUID, TEXT) TO anon, authenticated;
