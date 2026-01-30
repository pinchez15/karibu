-- Migration: Queue Management System
-- Implements clinic workflow: check-in → nurse intake → doctor queue

-- Add queue management columns to visits
ALTER TABLE visits ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS nurse_id UUID REFERENCES staff(id) ON DELETE SET NULL;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS queue_position INTEGER;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS queue_status TEXT DEFAULT 'waiting'
  CHECK (queue_status IN ('waiting', 'with_nurse', 'ready_for_doctor', 'with_doctor', 'completed', 'cancelled'));

-- Add estimated wait time (calculated field, stored for performance)
ALTER TABLE visits ADD COLUMN IF NOT EXISTS estimated_wait_minutes INTEGER;

-- Add chief complaint for triage
ALTER TABLE visits ADD COLUMN IF NOT EXISTS chief_complaint TEXT;

-- Add priority level for urgent cases
ALTER TABLE visits ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal'
  CHECK (priority IN ('low', 'normal', 'high', 'urgent'));

-- Index for queue queries (clinic + date + status)
CREATE INDEX IF NOT EXISTS idx_visits_queue
  ON visits(clinic_id, visit_date, queue_status, queue_position)
  WHERE queue_status IN ('waiting', 'with_nurse', 'ready_for_doctor', 'with_doctor');

-- Index for nurse's current patients
CREATE INDEX IF NOT EXISTS idx_visits_nurse ON visits(nurse_id, queue_status)
  WHERE queue_status = 'with_nurse';

-- Index for doctor's current patients
CREATE INDEX IF NOT EXISTS idx_visits_doctor_queue ON visits(doctor_id, queue_status)
  WHERE queue_status = 'with_doctor';

-- Function to check in a patient and create a visit
CREATE OR REPLACE FUNCTION check_in_patient(
  p_clinic_id UUID,
  p_patient_id UUID,
  p_chief_complaint TEXT DEFAULT NULL,
  p_priority TEXT DEFAULT 'normal'
)
RETURNS UUID AS $$
DECLARE
  v_visit_id UUID;
  v_queue_position INTEGER;
BEGIN
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
    'recording', -- Initial status, will change when doctor starts recording
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
$$ LANGUAGE plpgsql;

-- Function to assign a patient to a nurse
CREATE OR REPLACE FUNCTION assign_to_nurse(
  p_visit_id UUID,
  p_nurse_id UUID
)
RETURNS VOID AS $$
BEGIN
  UPDATE visits
  SET
    nurse_id = p_nurse_id,
    queue_status = 'with_nurse'
  WHERE id = p_visit_id
    AND queue_status = 'waiting';
END;
$$ LANGUAGE plpgsql;

-- Function to mark patient ready for doctor (nurse completes intake)
CREATE OR REPLACE FUNCTION mark_ready_for_doctor(p_visit_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE visits
  SET queue_status = 'ready_for_doctor'
  WHERE id = p_visit_id
    AND queue_status = 'with_nurse';
END;
$$ LANGUAGE plpgsql;

-- Function for doctor to claim a patient from the queue
CREATE OR REPLACE FUNCTION claim_patient(
  p_visit_id UUID,
  p_doctor_id UUID
)
RETURNS VOID AS $$
BEGIN
  UPDATE visits
  SET
    doctor_id = p_doctor_id,
    queue_status = 'with_doctor'
  WHERE id = p_visit_id
    AND queue_status = 'ready_for_doctor';
END;
$$ LANGUAGE plpgsql;

-- Function to get clinic queue for today
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
BEGIN
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
$$ LANGUAGE plpgsql STABLE;

-- Function to complete a visit (mark as done in queue)
CREATE OR REPLACE FUNCTION complete_visit_queue(p_visit_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE visits
  SET queue_status = 'completed'
  WHERE id = p_visit_id
    AND queue_status = 'with_doctor';
END;
$$ LANGUAGE plpgsql;

-- Function to cancel a visit in queue
CREATE OR REPLACE FUNCTION cancel_visit_queue(p_visit_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE visits
  SET queue_status = 'cancelled'
  WHERE id = p_visit_id
    AND queue_status IN ('waiting', 'with_nurse', 'ready_for_doctor');
END;
$$ LANGUAGE plpgsql;

-- Enable realtime for visits table (for queue updates)
ALTER PUBLICATION supabase_realtime ADD TABLE visits;
