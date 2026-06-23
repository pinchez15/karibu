-- 079_staff_onboarding.sql
-- KaribuEHR Onboarding: required cross-role training before real patient registration.
-- KaribuLearn (free Android CME) is a separate product; this is Clerk-gated EHR staff only.

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

COMMENT ON COLUMN staff.onboarding_completed_at IS
  'Set when the staff member finishes all required EHR onboarding modules. NULL blocks rpc_create_patient.';

CREATE TABLE IF NOT EXISTS staff_onboarding_progress (
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  score INTEGER,
  total INTEGER,
  PRIMARY KEY (staff_id, module_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_onboarding_progress_staff
  ON staff_onboarding_progress (staff_id);

-- Required modules (must match content/onboarding/manifest.json).
CREATE OR REPLACE FUNCTION onboarding_required_modules()
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY[
    'records-register',
    'nurse-vitals',
    'clinician-note-pharmacy',
    'lab-result',
    'pharmacy-dispense',
    'billing-payment'
  ]::TEXT[];
$$;

CREATE OR REPLACE FUNCTION assert_onboarding_complete()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id UUID;
BEGIN
  v_staff_id := get_current_staff_id();
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'Staff context required';
  END IF;

  IF EXISTS (
    SELECT 1 FROM staff
    WHERE id = v_staff_id
      AND onboarding_completed_at IS NOT NULL
  ) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'ONBOARDING_REQUIRED'
    USING HINT = 'Complete KaribuEHR onboarding before registering patients.';
END;
$$;

CREATE OR REPLACE FUNCTION rpc_get_onboarding_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id UUID;
  v_completed_at TIMESTAMPTZ;
  v_modules JSONB;
BEGIN
  v_staff_id := get_current_staff_id();
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'Staff context required';
  END IF;

  SELECT onboarding_completed_at INTO v_completed_at
  FROM staff WHERE id = v_staff_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'module_id', p.module_id,
        'completed_at', p.completed_at,
        'score', p.score,
        'total', p.total
      )
      ORDER BY p.module_id
    ),
    '[]'::jsonb
  )
  INTO v_modules
  FROM staff_onboarding_progress p
  WHERE p.staff_id = v_staff_id;

  RETURN jsonb_build_object(
    'completed', v_completed_at IS NOT NULL,
    'completed_at', v_completed_at,
    'required_modules', to_jsonb(onboarding_required_modules()),
    'progress', v_modules
  );
END;
$$;

CREATE OR REPLACE FUNCTION rpc_complete_onboarding_module(
  p_module_id TEXT,
  p_score INTEGER DEFAULT NULL,
  p_total INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id UUID;
  v_required TEXT[];
  v_done INTEGER;
  v_completed_at TIMESTAMPTZ;
BEGIN
  v_staff_id := get_current_staff_id();
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'Staff context required';
  END IF;

  v_required := onboarding_required_modules();
  IF NOT (p_module_id = ANY (v_required)) THEN
    RAISE EXCEPTION 'Unknown onboarding module: %', p_module_id;
  END IF;

  INSERT INTO staff_onboarding_progress (staff_id, module_id, score, total)
  VALUES (v_staff_id, p_module_id, p_score, p_total)
  ON CONFLICT (staff_id, module_id) DO UPDATE SET
    completed_at = NOW(),
    score = COALESCE(EXCLUDED.score, staff_onboarding_progress.score),
    total = COALESCE(EXCLUDED.total, staff_onboarding_progress.total);

  SELECT COUNT(*)::INTEGER INTO v_done
  FROM staff_onboarding_progress
  WHERE staff_id = v_staff_id
    AND module_id = ANY (v_required);

  IF v_done >= cardinality(v_required) THEN
    UPDATE staff
    SET onboarding_completed_at = COALESCE(onboarding_completed_at, NOW()),
        updated_at = NOW()
    WHERE id = v_staff_id
    RETURNING onboarding_completed_at INTO v_completed_at;
  ELSE
    SELECT onboarding_completed_at INTO v_completed_at
    FROM staff WHERE id = v_staff_id;
  END IF;

  RETURN jsonb_build_object(
    'module_id', p_module_id,
    'completed', v_completed_at IS NOT NULL,
    'completed_at', v_completed_at,
    'modules_done', v_done,
    'modules_required', cardinality(v_required)
  );
END;
$$;

-- Gate real patient registration until onboarding is complete.
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
  p_national_id TEXT DEFAULT NULL,
  p_client_op_id UUID DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);
  PERFORM assert_onboarding_complete();
  IF sync_op_already_applied(p_client_op_id) THEN
    RETURN;
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
    national_id = COALESCE(EXCLUDED.national_id, patients.national_id),
    updated_at = NOW();

  PERFORM sync_op_record(p_client_op_id, p_clinic_id, 'create_patient', 'patients', p_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_get_onboarding_status() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION rpc_complete_onboarding_module(TEXT, INTEGER, INTEGER) TO anon, authenticated;

-- Grandfather existing staff so rollout does not block current clinics.
UPDATE staff
SET onboarding_completed_at = COALESCE(onboarding_completed_at, NOW())
WHERE onboarding_completed_at IS NULL;
