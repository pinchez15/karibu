-- Beta reset for hosted Supabase
--
-- Use only before external beta begins. This script is intentionally
-- destructive: it removes demo/legacy data and drops tables from product
-- paths that no longer exist after the dictation-only pivot.
--
-- Why this is a script instead of a migration:
-- - the repo should keep a stable forward migration chain
-- - a "truncate everything" migration would be dangerous once real users exist
--
-- What this script preserves:
-- - schema tables still required by the current product
-- - HMIS lookup data in hmis_diagnosis_codes
-- - existing clinics/staff rows, because Android/web auth still depends on
--   staff.clerk_user_id -> clinic_id mapping
--
-- If you truly want a total identity wipe too, see the optional section at the
-- bottom and be ready to recreate clinics/staff via Clerk webhook or admin SQL.

BEGIN;

-- ============================================================================
-- 1. Drop legacy ambient-recording / patient-delivery tables if they still
--    exist in the hosted project.
-- ============================================================================

DROP TABLE IF EXISTS audio_uploads CASCADE;
DROP TABLE IF EXISTS patient_consents CASCADE;
DROP TABLE IF EXISTS magic_links CASCADE;
DROP TABLE IF EXISTS message_logs CASCADE;

-- Storage buckets cannot be deleted from SQL in hosted Supabase. Remove the
-- old `audio-recordings` bucket from the Storage UI or Storage API after this
-- script runs if it still exists.

-- Best-effort cleanup for old bucket policies / functions in drifted projects.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Staff can upload to their clinic" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Staff can read their clinic audio" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Service role can manage all audio" ON storage.objects';
  END IF;
END $$;

DROP FUNCTION IF EXISTS cleanup_expired_audio() CASCADE;
DROP FUNCTION IF EXISTS set_retention_expiry() CASCADE;
DROP FUNCTION IF EXISTS trigger_transcription() CASCADE;
DROP FUNCTION IF EXISTS complete_transcription(uuid, text, jsonb) CASCADE;
DROP FUNCTION IF EXISTS check_patient_consent(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS sync_visit_consent_verified() CASCADE;
DROP FUNCTION IF EXISTS enforce_consent_on_provider_notes() CASCADE;

-- ============================================================================
-- 2. Clear all demo / pre-beta operational data.
-- ============================================================================
--
-- Keep clinics + staff for now so your current Clerk users can still map to a
-- clinic after the reset. Without that, Android/web sign-in will break until
-- identity rows are recreated.

TRUNCATE TABLE
  audit_logs,
  payments,
  payment_receipt_sequences,
  patient_notes,
  provider_notes,
  visit_diagnosis_codes,
  visits,
  patients,
  patient_number_sequences
RESTART IDENTITY CASCADE;

-- ============================================================================
-- 3. Keep HMIS lookup data, but remove any seed/demo clinics or staff manually
--    only if you are ready to reprovision identity.
-- ============================================================================
--
-- Optional full identity reset:
-- TRUNCATE TABLE staff, clinics RESTART IDENTITY CASCADE;
--
-- If you run that, you must recreate:
-- - at least one clinic row
-- - at least one active staff row with clerk_user_id and clinic_id
-- - any receipt_prefix / print metadata needed by the web app

COMMIT;
