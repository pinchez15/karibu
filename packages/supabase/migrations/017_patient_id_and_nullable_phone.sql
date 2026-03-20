-- Patient registration improvements:
-- 1. Make whatsapp_number optional (many patients don't have phones)
-- 2. Add human-readable patient_number per clinic (e.g., KDC-0042)
-- 3. Auto-generate patient_number on insert

-- =============================================
-- MAKE WHATSAPP NUMBER OPTIONAL
-- =============================================

-- Drop the NOT NULL constraint on whatsapp_number
ALTER TABLE patients ALTER COLUMN whatsapp_number DROP NOT NULL;

-- Drop the unique constraint on (clinic_id, whatsapp_number) and recreate
-- to allow multiple patients with NULL phone at the same clinic
ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_clinic_id_whatsapp_number_key;

-- Add partial unique index: phone must be unique per clinic, but only when not null
CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_clinic_phone_unique
  ON patients(clinic_id, whatsapp_number)
  WHERE whatsapp_number IS NOT NULL;

-- =============================================
-- PATIENT NUMBER (human-readable per-clinic ID)
-- =============================================

ALTER TABLE patients ADD COLUMN IF NOT EXISTS patient_number TEXT;

-- Sequence table for per-clinic patient numbers
CREATE TABLE IF NOT EXISTS patient_number_sequences (
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE PRIMARY KEY,
  last_number INTEGER NOT NULL DEFAULT 0
);

-- Auto-generate patient_number on insert
CREATE OR REPLACE FUNCTION generate_patient_number()
RETURNS TRIGGER AS $$
DECLARE
  v_prefix TEXT;
  v_seq INTEGER;
BEGIN
  -- Get clinic receipt prefix (reuse from payments)
  SELECT COALESCE(receipt_prefix, UPPER(LEFT(slug, 3)))
  INTO v_prefix
  FROM clinics
  WHERE id = NEW.clinic_id;

  IF v_prefix IS NULL THEN
    v_prefix := 'KH';
  END IF;

  -- Advisory lock for concurrency safety
  PERFORM pg_advisory_xact_lock(hashtext('patient_seq:' || NEW.clinic_id::text));

  -- Increment sequence
  INSERT INTO patient_number_sequences (clinic_id, last_number)
  VALUES (NEW.clinic_id, 1)
  ON CONFLICT (clinic_id)
  DO UPDATE SET last_number = patient_number_sequences.last_number + 1
  RETURNING last_number INTO v_seq;

  -- Format: KDC-0042
  NEW.patient_number := v_prefix || '-' || LPAD(v_seq::text, 4, '0');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER generate_patient_number_trigger
  BEFORE INSERT ON patients
  FOR EACH ROW
  WHEN (NEW.patient_number IS NULL)
  EXECUTE FUNCTION generate_patient_number();

-- Index for patient number lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_clinic_number
  ON patients(clinic_id, patient_number);

-- Backfill existing patients with patient numbers
DO $$
DECLARE
  v_clinic RECORD;
  v_patient RECORD;
  v_prefix TEXT;
  v_seq INTEGER;
BEGIN
  FOR v_clinic IN SELECT DISTINCT clinic_id FROM patients LOOP
    SELECT COALESCE(receipt_prefix, UPPER(LEFT(slug, 3)))
    INTO v_prefix
    FROM clinics WHERE id = v_clinic.clinic_id;

    v_seq := 0;
    FOR v_patient IN
      SELECT id FROM patients
      WHERE clinic_id = v_clinic.clinic_id AND patient_number IS NULL
      ORDER BY created_at ASC
    LOOP
      v_seq := v_seq + 1;
      UPDATE patients
      SET patient_number = COALESCE(v_prefix, 'KH') || '-' || LPAD(v_seq::text, 4, '0')
      WHERE id = v_patient.id;
    END LOOP;

    -- Set the sequence counter
    INSERT INTO patient_number_sequences (clinic_id, last_number)
    VALUES (v_clinic.clinic_id, v_seq)
    ON CONFLICT (clinic_id)
    DO UPDATE SET last_number = v_seq;
  END LOOP;
END $$;

-- Grant access
GRANT ALL ON patient_number_sequences TO service_role;
