-- 086_patient_guardian_and_update.sql
--
-- Guardian relationship on intake; post-registration demographic edits while
-- keeping patient_number / patient id stable.

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS guardian_relationship TEXT;

ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_guardian_relationship_check;
ALTER TABLE patients ADD CONSTRAINT patients_guardian_relationship_check
  CHECK (
    guardian_relationship IS NULL
    OR guardian_relationship IN (
      'mother', 'father', 'husband', 'wife', 'relative', 'neighbor'
    )
  );

-- Replace rpc_create_patient to accept guardian_relationship.
DROP FUNCTION IF EXISTS rpc_create_patient(
  UUID, UUID, TEXT, TEXT, TEXT, DATE, TEXT,
  SMALLINT, SMALLINT, TIMESTAMPTZ, TEXT,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID
);

CREATE OR REPLACE FUNCTION rpc_create_patient(
  p_id UUID,
  p_clinic_id UUID,
  p_first_name TEXT DEFAULT NULL,
  p_last_name TEXT DEFAULT NULL,
  p_whatsapp_number TEXT DEFAULT NULL,
  p_date_of_birth DATE DEFAULT NULL,
  p_sex TEXT DEFAULT NULL,
  p_birth_year SMALLINT DEFAULT NULL,
  p_approximate_age SMALLINT DEFAULT NULL,
  p_age_recorded_at TIMESTAMPTZ DEFAULT NULL,
  p_dob_precision TEXT DEFAULT 'unknown',
  p_village TEXT DEFAULT NULL,
  p_parish TEXT DEFAULT NULL,
  p_subcounty TEXT DEFAULT NULL,
  p_district TEXT DEFAULT NULL,
  p_guardian_name TEXT DEFAULT NULL,
  p_guardian_relationship TEXT DEFAULT NULL,
  p_national_id TEXT DEFAULT NULL,
  p_client_op_id UUID DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);
  PERFORM assert_onboarding_complete();
  IF sync_op_already_applied(p_client_op_id) THEN
    RETURN;
  END IF;

  IF p_guardian_relationship IS NOT NULL
     AND TRIM(p_guardian_relationship) NOT IN (
       'mother', 'father', 'husband', 'wife', 'relative', 'neighbor'
     ) THEN
    RAISE EXCEPTION 'Invalid guardian_relationship';
  END IF;

  INSERT INTO patients (
    id,
    clinic_id,
    first_name,
    last_name,
    whatsapp_number,
    date_of_birth,
    sex,
    birth_year,
    approximate_age,
    age_recorded_at,
    dob_precision,
    village,
    parish,
    subcounty,
    district,
    guardian_name,
    guardian_relationship,
    national_id
  ) VALUES (
    p_id,
    p_clinic_id,
    NULLIF(TRIM(p_first_name), ''),
    NULLIF(TRIM(p_last_name), ''),
    NULLIF(TRIM(p_whatsapp_number), ''),
    p_date_of_birth,
    NULLIF(TRIM(p_sex), ''),
    p_birth_year,
    p_approximate_age,
    p_age_recorded_at,
    COALESCE(NULLIF(TRIM(p_dob_precision), ''), 'unknown'),
    NULLIF(TRIM(p_village), ''),
    NULLIF(TRIM(p_parish), ''),
    NULLIF(TRIM(p_subcounty), ''),
    NULLIF(TRIM(p_district), ''),
    NULLIF(TRIM(p_guardian_name), ''),
    NULLIF(TRIM(p_guardian_relationship), ''),
    NULLIF(TRIM(p_national_id), '')
  )
  ON CONFLICT (id) DO UPDATE SET
    first_name = COALESCE(EXCLUDED.first_name, patients.first_name),
    last_name = COALESCE(EXCLUDED.last_name, patients.last_name),
    whatsapp_number = COALESCE(EXCLUDED.whatsapp_number, patients.whatsapp_number),
    date_of_birth = COALESCE(EXCLUDED.date_of_birth, patients.date_of_birth),
    sex = COALESCE(EXCLUDED.sex, patients.sex),
    birth_year = COALESCE(EXCLUDED.birth_year, patients.birth_year),
    approximate_age = COALESCE(EXCLUDED.approximate_age, patients.approximate_age),
    age_recorded_at = COALESCE(EXCLUDED.age_recorded_at, patients.age_recorded_at),
    dob_precision = COALESCE(EXCLUDED.dob_precision, patients.dob_precision),
    village = COALESCE(EXCLUDED.village, patients.village),
    parish = COALESCE(EXCLUDED.parish, patients.parish),
    subcounty = COALESCE(EXCLUDED.subcounty, patients.subcounty),
    district = COALESCE(EXCLUDED.district, patients.district),
    guardian_name = COALESCE(EXCLUDED.guardian_name, patients.guardian_name),
    guardian_relationship = COALESCE(EXCLUDED.guardian_relationship, patients.guardian_relationship),
    national_id = COALESCE(EXCLUDED.national_id, patients.national_id),
    updated_at = NOW();

  PERFORM sync_op_record(p_client_op_id, p_clinic_id, 'create_patient', 'patients', p_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION rpc_create_patient(
  UUID, UUID, TEXT, TEXT, TEXT, DATE, TEXT,
  SMALLINT, SMALLINT, TIMESTAMPTZ, TEXT,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID
) TO authenticated, service_role;

-- Edit demographics after registration (patient_number unchanged).
CREATE OR REPLACE FUNCTION rpc_update_patient_demographics(
  p_patient_id UUID,
  p_clinic_id UUID,
  p_first_name TEXT,
  p_last_name TEXT,
  p_village TEXT DEFAULT NULL,
  p_parish TEXT DEFAULT NULL,
  p_subcounty TEXT DEFAULT NULL,
  p_district TEXT DEFAULT NULL,
  p_guardian_name TEXT DEFAULT NULL,
  p_guardian_relationship TEXT DEFAULT NULL,
  p_whatsapp_number TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);

  IF NULLIF(TRIM(p_first_name), '') IS NULL OR NULLIF(TRIM(p_last_name), '') IS NULL THEN
    RAISE EXCEPTION 'First name and last name are required';
  END IF;

  IF p_guardian_relationship IS NOT NULL
     AND TRIM(p_guardian_relationship) NOT IN (
       'mother', 'father', 'husband', 'wife', 'relative', 'neighbor'
     ) THEN
    RAISE EXCEPTION 'Invalid guardian_relationship';
  END IF;

  UPDATE patients
  SET
    first_name = NULLIF(TRIM(p_first_name), ''),
    last_name = NULLIF(TRIM(p_last_name), ''),
    village = NULLIF(TRIM(p_village), ''),
    parish = NULLIF(TRIM(p_parish), ''),
    subcounty = NULLIF(TRIM(p_subcounty), ''),
    district = NULLIF(TRIM(p_district), ''),
    guardian_name = NULLIF(TRIM(p_guardian_name), ''),
    guardian_relationship = NULLIF(TRIM(p_guardian_relationship), ''),
    whatsapp_number = NULLIF(TRIM(p_whatsapp_number), ''),
    updated_at = NOW()
  WHERE id = p_patient_id
    AND clinic_id = p_clinic_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Patient not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION rpc_update_patient_demographics(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_update_patient_demographics(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated, service_role;
