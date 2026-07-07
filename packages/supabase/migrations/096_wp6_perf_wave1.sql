-- =============================================================================
-- 096 — WP6 Web performance Wave 1+2 (age N+1 fix, billing indexes, worklist_all)
-- =============================================================================
-- Wave 1: patient_age_years_from_fields eliminates per-row patient subqueries in
-- worklist RPCs; composite indexes on charges/payments for billing aggregates.
-- Wave 2: rpc_worklist_all consolidates nine worklist round trips into one JSONB
-- response (web + Android).
-- =============================================================================

-- =============================================================================
-- 1. patient_age_years_from_fields — inline age from joined patient columns
-- =============================================================================
-- Same logic as patient_age_years() (038) but takes column values directly so
-- worklist queries avoid a patients lookup per row.

CREATE OR REPLACE FUNCTION patient_age_years_from_fields(
  p_dob_precision TEXT,
  p_date_of_birth DATE,
  p_birth_year SMALLINT,
  p_approximate_age SMALLINT,
  p_age_recorded_at TIMESTAMPTZ
) RETURNS INTEGER AS $$
  SELECT CASE
    WHEN p_dob_precision = 'exact' AND p_date_of_birth IS NOT NULL THEN
      EXTRACT(YEAR FROM age(CURRENT_DATE, p_date_of_birth))::INTEGER
    WHEN p_dob_precision = 'year_only' AND p_birth_year IS NOT NULL THEN
      EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER - p_birth_year::INTEGER
    WHEN p_dob_precision = 'age_estimate'
      AND p_approximate_age IS NOT NULL
      AND p_age_recorded_at IS NOT NULL THEN
      p_approximate_age
        + EXTRACT(YEAR FROM age(CURRENT_DATE, p_age_recorded_at::DATE))::INTEGER
    ELSE NULL
  END;
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION patient_age_years_from_fields(
  TEXT, DATE, SMALLINT, SMALLINT, TIMESTAMPTZ
) TO anon, authenticated, service_role;

-- =============================================================================
-- 2. Worklist RPCs — replace patient_age_years(p.id) with inline helper
-- =============================================================================

-- 2a. rpc_worklist_needs_vitals (base: 062)
CREATE OR REPLACE FUNCTION rpc_worklist_needs_vitals(
  p_clinic_id UUID,
  p_department TEXT DEFAULT 'opd'
) RETURNS TABLE (
  visit_id UUID,
  patient_id UUID,
  patient_name TEXT,
  sex TEXT,
  derived_age INTEGER,
  chief_complaint TEXT,
  queue_status TEXT,
  checked_in_at TIMESTAMPTZ
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
  SELECT
    v.id AS visit_id,
    v.patient_id,
    trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS patient_name,
    p.sex,
    patient_age_years_from_fields(
      p.dob_precision, p.date_of_birth, p.birth_year, p.approximate_age, p.age_recorded_at
    ) AS derived_age,
    v.chief_complaint,
    v.queue_status,
    v.checked_in_at
  FROM visits v
  JOIN patients p ON p.id = v.patient_id
  WHERE v.clinic_id = p_clinic_id
    AND v.department = p_department
    AND v.visit_date = kampala_today()
    AND v.queue_status IN ('waiting', 'with_nurse')
    AND NOT EXISTS (
      SELECT 1 FROM patient_vitals pv
      WHERE pv.visit_id = v.id
    )
  ORDER BY v.checked_in_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 2b. rpc_worklist_needs_clinician (base: 062/050)
CREATE OR REPLACE FUNCTION rpc_worklist_needs_clinician(
  p_clinic_id UUID,
  p_department TEXT DEFAULT 'opd'
) RETURNS TABLE (
  visit_id UUID,
  patient_id UUID,
  patient_name TEXT,
  sex TEXT,
  derived_age INTEGER,
  chief_complaint TEXT,
  queue_status TEXT,
  priority TEXT,
  doctor_id UUID,
  checked_in_at TIMESTAMPTZ,
  wait_minutes INTEGER
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
  SELECT
    v.id AS visit_id,
    v.patient_id,
    trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS patient_name,
    p.sex,
    patient_age_years_from_fields(
      p.dob_precision, p.date_of_birth, p.birth_year, p.approximate_age, p.age_recorded_at
    ) AS derived_age,
    v.chief_complaint,
    v.queue_status,
    v.priority,
    v.doctor_id,
    v.checked_in_at,
    EXTRACT(EPOCH FROM (NOW() - v.checked_in_at))::INTEGER / 60 AS wait_minutes
  FROM visits v
  JOIN patients p ON p.id = v.patient_id
  WHERE v.clinic_id = p_clinic_id
    AND v.department = p_department
    AND v.visit_date = kampala_today()
    AND v.queue_status IN ('ready_for_doctor', 'with_doctor')
    AND COALESCE(v.documentation_complete, FALSE) = FALSE
  ORDER BY
    CASE v.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END,
    v.queue_position NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 2c. rpc_worklist_needs_lab (base: 062 — fix naive EXTRACT age)
CREATE OR REPLACE FUNCTION rpc_worklist_needs_lab(
  p_clinic_id UUID
) RETURNS TABLE (
  visit_id UUID,
  patient_id UUID,
  patient_name TEXT,
  sex TEXT,
  derived_age INTEGER,
  chief_complaint TEXT,
  lab_status TEXT,
  doctor_id UUID,
  visit_date DATE
) AS $$
DECLARE
  v_clerk_user_id TEXT;
BEGIN
  v_clerk_user_id := auth.jwt()->>'sub';
  IF v_clerk_user_id IS NOT NULL THEN
    PERFORM assert_staff_in_clinic(p_clinic_id);
  END IF;

  RETURN QUERY
  SELECT
    v.id,
    v.patient_id,
    trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')),
    p.sex,
    patient_age_years_from_fields(
      p.dob_precision, p.date_of_birth, p.birth_year, p.approximate_age, p.age_recorded_at
    ),
    v.chief_complaint,
    v.lab_status,
    v.doctor_id,
    v.visit_date
  FROM visits v
  JOIN patients p ON p.id = v.patient_id
  WHERE v.clinic_id = p_clinic_id
    AND v.visit_date >= kampala_today() - INTERVAL '7 days'
    AND v.tests_ordered IS NOT NULL
    AND TRIM(v.tests_ordered) <> ''
    AND v.lab_status IN ('pending', 'running');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 2d. rpc_worklist_needs_pharmacy (base: 094)
CREATE OR REPLACE FUNCTION rpc_worklist_needs_pharmacy(
  p_clinic_id UUID
) RETURNS TABLE (
  visit_id UUID,
  patient_id UUID,
  patient_name TEXT,
  sex TEXT,
  derived_age INTEGER,
  medications TEXT,
  dispensing_status TEXT,
  doctor_id UUID,
  visit_date DATE
) AS $$
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);

  RETURN QUERY
  SELECT
    v.id, v.patient_id,
    trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')),
    p.sex,
    patient_age_years_from_fields(
      p.dob_precision, p.date_of_birth, p.birth_year, p.approximate_age, p.age_recorded_at
    ),
    v.medications,
    v.dispensing_status,
    v.doctor_id,
    v.visit_date
  FROM visits v
  JOIN patients p ON p.id = v.patient_id
  WHERE v.clinic_id = p_clinic_id
    AND v.medications IS NOT NULL
    AND TRIM(v.medications) <> ''
    AND v.pharmacy_order_submitted_at IS NOT NULL
    AND v.dispensing_status IN ('not_started', 'in_progress', 'partial', 'out_of_stock')
  ORDER BY v.pharmacy_order_submitted_at ASC NULLS LAST, v.visit_date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 2e. rpc_worklist_pharmacy_returned (base: 094)
CREATE OR REPLACE FUNCTION rpc_worklist_pharmacy_returned(
  p_clinic_id UUID
) RETURNS TABLE (
  visit_id UUID,
  patient_id UUID,
  patient_name TEXT,
  sex TEXT,
  derived_age INTEGER,
  medications TEXT,
  dispense_notes TEXT,
  doctor_id UUID,
  visit_date DATE
) AS $$
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);

  RETURN QUERY
  SELECT
    v.id, v.patient_id,
    trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')),
    p.sex,
    patient_age_years_from_fields(
      p.dob_precision, p.date_of_birth, p.birth_year, p.approximate_age, p.age_recorded_at
    ),
    v.medications,
    v.dispense_notes,
    v.doctor_id,
    v.visit_date
  FROM visits v
  JOIN patients p ON p.id = v.patient_id
  WHERE v.clinic_id = p_clinic_id
    AND v.dispensing_status = 'returned'
    AND COALESCE(v.documentation_complete, FALSE) = FALSE
  ORDER BY v.updated_at DESC, v.visit_date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 2f. rpc_worklist_results_ready (base: 094)
CREATE OR REPLACE FUNCTION rpc_worklist_results_ready(
  p_clinic_id UUID
) RETURNS TABLE (
  visit_id UUID,
  patient_id UUID,
  patient_name TEXT,
  sex TEXT,
  derived_age INTEGER,
  chief_complaint TEXT,
  lab_status TEXT,
  lab_results TEXT,
  lab_abnormal BOOLEAN,
  doctor_id UUID,
  visit_date DATE
) AS $$
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);

  RETURN QUERY
  SELECT
    v.id, v.patient_id,
    trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')),
    p.sex,
    patient_age_years_from_fields(
      p.dob_precision, p.date_of_birth, p.birth_year, p.approximate_age, p.age_recorded_at
    ),
    v.chief_complaint,
    v.lab_status,
    v.lab_results,
    COALESCE(v.lab_abnormal, FALSE),
    v.doctor_id,
    v.visit_date
  FROM visits v
  JOIN patients p ON p.id = v.patient_id
  WHERE v.clinic_id = p_clinic_id
    AND v.lab_status IN ('done', 'abnormal')
    AND COALESCE(v.documentation_complete, FALSE) = FALSE
  ORDER BY v.lab_completed_at DESC NULLS LAST, v.visit_date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 2g. rpc_worklist_needs_payment (base: 041)
CREATE OR REPLACE FUNCTION rpc_worklist_needs_payment(
  p_clinic_id UUID
) RETURNS TABLE (
  visit_id UUID,
  patient_id UUID,
  patient_name TEXT,
  sex TEXT,
  derived_age INTEGER,
  diagnosis TEXT,
  visit_date DATE,
  documentation_completed_at TIMESTAMPTZ
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
  SELECT
    v.id, v.patient_id,
    trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')),
    p.sex,
    patient_age_years_from_fields(
      p.dob_precision, p.date_of_birth, p.birth_year, p.approximate_age, p.age_recorded_at
    ),
    v.diagnosis,
    v.visit_date,
    v.documentation_completed_at
  FROM visits v
  JOIN patients p ON p.id = v.patient_id
  WHERE v.clinic_id = p_clinic_id
    AND v.status = 'sent'
    AND NOT EXISTS (
      SELECT 1 FROM payments py WHERE py.visit_id = v.id AND py.status = 'paid'
    )
  ORDER BY v.visit_date DESC, v.documentation_completed_at NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 2h. rpc_get_opd_patients_today (base: 095 — age fix only)
CREATE OR REPLACE FUNCTION rpc_get_opd_patients_today(
  p_clinic_id UUID,
  p_filter TEXT DEFAULT NULL
) RETURNS TABLE (
  patient_id UUID,
  patient_name TEXT,
  sex TEXT,
  derived_age INTEGER,
  visit_id UUID,
  chief_complaint TEXT,
  queue_status TEXT,
  queue_position INTEGER,
  priority TEXT,
  checked_in_at TIMESTAMPTZ,
  wait_minutes INTEGER,
  lab_status TEXT,
  dispensing_status TEXT,
  documentation_complete BOOLEAN,
  pharmacy_order_submitted_at TIMESTAMPTZ,
  note_status TEXT,
  visit_date DATE
) AS $$
DECLARE
  v_clerk_user_id TEXT;
BEGIN
  v_clerk_user_id := auth.jwt()->>'sub';
  IF v_clerk_user_id IS NOT NULL THEN
    PERFORM assert_staff_in_clinic(p_clinic_id);
  END IF;

  RETURN QUERY
  WITH today_visits AS (
    SELECT DISTINCT ON (v.patient_id)
      v.patient_id,
      v.id AS visit_id,
      v.chief_complaint,
      v.queue_status,
      v.queue_position,
      v.priority,
      v.checked_in_at,
      v.lab_status,
      v.dispensing_status,
      v.documentation_complete,
      v.pharmacy_order_submitted_at,
      v.visit_date,
      pn.status AS note_status
    FROM visits v
    LEFT JOIN provider_notes pn ON pn.visit_id = v.id
    WHERE v.clinic_id = p_clinic_id
      AND v.visit_date = kampala_today()
    ORDER BY v.patient_id, v.created_at DESC
  )
  SELECT
    tv.patient_id,
    trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')),
    p.sex,
    patient_age_years_from_fields(
      p.dob_precision, p.date_of_birth, p.birth_year, p.approximate_age, p.age_recorded_at
    ),
    tv.visit_id,
    tv.chief_complaint,
    tv.queue_status,
    tv.queue_position,
    tv.priority::TEXT,
    tv.checked_in_at,
    EXTRACT(EPOCH FROM (NOW() - tv.checked_in_at))::INTEGER / 60 AS wait_minutes,
    tv.lab_status,
    tv.dispensing_status,
    tv.documentation_complete,
    tv.pharmacy_order_submitted_at,
    tv.note_status,
    tv.visit_date
  FROM today_visits tv
  JOIN patients p ON p.id = tv.patient_id
  WHERE p_filter IS NULL
    OR (p_filter = 'waiting' AND tv.queue_status = 'waiting')
    OR (p_filter = 'needs_vitals' AND tv.queue_status = 'with_nurse')
    OR (p_filter = 'with_clinician' AND tv.queue_status IN ('ready_for_doctor', 'with_doctor')
        AND COALESCE(tv.documentation_complete, FALSE) = FALSE)
    OR (p_filter = 'awaiting_labs' AND tv.lab_status IN ('pending', 'running'))
    OR (p_filter = 'at_pharmacy' AND tv.pharmacy_order_submitted_at IS NOT NULL
        AND tv.dispensing_status NOT IN ('dispensed', 'partial'))
    OR (p_filter = 'done_today' AND tv.documentation_complete = TRUE)
  ORDER BY
    CASE tv.priority
      WHEN 'urgent' THEN 0
      WHEN 'high' THEN 1
      WHEN 'normal' THEN 2
      WHEN 'low' THEN 3
      ELSE 4
    END,
    tv.checked_in_at ASC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =============================================================================
-- 3. Billing indexes — speed rpc_billing_patient_balances aggregates
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_charges_clinic_patient
  ON charges(clinic_id, patient_id) WHERE NOT voided;

CREATE INDEX IF NOT EXISTS idx_payments_clinic_patient
  ON payments(clinic_id, patient_id) WHERE status = 'paid';

-- =============================================================================
-- 4. rpc_worklist_all — single JSONB round trip for all worklist buckets
-- =============================================================================

CREATE OR REPLACE FUNCTION rpc_worklist_all(
  p_clinic_id UUID,
  p_department TEXT DEFAULT 'opd',
  p_staff_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_clerk_user_id TEXT;
  v_staff_id UUID;
BEGIN
  v_clerk_user_id := auth.jwt()->>'sub';
  IF v_clerk_user_id IS NOT NULL THEN
    PERFORM assert_staff_in_clinic(p_clinic_id);
  END IF;

  IF v_clerk_user_id IS NOT NULL THEN
    SELECT id INTO v_staff_id FROM staff
    WHERE clerk_user_id = v_clerk_user_id
      AND clinic_id = p_clinic_id
      AND is_active = TRUE;
  ELSE
    IF p_staff_id IS NULL THEN
      RAISE EXCEPTION 'p_staff_id required for service-role caller';
    END IF;
    v_staff_id := p_staff_id;
  END IF;

  RETURN jsonb_build_object(
    'needs_vitals', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT
          v.id AS visit_id,
          v.patient_id,
          trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS patient_name,
          p.sex,
          patient_age_years_from_fields(
            p.dob_precision, p.date_of_birth, p.birth_year, p.approximate_age, p.age_recorded_at
          ) AS derived_age,
          v.chief_complaint,
          v.queue_status,
          v.checked_in_at
        FROM visits v
        JOIN patients p ON p.id = v.patient_id
        WHERE v.clinic_id = p_clinic_id
          AND v.department = p_department
          AND v.visit_date = kampala_today()
          AND v.queue_status IN ('waiting', 'with_nurse')
          AND NOT EXISTS (
            SELECT 1 FROM patient_vitals pv WHERE pv.visit_id = v.id
          )
        ORDER BY v.checked_in_at
      ) r
    ), '[]'::jsonb),

    'needs_clinician', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT
          v.id AS visit_id,
          v.patient_id,
          trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS patient_name,
          p.sex,
          patient_age_years_from_fields(
            p.dob_precision, p.date_of_birth, p.birth_year, p.approximate_age, p.age_recorded_at
          ) AS derived_age,
          v.chief_complaint,
          v.queue_status,
          v.priority,
          v.doctor_id,
          v.checked_in_at,
          EXTRACT(EPOCH FROM (NOW() - v.checked_in_at))::INTEGER / 60 AS wait_minutes
        FROM visits v
        JOIN patients p ON p.id = v.patient_id
        WHERE v.clinic_id = p_clinic_id
          AND v.department = p_department
          AND v.visit_date = kampala_today()
          AND v.queue_status IN ('ready_for_doctor', 'with_doctor')
          AND COALESCE(v.documentation_complete, FALSE) = FALSE
        ORDER BY
          CASE v.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END,
          v.queue_position NULLS LAST
      ) r
    ), '[]'::jsonb),

    'needs_lab', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT
          v.id AS visit_id,
          v.patient_id,
          trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS patient_name,
          p.sex,
          patient_age_years_from_fields(
            p.dob_precision, p.date_of_birth, p.birth_year, p.approximate_age, p.age_recorded_at
          ) AS derived_age,
          v.chief_complaint,
          v.lab_status,
          v.doctor_id,
          v.visit_date
        FROM visits v
        JOIN patients p ON p.id = v.patient_id
        WHERE v.clinic_id = p_clinic_id
          AND v.visit_date >= kampala_today() - INTERVAL '7 days'
          AND v.tests_ordered IS NOT NULL
          AND TRIM(v.tests_ordered) <> ''
          AND v.lab_status IN ('pending', 'running')
      ) r
    ), '[]'::jsonb),

    'needs_pharmacy', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT
          v.id AS visit_id,
          v.patient_id,
          trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS patient_name,
          p.sex,
          patient_age_years_from_fields(
            p.dob_precision, p.date_of_birth, p.birth_year, p.approximate_age, p.age_recorded_at
          ) AS derived_age,
          v.medications,
          v.dispensing_status,
          v.doctor_id,
          v.visit_date
        FROM visits v
        JOIN patients p ON p.id = v.patient_id
        WHERE v.clinic_id = p_clinic_id
          AND v.medications IS NOT NULL
          AND TRIM(v.medications) <> ''
          AND v.pharmacy_order_submitted_at IS NOT NULL
          AND v.dispensing_status IN ('not_started', 'in_progress', 'partial', 'out_of_stock')
        ORDER BY v.pharmacy_order_submitted_at ASC NULLS LAST, v.visit_date DESC
      ) r
    ), '[]'::jsonb),

    'pharmacy_returned', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT
          v.id AS visit_id,
          v.patient_id,
          trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS patient_name,
          p.sex,
          patient_age_years_from_fields(
            p.dob_precision, p.date_of_birth, p.birth_year, p.approximate_age, p.age_recorded_at
          ) AS derived_age,
          v.medications,
          v.dispense_notes,
          v.doctor_id,
          v.visit_date
        FROM visits v
        JOIN patients p ON p.id = v.patient_id
        WHERE v.clinic_id = p_clinic_id
          AND v.dispensing_status = 'returned'
          AND COALESCE(v.documentation_complete, FALSE) = FALSE
        ORDER BY v.updated_at DESC, v.visit_date DESC
      ) r
    ), '[]'::jsonb),

    'results_ready', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT
          v.id AS visit_id,
          v.patient_id,
          trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS patient_name,
          p.sex,
          patient_age_years_from_fields(
            p.dob_precision, p.date_of_birth, p.birth_year, p.approximate_age, p.age_recorded_at
          ) AS derived_age,
          v.chief_complaint,
          v.lab_status,
          v.lab_results,
          COALESCE(v.lab_abnormal, FALSE) AS lab_abnormal,
          v.doctor_id,
          v.visit_date
        FROM visits v
        JOIN patients p ON p.id = v.patient_id
        WHERE v.clinic_id = p_clinic_id
          AND v.lab_status IN ('done', 'abnormal')
          AND COALESCE(v.documentation_complete, FALSE) = FALSE
        ORDER BY v.lab_completed_at DESC NULLS LAST, v.visit_date DESC
      ) r
    ), '[]'::jsonb),

    'needs_payment', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT
          v.id AS visit_id,
          v.patient_id,
          trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS patient_name,
          p.sex,
          patient_age_years_from_fields(
            p.dob_precision, p.date_of_birth, p.birth_year, p.approximate_age, p.age_recorded_at
          ) AS derived_age,
          v.diagnosis,
          v.visit_date,
          v.documentation_completed_at
        FROM visits v
        JOIN patients p ON p.id = v.patient_id
        WHERE v.clinic_id = p_clinic_id
          AND v.status = 'sent'
          AND NOT EXISTS (
            SELECT 1 FROM payments py WHERE py.visit_id = v.id AND py.status = 'paid'
          )
        ORDER BY v.visit_date DESC, v.documentation_completed_at NULLS LAST
      ) r
    ), '[]'::jsonb),

    'my_drafts', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT
          pn.id AS note_id,
          pn.patient_id,
          trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS patient_name,
          pn.visit_id,
          pn.source,
          LEFT(COALESCE(pn.transcript, ''), 200) AS transcript_preview,
          pn.updated_at
        FROM provider_notes pn
        JOIN patients p ON p.id = pn.patient_id
        WHERE p.clinic_id = p_clinic_id
          AND pn.status = 'draft'
          AND pn.created_by = v_staff_id
        ORDER BY pn.updated_at DESC
      ) r
    ), '[]'::jsonb),

    'care_tasks', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT
          ct.id AS task_id,
          ct.patient_id,
          trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS patient_name,
          ct.visit_id,
          ct.task_type,
          ct.title,
          ct.description,
          ct.assignee_role,
          ct.assignee_id,
          ct.due_at,
          ct.status,
          ct.created_at
        FROM care_tasks ct
        JOIN patients p ON p.id = ct.patient_id
        WHERE ct.clinic_id = p_clinic_id
          AND ct.status IN ('open', 'in_progress')
        ORDER BY ct.due_at NULLS LAST, ct.created_at
      ) r
    ), '[]'::jsonb)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION rpc_worklist_all(UUID, TEXT, UUID) TO authenticated, service_role;
