-- 114_opd_count_dedup.sql
--
-- Field report (2026-07-22): admin "visits per day" showed 18 when staff had
-- registered 13 OPD clients. Root cause: admitting a patient mints a second
-- visit (admission_id set) for inpatient lab/pharmacy, and that visit was
-- counted alongside the front-desk OPD check-in. check_in_patient also allowed
-- a second same-day OPD visit when a patient was checked in twice.
--
-- Fixes:
--   1. get_clinic_queue — inpatient chart visits never belong on the OPD line.
--   2. check_in_patient — reuse today's open OPD visit for the same patient.
--   3. rpc_create_visit — admission-linked visits skip queue numbering.

BEGIN;

-- =============================================================================
-- 1. get_clinic_queue — exclude inpatient chart visits
-- =============================================================================

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
    AND v.admission_id IS NULL
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

-- =============================================================================
-- 2. check_in_patient — same-day OPD reuse
-- =============================================================================

CREATE OR REPLACE FUNCTION check_in_patient(
  p_clinic_id UUID,
  p_patient_id UUID,
  p_chief_complaint TEXT DEFAULT NULL,
  p_priority TEXT DEFAULT 'normal',
  p_staff_id UUID DEFAULT NULL,
  p_department TEXT DEFAULT 'opd',
  p_visit_id UUID DEFAULT NULL,
  p_client_op_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_visit_id UUID;
  v_queue_position INTEGER;
  v_existing_id UUID;
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);

  IF p_client_op_id IS NOT NULL AND sync_op_already_applied(p_client_op_id) THEN
    RETURN (SELECT entity_id FROM sync_operations WHERE id = p_client_op_id);
  END IF;

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

  -- Reuse today's still-open OPD visit so a second check-in does not mint
  -- another queue number or inflate admin/report counts. Completed/cancelled
  -- visits are not reused — a return same day gets a fresh number.
  SELECT v.id INTO v_existing_id
  FROM visits v
  WHERE v.clinic_id = p_clinic_id
    AND v.patient_id = p_patient_id
    AND v.visit_date = kampala_today()
    AND v.admission_id IS NULL
    AND v.department = p_department
    AND v.queue_status NOT IN ('cancelled', 'completed')
  ORDER BY v.created_at DESC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    IF p_chief_complaint IS NOT NULL AND length(trim(p_chief_complaint)) > 0 THEN
      UPDATE visits
      SET chief_complaint = p_chief_complaint
      WHERE id = v_existing_id;
    END IF;

    IF p_client_op_id IS NOT NULL THEN
      PERFORM sync_op_record(
        p_client_op_id, p_clinic_id, 'check_in_patient', 'visits', v_existing_id
      );
    END IF;

    RETURN v_existing_id;
  END IF;

  v_visit_id := COALESCE(p_visit_id, gen_random_uuid());
  v_queue_position := assign_today_number(p_clinic_id, kampala_today());

  INSERT INTO visits (
    id,
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
    v_visit_id,
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
  ON CONFLICT (id) DO NOTHING;

  IF p_client_op_id IS NOT NULL THEN
    PERFORM sync_op_record(
      p_client_op_id, p_clinic_id, 'check_in_patient', 'visits', v_visit_id
    );
  END IF;

  RETURN v_visit_id;
END;
$$;

GRANT EXECUTE ON FUNCTION check_in_patient(
  UUID, UUID, TEXT, TEXT, UUID, TEXT, UUID, UUID
) TO anon, authenticated;

-- =============================================================================
-- 3. rpc_create_visit — admission-linked visits are not OPD queue entries
-- =============================================================================

CREATE OR REPLACE FUNCTION rpc_create_visit(
  p_id UUID,
  p_clinic_id UUID,
  p_patient_id UUID,
  p_doctor_id UUID DEFAULT NULL,
  p_chief_complaint TEXT DEFAULT NULL,
  p_visit_date DATE DEFAULT kampala_today(),
  p_department TEXT DEFAULT 'opd',
  p_admission_id UUID DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_caller_clinic UUID;
  v_queue_position INTEGER;
  v_department TEXT;
  v_queue_status TEXT;
BEGIN
  v_caller_clinic := get_current_clinic_id();
  IF v_caller_clinic IS NULL OR v_caller_clinic != p_clinic_id THEN
    RAISE EXCEPTION 'Unauthorized: clinic mismatch (caller=% target=%)',
      v_caller_clinic, p_clinic_id;
  END IF;

  IF p_admission_id IS NOT NULL THEN
    v_department := 'inpatient';
    v_queue_status := 'with_doctor';
    v_queue_position := NULL;
  ELSE
    v_department := p_department;
    v_queue_status := 'waiting';
    v_queue_position := assign_today_number(p_clinic_id, p_visit_date);
  END IF;

  INSERT INTO visits (
    id, clinic_id, patient_id, doctor_id, chief_complaint, visit_date,
    department, status, queue_status, priority, queue_position, checked_in_at,
    admission_id
  ) VALUES (
    p_id, p_clinic_id, p_patient_id, p_doctor_id, p_chief_complaint, p_visit_date,
    v_department, 'pending', v_queue_status, 'normal', v_queue_position, NOW(),
    p_admission_id
  )
  ON CONFLICT (id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION rpc_create_visit(UUID, UUID, UUID, UUID, TEXT, DATE, TEXT, UUID)
  TO anon, authenticated;

COMMIT;
