-- Migration 062: HMIS 105 correctness fixes
-- ============================================================================
-- The diocese reports to the Ugandan MoH with HMIS 105 to unlock subsidies;
-- wrong numbers are existential. Three verified correctness bugs:
--
--   1. generate_hmis_105 (latest version: 038) counted EVERY
--      visit_diagnosis_codes row, including unconfirmed AI suggestions
--      (source='ai'). Migration 033's contract says the report counts only
--      sources ('manual','ai_confirmed') — the clinician is the medical
--      authority, not the model. Recreated below with the source filter.
--      Signature and return shape are unchanged (web calls it via RPC).
--
--   2. UTC day-shift on visit_date. visits.visit_date defaults to
--      CURRENT_DATE (001), which evaluates in the database timezone (UTC on
--      Supabase). Kampala is UTC+3, so every visit between 00:00 and 03:00
--      EAT landed on the PRIOR day — and month-boundary visits landed in the
--      wrong HMIS reporting month. New kampala_today() helper; the column
--      default and every live function that sets or filters
--      visit_date = CURRENT_DATE are recreated with it. Recreated functions
--      (base version in parens): check_in_patient (024), get_clinic_queue
--      (022), get_clinician_home (024), rpc_create_visit (029),
--      rpc_worklist_needs_vitals (041), rpc_worklist_needs_clinician (050),
--      rpc_worklist_needs_lab (048), rpc_get_opd_patients_today (048).
--      Bodies are otherwise byte-identical to their latest versions —
--      auth behavior is deliberately unchanged (a parallel security-
--      hardening migration may recreate some of these; see merge notes in
--      the PR).
--
--   3. Receipt sequence UTC/Kampala mismatch (016). The receipt STRING used
--      the Kampala date but the sequence-row PK used CURRENT_DATE (UTC).
--      Between UTC midnight and 03:00 EAT the string date rolls forward
--      while the counter row does not, so numbering restarts/collides ->
--      UNIQUE violation on payments.receipt_number -> payment insert fails.
--      generate_receipt_number now keys the sequence row to the same
--      Kampala date used in the string.
-- ============================================================================

-- ============================================================================
-- 1. kampala_today() — clinic-local "today"
-- ============================================================================
-- STABLE: constant within a statement, follows the transaction clock.

CREATE OR REPLACE FUNCTION kampala_today()
RETURNS DATE AS $$
  SELECT (NOW() AT TIME ZONE 'Africa/Kampala')::DATE;
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION kampala_today() TO anon, authenticated, service_role;

-- visits.visit_date default: was CURRENT_DATE (UTC) from 001.
ALTER TABLE visits ALTER COLUMN visit_date SET DEFAULT kampala_today();

-- ============================================================================
-- 2. generate_hmis_105 — count only clinician-confirmed diagnosis codes
-- ============================================================================
-- Base: 038's version (age derivation per dob_precision). Only change:
-- vdc.source IN ('manual','ai_confirmed'). Unconfirmed AI suggestions
-- (source='ai') stay out of the MoH report until a clinician confirms them
-- via the DiagnosisCoder UI (which rewrites source to 'ai_confirmed').

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
      -- 033 contract: only clinician-confirmed codes reach the MoH report.
      AND vdc.source IN ('manual', 'ai_confirmed')
  ) p ON p.hmis_code_id = h.id
  WHERE h.is_active = TRUE
  GROUP BY h.hmis_code, h.display_name, h.sort_order
  ORDER BY h.sort_order;
END;
$$;

-- ============================================================================
-- 3. generate_receipt_number — sequence keyed to the Kampala date
-- ============================================================================
-- Base: 016. The advisory lock was already keyed to the Kampala date string;
-- only the payment_receipt_sequences PK row used CURRENT_DATE (UTC).

CREATE OR REPLACE FUNCTION generate_receipt_number()
RETURNS TRIGGER AS $$
DECLARE
  v_prefix TEXT;
  v_kampala_date DATE;
  v_date TEXT;
  v_seq INTEGER;
BEGIN
  -- Get clinic receipt prefix
  SELECT COALESCE(receipt_prefix, UPPER(LEFT(slug, 3)))
  INTO v_prefix
  FROM clinics
  WHERE id = NEW.clinic_id;

  IF v_prefix IS NULL THEN
    v_prefix := 'KH';
  END IF;

  -- One date for both the receipt string and the sequence row.
  v_kampala_date := kampala_today();
  v_date := TO_CHAR(v_kampala_date, 'YYYYMMDD');

  -- Acquire advisory lock scoped to this clinic + date to prevent race conditions
  PERFORM pg_advisory_xact_lock(hashtext(NEW.clinic_id::text || v_date));

  -- Upsert sequence counter (same Kampala date as the string above)
  INSERT INTO payment_receipt_sequences (clinic_id, sequence_date, last_sequence)
  VALUES (NEW.clinic_id, v_kampala_date, 1)
  ON CONFLICT (clinic_id, sequence_date)
  DO UPDATE SET last_sequence = payment_receipt_sequences.last_sequence + 1
  RETURNING last_sequence INTO v_seq;

  -- Format receipt number: KH-KDC-20260330-0042
  NEW.receipt_number := 'KH-' || v_prefix || '-' || v_date || '-' || LPAD(v_seq::text, 4, '0');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. check_in_patient — Kampala day for queue position + visit_date
-- ============================================================================
-- Base: 024. Only CURRENT_DATE -> kampala_today().

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 5. get_clinic_queue — Kampala day filter
-- ============================================================================
-- Base: 022. Only CURRENT_DATE -> kampala_today().

CREATE OR REPLACE FUNCTION get_clinic_queue(p_clinic_id UUID)
RETURNS TABLE (
  visit_id UUID,
  patient_id UUID,
  patient_name TEXT,
  patient_phone TEXT,
  queue_position INTEGER,
  queue_status TEXT,
  priority TEXT,
  chief_complaint TEXT,
  checked_in_at TIMESTAMPTZ,
  nurse_id UUID,
  nurse_name TEXT,
  doctor_id UUID,
  doctor_name TEXT,
  wait_minutes INTEGER
) AS $$
DECLARE
  v_clerk_user_id TEXT;
BEGIN
  v_clerk_user_id := auth.jwt()->>'sub';

  -- Service-role callers have no JWT subject; trust them.
  -- All other callers must be active staff at the requested clinic.
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
    COALESCE(p.whatsapp_number, '') AS patient_phone,
    v.queue_position,
    v.queue_status::TEXT,
    v.priority::TEXT,
    v.chief_complaint,
    v.checked_in_at,
    v.nurse_id,
    n.display_name AS nurse_name,
    v.doctor_id,
    d.display_name AS doctor_name,
    EXTRACT(EPOCH FROM (NOW() - v.checked_in_at))::INTEGER / 60 AS wait_minutes
  FROM visits v
  JOIN patients p ON p.id = v.patient_id
  LEFT JOIN staff n ON n.id = v.nurse_id
  LEFT JOIN staff d ON d.id = v.doctor_id
  WHERE v.clinic_id = p_clinic_id
    AND v.visit_date = kampala_today()
    AND v.queue_status != 'cancelled'
  ORDER BY
    CASE v.priority
      WHEN 'urgent' THEN 0
      WHEN 'high' THEN 1
      WHEN 'normal' THEN 2
      WHEN 'low' THEN 3
    END,
    v.queue_position ASC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 6. get_clinician_home — Kampala "today" for all four sections
-- ============================================================================
-- Base: 024. Only v_today := CURRENT_DATE -> kampala_today().

CREATE OR REPLACE FUNCTION get_clinician_home(
  p_clinic_id UUID,
  p_staff_id UUID,
  p_department TEXT DEFAULT 'opd'
)
RETURNS JSONB AS $$
DECLARE
  v_clerk_user_id TEXT;
  v_today DATE := kampala_today();
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

-- ============================================================================
-- 7. rpc_create_visit — Kampala default for p_visit_date
-- ============================================================================
-- Base: 029. Only the parameter default changes (evaluated at call time, so
-- offline Android replays that pass an explicit date are unaffected).

CREATE OR REPLACE FUNCTION rpc_create_visit(
  p_id UUID,
  p_clinic_id UUID,
  p_patient_id UUID,
  p_doctor_id UUID DEFAULT NULL,
  p_chief_complaint TEXT DEFAULT NULL,
  p_visit_date DATE DEFAULT kampala_today(),
  p_department TEXT DEFAULT 'opd'
) RETURNS VOID AS $$
DECLARE
  v_caller_clinic UUID;
BEGIN
  v_caller_clinic := get_current_clinic_id();
  IF v_caller_clinic IS NULL OR v_caller_clinic != p_clinic_id THEN
    RAISE EXCEPTION 'Unauthorized: clinic mismatch (caller=% target=%)',
      v_caller_clinic, p_clinic_id;
  END IF;

  INSERT INTO visits (
    id, clinic_id, patient_id, doctor_id, chief_complaint, visit_date,
    department, status, queue_status, priority
  ) VALUES (
    p_id, p_clinic_id, p_patient_id, p_doctor_id, p_chief_complaint, p_visit_date,
    p_department, 'pending', 'waiting', 'normal'
  )
  ON CONFLICT (id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 8. rpc_worklist_needs_vitals — Kampala day filter
-- ============================================================================
-- Base: 041. Only CURRENT_DATE -> kampala_today().

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
    patient_age_years(p.id) AS derived_age,
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

-- ============================================================================
-- 9. rpc_worklist_needs_clinician — Kampala day filter
-- ============================================================================
-- Base: 050. Only CURRENT_DATE -> kampala_today().

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
    patient_age_years(p.id) AS derived_age,
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

-- ============================================================================
-- 10. rpc_worklist_needs_lab — Kampala rolling 7 days
-- ============================================================================
-- Base: 048. CURRENT_DATE -> kampala_today() for both the visit_date window
-- and the displayed age (keeps the function on one clock).

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
    EXTRACT(YEAR FROM AGE(kampala_today(), p.date_of_birth))::INTEGER,
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

-- ============================================================================
-- 11. rpc_get_opd_patients_today — Kampala "today"
-- ============================================================================
-- Base: 048. CURRENT_DATE -> kampala_today() for the day filter and the
-- displayed age.

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
    EXTRACT(YEAR FROM AGE(kampala_today(), p.date_of_birth))::INTEGER,
    tv.visit_id,
    tv.chief_complaint,
    tv.queue_status,
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
    OR (p_filter = 'done_today' AND tv.documentation_complete = TRUE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
