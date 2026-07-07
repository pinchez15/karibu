-- Migration 094: WP2 — day line & check-in (one check-in spine, every visit numbered)
-- ============================================================================
-- Almost every patient is a walk-in who "works the line" that day. The day
-- line must be an honest operational view with a real ordering, and every
-- visit — regardless of the entry path that created it — must carry an arrival
-- number ("today's number") and a check-in timestamp.
--
-- Verified problems this migration fixes:
--
--   1. Two check-in spines, one broken. check_in_patient (063) assigns
--      queue_position + checked_in_at; rpc_create_visit (062) — the path
--      Android "Start Visit"/register-and-check-in uses — sets NEITHER. So
--      those visits have no arrival order and no wait time. Fix: a single
--      shared helper assign_today_number(clinic, date) that both call.
--
--   2. rpc_get_opd_patients_today (062) has NO final ORDER BY and does not
--      return checked_in_at / queue_position / priority / wait_minutes. The
--      Android + web patient-first lists therefore can't render "you are #23",
--      the wait time, or a stable urgent-first-then-arrival order. Fix: the
--      RPC now returns those four columns and orders by
--      priority (urgent→normal) then checked_in_at ASC.
--
--   3. get_clinic_queue (062) kept completed patients in the list all day
--      (it only excluded 'cancelled'). Fix: also exclude 'completed' so the
--      default operational view is the actionable set; done items live in a
--      separate "Done today" view/tab on the client.
--
-- "Today's number" = per clinic, per day, monotonically increasing, assigned
-- at check-in. It is the same value historically stored in
-- visits.queue_position; this migration does not rename the column (renaming
-- would churn every web + Android caller) — it makes the number reliably
-- present on EVERY visit and surfaces it through the read RPCs.
--
-- Bodies below are otherwise byte-identical to their 062/063 versions except
-- for the shared numbering helper and the read-path additions noted above.
-- All auth behavior (assert_staff_in_clinic / get_current_clinic_id) is
-- preserved.
-- ============================================================================

-- ============================================================================
-- 1. assign_today_number — the single source of "today's number"
-- ============================================================================
-- COALESCE(MAX(queue_position), 0) + 1 for the clinic's local day. Matches the
-- historical inline computation in check_in_patient; extracted so every entry
-- path assigns the number identically. p_visit_date lets offline replays that
-- pass an explicit visit_date number within the correct day.
--
-- Concurrency note: this is MAX+1, the same approach used since migration 008.
-- Two simultaneous check-ins can theoretically collide on a number; there is
-- no UNIQUE constraint on (clinic_id, visit_date, queue_position), so the day
-- line tolerates a rare duplicate rather than failing a check-in. At HC III
-- volume (~40–60/day, human-paced arrivals) this is not a practical risk.

CREATE OR REPLACE FUNCTION assign_today_number(
  p_clinic_id UUID,
  p_visit_date DATE DEFAULT kampala_today()
)
RETURNS INTEGER
LANGUAGE sql
AS $$
  SELECT COALESCE(MAX(queue_position), 0) + 1
  FROM visits
  WHERE clinic_id = p_clinic_id
    AND visit_date = p_visit_date;
$$;

GRANT EXECUTE ON FUNCTION assign_today_number(UUID, DATE) TO anon, authenticated, service_role;

-- ============================================================================
-- 2. check_in_patient — use the shared numbering helper
-- ============================================================================
-- Base: 063 (assert_staff_in_clinic + kampala_today). Only change: the inline
-- MAX(queue_position)+1 becomes assign_today_number(...).

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

  v_queue_position := assign_today_number(p_clinic_id, kampala_today());

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

-- ============================================================================
-- 3. rpc_create_visit — number + timestamp every visit it creates
-- ============================================================================
-- Base: 062. The 'Start Visit' / register-and-check-in path routed through
-- this RPC previously left queue_position + checked_in_at NULL. Now it assigns
-- today's number and stamps checked_in_at, so an Android-originated visit sorts
-- and shows a wait time identically to a web check-in. Auth (get_current_clinic_id)
-- is unchanged.

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
  v_queue_position INTEGER;
BEGIN
  v_caller_clinic := get_current_clinic_id();
  IF v_caller_clinic IS NULL OR v_caller_clinic != p_clinic_id THEN
    RAISE EXCEPTION 'Unauthorized: clinic mismatch (caller=% target=%)',
      v_caller_clinic, p_clinic_id;
  END IF;

  v_queue_position := assign_today_number(p_clinic_id, p_visit_date);

  INSERT INTO visits (
    id, clinic_id, patient_id, doctor_id, chief_complaint, visit_date,
    department, status, queue_status, priority, queue_position, checked_in_at
  ) VALUES (
    p_id, p_clinic_id, p_patient_id, p_doctor_id, p_chief_complaint, p_visit_date,
    p_department, 'pending', 'waiting', 'normal', v_queue_position, NOW()
  )
  ON CONFLICT (id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. get_clinic_queue — exclude completed from the default operational view
-- ============================================================================
-- Base: 062. Only change: also exclude queue_status='completed' (previously
-- only 'cancelled' was excluded, so finished patients cluttered the line all
-- day). Done items are surfaced separately by the client's "Done today" view.

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
    AND v.queue_status NOT IN ('cancelled', 'completed')
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
-- 5. rpc_get_opd_patients_today — surface the number, order, and wait
-- ============================================================================
-- Base: 062. Adds queue_position, checked_in_at, priority, and wait_minutes to
-- the row type (fed from the deduped latest-visit CTE) and a final
-- ORDER BY priority (urgent→normal) then checked_in_at ASC — the "up next"
-- ordering staff and patients both reason about. Filter clauses are unchanged.

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
    EXTRACT(YEAR FROM AGE(kampala_today(), p.date_of_birth))::INTEGER,
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
