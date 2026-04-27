-- Beta schema audit: run this in hosted Supabase SQL editor.
-- It is read-only. Purpose: verify that web, Android, and database agree on
-- the patient + queue contract before beta.

-- ============================================================================
-- 1. Patients table shape expected by web + Android
-- ============================================================================
SELECT
  'patients_columns' AS check_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'patients'
  AND column_name IN (
    'id',
    'clinic_id',
    'patient_id',
    'patient_number',
    'first_name',
    'last_name',
    'display_name',
    'whatsapp_number',
    'date_of_birth',
    'sex',
    'created_at',
    'updated_at'
  )
ORDER BY ordinal_position;

-- Expected:
-- - first_name exists
-- - last_name exists
-- - whatsapp_number is nullable
-- - patient_id exists

-- ============================================================================
-- 2. Visits table shape expected by queue + dictation flow
-- ============================================================================
SELECT
  'visits_columns' AS check_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'visits'
  AND column_name IN (
    'id',
    'clinic_id',
    'patient_id',
    'doctor_id',
    'nurse_id',
    'status',
    'queue_status',
    'queue_position',
    'priority',
    'chief_complaint',
    'checked_in_at',
    'review_status',
    'visit_date',
    'department',
    'created_at',
    'updated_at'
  )
ORDER BY ordinal_position;

-- Expected:
-- - department exists
-- - status supports pending/review/sent/completed/error in current app model

-- ============================================================================
-- 3. Staff table shape expected by Clerk + both apps
-- ============================================================================
SELECT
  'staff_columns' AS check_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'staff'
  AND column_name IN (
    'id',
    'clerk_user_id',
    'clinic_id',
    'email',
    'display_name',
    'role',
    'is_active',
    'deactivated_at'
  )
ORDER BY ordinal_position;

-- ============================================================================
-- 4. Queue RPC overload audit
-- ============================================================================
SELECT
  'check_in_patient_overloads' AS check_name,
  oid::regprocedure::text AS signature
FROM pg_proc
WHERE proname = 'check_in_patient'
ORDER BY oid::regprocedure::text;

-- Expected:
-- - exactly one row:
--   check_in_patient(uuid,uuid,text,text,uuid,text)

SELECT
  'queue_rpcs' AS check_name,
  oid::regprocedure::text AS signature
FROM pg_proc
WHERE proname IN (
  'get_clinic_queue',
  'assign_to_nurse',
  'mark_ready_for_doctor',
  'claim_patient',
  'start_visit_self_triage'
)
ORDER BY proname, oid::regprocedure::text;

-- ============================================================================
-- 5. Trigger / function support for patient naming + numeric IDs
-- ============================================================================
SELECT
  'patient_support_functions' AS check_name,
  proname
FROM pg_proc
WHERE proname IN ('sync_patient_display_name', 'assign_patient_id')
ORDER BY proname;

SELECT
  'patient_triggers' AS check_name,
  trigger_name,
  event_manipulation,
  action_timing
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table = 'patients'
  AND trigger_name IN ('sync_patient_display_name_trigger', 'assign_patient_id_trigger')
ORDER BY trigger_name, event_manipulation;

-- ============================================================================
-- 6. Index / uniqueness audit for optional phone + numeric patient IDs
-- ============================================================================
SELECT
  'patient_indexes' AS check_name,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'patients'
ORDER BY indexname;

-- Expected:
-- - unique index on patient_id
-- - partial unique index on (clinic_id, whatsapp_number) WHERE whatsapp_number IS NOT NULL

-- ============================================================================
-- 7. RLS policy audit for staff, patients, visits
-- ============================================================================
SELECT
  'rls_policies' AS check_name,
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('staff', 'patients', 'visits')
ORDER BY tablename, policyname;

-- ============================================================================
-- 8. Clinic/staff identity sanity
-- ============================================================================
SELECT
  'staff_identity_health' AS check_name,
  COUNT(*) FILTER (WHERE clinic_id IS NULL) AS staff_missing_clinic,
  COUNT(*) FILTER (WHERE clerk_user_id IS NULL OR clerk_user_id = '') AS staff_missing_clerk_user,
  COUNT(*) FILTER (WHERE is_active IS NOT TRUE) AS inactive_staff_rows
FROM staff;

SELECT
  'staff_by_clinic' AS check_name,
  clinic_id,
  COUNT(*) AS staff_count
FROM staff
GROUP BY clinic_id
ORDER BY staff_count DESC;

-- ============================================================================
-- 9. Sample patient rows to see naming shape
-- ============================================================================
SELECT
  'recent_patients' AS check_name,
  id,
  clinic_id,
  patient_id,
  patient_number,
  first_name,
  last_name,
  display_name,
  whatsapp_number,
  date_of_birth,
  sex,
  created_at
FROM patients
ORDER BY created_at DESC
LIMIT 20;

-- ============================================================================
-- 10. Status vocabulary actually present in data
-- ============================================================================
SELECT 'visit_statuses' AS check_name, status, COUNT(*) AS count
FROM visits
GROUP BY status
ORDER BY status;

SELECT 'queue_statuses' AS check_name, queue_status, COUNT(*) AS count
FROM visits
GROUP BY queue_status
ORDER BY queue_status;

SELECT 'review_statuses' AS check_name, review_status, COUNT(*) AS count
FROM visits
GROUP BY review_status
ORDER BY review_status;

-- ============================================================================
-- 11. PostgREST schema cache smoke test
-- ============================================================================
-- If the table has been altered manually or via SQL editor and the API still
-- acts like columns/functions don't exist, run this after migrations:
-- NOTIFY pgrst, 'reload schema';
