-- Split display_name into first_name + last_name
-- Change patient_number from prefix-string (CAP-0009) to auto-incrementing bigint

-- =============================================
-- ADD FIRST_NAME AND LAST_NAME COLUMNS
-- =============================================

ALTER TABLE patients ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS last_name TEXT;

-- Backfill from display_name: split on first space
-- In Uganda, naming convention is often "Surname GivenName" (e.g., "Natukunda Grace")
-- We treat the first word as last_name and the rest as first_name
UPDATE patients
SET
  last_name = CASE
    WHEN display_name IS NOT NULL AND position(' ' in display_name) > 0
    THEN trim(substring(display_name from 1 for position(' ' in display_name) - 1))
    ELSE display_name
  END,
  first_name = CASE
    WHEN display_name IS NOT NULL AND position(' ' in display_name) > 0
    THEN trim(substring(display_name from position(' ' in display_name) + 1))
    ELSE NULL
  END
WHERE display_name IS NOT NULL AND first_name IS NULL;

-- Keep display_name as a generated column for backwards compatibility
-- (Can't use GENERATED ALWAYS AS on existing column, so we use a trigger)
CREATE OR REPLACE FUNCTION sync_patient_display_name()
RETURNS TRIGGER AS $$
BEGIN
  NEW.display_name := trim(COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, ''));
  IF NEW.display_name = '' THEN
    NEW.display_name := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_patient_display_name_trigger ON patients;
CREATE TRIGGER sync_patient_display_name_trigger
  BEFORE INSERT OR UPDATE OF first_name, last_name ON patients
  FOR EACH ROW
  EXECUTE FUNCTION sync_patient_display_name();

-- =============================================
-- CHANGE PATIENT_NUMBER TO NUMERIC
-- =============================================

-- Add new numeric column
ALTER TABLE patients ADD COLUMN IF NOT EXISTS patient_id BIGINT;

-- Create a global sequence for patient IDs (not per-clinic)
CREATE SEQUENCE IF NOT EXISTS patient_id_seq START WITH 100001;

-- Backfill existing patients with numeric IDs
UPDATE patients
SET patient_id = nextval('patient_id_seq')
WHERE patient_id IS NULL;

-- Set default for new patients
ALTER TABLE patients ALTER COLUMN patient_id SET DEFAULT nextval('patient_id_seq');

-- Add unique index on patient_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_patient_id ON patients(patient_id);

-- Drop the old patient_number trigger (no longer generating prefix-string format)
DROP TRIGGER IF EXISTS generate_patient_number_trigger ON patients;

-- Create new trigger that auto-assigns patient_id from sequence
CREATE OR REPLACE FUNCTION assign_patient_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.patient_id IS NULL THEN
    NEW.patient_id := nextval('patient_id_seq');
  END IF;
  -- Also set patient_number to the numeric string for backwards compat
  NEW.patient_number := NEW.patient_id::text;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER assign_patient_id_trigger
  BEFORE INSERT ON patients
  FOR EACH ROW
  EXECUTE FUNCTION assign_patient_id();

-- Update existing patient_number to match patient_id
UPDATE patients SET patient_number = patient_id::text WHERE patient_id IS NOT NULL;

-- Update the queue function to return first_name and last_name
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
    AND v.visit_date = CURRENT_DATE
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

-- Add indexes for name search
CREATE INDEX IF NOT EXISTS idx_patients_first_name ON patients(first_name);
CREATE INDEX IF NOT EXISTS idx_patients_last_name ON patients(last_name);

-- Grant sequence access
GRANT USAGE ON SEQUENCE patient_id_seq TO service_role;
GRANT USAGE ON SEQUENCE patient_id_seq TO anon;
GRANT USAGE ON SEQUENCE patient_id_seq TO authenticated;
