-- Migration: Fix queue functions for Clerk auth integration
-- Since we use Clerk (not Supabase Auth), auth.jwt() is null on client calls.
-- These functions use SECURITY DEFINER to bypass RLS and do manual permission checks.

-- Function to get clinic queue - accepts staff_id for permission check
CREATE OR REPLACE FUNCTION get_clinic_queue(p_clinic_id UUID, p_staff_id UUID DEFAULT NULL)
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
BEGIN
  -- If staff_id provided, verify they belong to this clinic
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

  RETURN QUERY
  SELECT
    v.id AS visit_id,
    v.patient_id,
    p.display_name AS patient_name,
    p.whatsapp_number AS patient_phone,
    v.queue_position,
    v.queue_status,
    v.priority,
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
    AND v.visit_date = CURRENT_DATE
    AND v.queue_status IN ('waiting', 'with_nurse', 'ready_for_doctor', 'with_doctor')
  ORDER BY
    CASE v.priority
      WHEN 'urgent' THEN 1
      WHEN 'high' THEN 2
      WHEN 'normal' THEN 3
      WHEN 'low' THEN 4
    END,
    v.queue_position;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function to check in a patient - bypasses RLS with SECURITY DEFINER
CREATE OR REPLACE FUNCTION check_in_patient(
  p_clinic_id UUID,
  p_patient_id UUID,
  p_chief_complaint TEXT DEFAULT NULL,
  p_priority TEXT DEFAULT 'normal',
  p_staff_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_visit_id UUID;
  v_queue_position INTEGER;
BEGIN
  -- Verify staff belongs to clinic if provided
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

  -- Verify patient belongs to clinic
  IF NOT EXISTS (
    SELECT 1 FROM patients WHERE id = p_patient_id AND clinic_id = p_clinic_id
  ) THEN
    RAISE EXCEPTION 'Patient not found in this clinic';
  END IF;

  -- Get next queue position for today
  SELECT COALESCE(MAX(queue_position), 0) + 1
  INTO v_queue_position
  FROM visits
  WHERE clinic_id = p_clinic_id
    AND visit_date = CURRENT_DATE;

  -- Create the visit
  INSERT INTO visits (
    clinic_id,
    patient_id,
    status,
    queue_status,
    queue_position,
    checked_in_at,
    chief_complaint,
    priority,
    visit_date
  ) VALUES (
    p_clinic_id,
    p_patient_id,
    'recording',
    'waiting',
    v_queue_position,
    NOW(),
    p_chief_complaint,
    p_priority,
    CURRENT_DATE
  )
  RETURNING id INTO v_visit_id;

  RETURN v_visit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to assign a patient to a nurse
CREATE OR REPLACE FUNCTION assign_to_nurse(
  p_visit_id UUID,
  p_nurse_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  -- Get clinic from visit
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Visit not found';
  END IF;

  -- Verify nurse belongs to same clinic
  IF NOT EXISTS (
    SELECT 1 FROM staff
    WHERE id = p_nurse_id
      AND clinic_id = v_clinic_id
      AND is_active = TRUE
      AND role IN ('nurse', 'admin')
  ) THEN
    RAISE EXCEPTION 'Staff not authorized as nurse for this clinic';
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

-- Function to mark patient ready for doctor
CREATE OR REPLACE FUNCTION mark_ready_for_doctor(
  p_visit_id UUID,
  p_staff_id UUID DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_visit RECORD;
BEGIN
  -- Get visit info
  SELECT * INTO v_visit FROM visits WHERE id = p_visit_id;

  IF v_visit IS NULL THEN
    RAISE EXCEPTION 'Visit not found';
  END IF;

  -- If staff_id provided, verify it matches the assigned nurse or is admin
  IF p_staff_id IS NOT NULL THEN
    IF v_visit.nurse_id != p_staff_id THEN
      -- Check if admin
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function for doctor to claim a patient from the queue
CREATE OR REPLACE FUNCTION claim_patient(
  p_visit_id UUID,
  p_doctor_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  -- Get clinic from visit
  SELECT clinic_id INTO v_clinic_id FROM visits WHERE id = p_visit_id;

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Visit not found';
  END IF;

  -- Verify doctor belongs to same clinic and has doctor/admin role
  IF NOT EXISTS (
    SELECT 1 FROM staff
    WHERE id = p_doctor_id
      AND clinic_id = v_clinic_id
      AND is_active = TRUE
      AND role IN ('doctor', 'admin')
  ) THEN
    RAISE EXCEPTION 'Staff not authorized as doctor for this clinic';
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

-- Function to complete a visit
CREATE OR REPLACE FUNCTION complete_visit_queue(
  p_visit_id UUID,
  p_staff_id UUID DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_visit RECORD;
BEGIN
  -- Get visit info
  SELECT * INTO v_visit FROM visits WHERE id = p_visit_id;

  IF v_visit IS NULL THEN
    RAISE EXCEPTION 'Visit not found';
  END IF;

  -- If staff_id provided, verify it matches the assigned doctor or is admin
  IF p_staff_id IS NOT NULL THEN
    IF v_visit.doctor_id != p_staff_id THEN
      -- Check if admin
      IF NOT EXISTS (
        SELECT 1 FROM staff
        WHERE id = p_staff_id
          AND clinic_id = v_visit.clinic_id
          AND role = 'admin'
          AND is_active = TRUE
      ) THEN
        RAISE EXCEPTION 'Only assigned doctor or admin can complete visit';
      END IF;
    END IF;
  END IF;

  UPDATE visits
  SET
    queue_status = 'completed',
    status = 'completed',
    finalized_at = NOW()
  WHERE id = p_visit_id
    AND queue_status = 'with_doctor';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visit not in with_doctor status';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cancel a visit in queue
CREATE OR REPLACE FUNCTION cancel_visit_queue(
  p_visit_id UUID,
  p_staff_id UUID DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_visit RECORD;
BEGIN
  -- Get visit info
  SELECT * INTO v_visit FROM visits WHERE id = p_visit_id;

  IF v_visit IS NULL THEN
    RAISE EXCEPTION 'Visit not found';
  END IF;

  -- Verify staff belongs to clinic if provided
  IF p_staff_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM staff
      WHERE id = p_staff_id
        AND clinic_id = v_visit.clinic_id
        AND is_active = TRUE
    ) THEN
      RAISE EXCEPTION 'Staff not authorized for this clinic';
    END IF;
  END IF;

  UPDATE visits
  SET queue_status = 'cancelled'
  WHERE id = p_visit_id
    AND queue_status IN ('waiting', 'with_nurse', 'ready_for_doctor');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visit cannot be cancelled from current status';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to anon and authenticated roles
GRANT EXECUTE ON FUNCTION get_clinic_queue(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION check_in_patient(UUID, UUID, TEXT, TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION assign_to_nurse(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION mark_ready_for_doctor(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_patient(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION complete_visit_queue(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cancel_visit_queue(UUID, UUID) TO anon, authenticated;
