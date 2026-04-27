-- Ensure patient creation works for the dictation-first beta product even on
-- hosted projects that drifted behind the canonical migrations.

-- 1. Phone is optional in the current product.
ALTER TABLE patients ALTER COLUMN whatsapp_number DROP NOT NULL;

-- 2. New patient registration expects split names.
ALTER TABLE patients ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS last_name TEXT;

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
    ELSE first_name
  END
WHERE display_name IS NOT NULL
  AND (first_name IS NULL OR last_name IS NULL);

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

-- 3. Numeric patient IDs are expected in the queue UI and reports.
ALTER TABLE patients ADD COLUMN IF NOT EXISTS patient_id BIGINT;
CREATE SEQUENCE IF NOT EXISTS patient_id_seq START WITH 100001;
ALTER TABLE patients ALTER COLUMN patient_id SET DEFAULT nextval('patient_id_seq');

UPDATE patients
SET patient_id = nextval('patient_id_seq')
WHERE patient_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_patient_id ON patients(patient_id);

CREATE OR REPLACE FUNCTION assign_patient_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.patient_id IS NULL THEN
    NEW.patient_id := nextval('patient_id_seq');
  END IF;

  NEW.patient_number := NEW.patient_id::text;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS assign_patient_id_trigger ON patients;
CREATE TRIGGER assign_patient_id_trigger
  BEFORE INSERT ON patients
  FOR EACH ROW
  EXECUTE FUNCTION assign_patient_id();

UPDATE patients
SET patient_number = patient_id::text
WHERE patient_id IS NOT NULL
  AND (patient_number IS NULL OR patient_number <> patient_id::text);

-- 4. Keep the optional phone uniqueness rule from the later schema.
ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_clinic_id_whatsapp_number_key;
DROP INDEX IF EXISTS idx_patients_clinic_whatsapp;
CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_clinic_whatsapp
  ON patients(clinic_id, whatsapp_number)
  WHERE whatsapp_number IS NOT NULL;
