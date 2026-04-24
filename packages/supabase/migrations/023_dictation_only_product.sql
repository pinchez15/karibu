-- Migration 023: Dictation-only product
--
-- Major product pivot (2026-04-24): drop ambient audio capture and the entire
-- DPPA-cross-border consent flow that went with it. The new product:
--
--   - Clinician sees the patient face-to-face with no app involvement.
--   - After the patient leaves, clinician dictates a 1-3 minute summary on
--     the phone. Audio goes straight to OpenAI Whisper via the dictate edge
--     function and is never stored.
--   - An Inngest workflow turns the dictation transcript into a SOAP note,
--     suggests diagnoses with citations, and drafts the patient summary.
--   - Clinician reviews + approves + prints.
--
-- Therefore this migration removes:
--   - audio_uploads table + its triggers + its retention machinery
--   - patient_consents table + check_patient_consent() + the trigger added
--     in migration 022 that auto-maintained visits.consent_verified
--   - audio-recordings storage bucket
--   - Audio-pipeline columns on visits (consent_*, source_language,
--     audio_deleted_at, retention_expires_at)
--   - Long-form transcription columns on provider_notes (transcript_original,
--     transcript_english, transcription_provider, transcription_confidence,
--     diarization_output, audio_trimmed)
--   - The visit status values for the old pipeline (recording, uploading,
--     processing) — replaced with a smaller set: pending, review, sent,
--     completed, error.
--
-- All of the above are SAFE TO DROP because the product has not launched yet
-- — there is no production data to preserve. The seed data in 012 will not
-- match the new schema; it will need a re-seed if someone re-runs migrations.

-- =============================================================================
-- 0. Drop dependent views/functions/triggers FIRST so column drops succeed
-- =============================================================================

-- Triggers added in 022 (consent enforcement) — gone with consent
DROP TRIGGER IF EXISTS sync_visit_consent_verified_trigger ON patient_consents;
DROP TRIGGER IF EXISTS enforce_consent_on_provider_notes_trigger ON provider_notes;
DROP FUNCTION IF EXISTS sync_visit_consent_verified() CASCADE;
DROP FUNCTION IF EXISTS enforce_consent_on_provider_notes() CASCADE;

-- Audio retention machinery (015)
DROP TRIGGER IF EXISTS set_retention_on_upload ON audio_uploads;
DROP FUNCTION IF EXISTS cleanup_expired_audio() CASCADE;
DROP FUNCTION IF EXISTS set_retention_expiry() CASCADE;

-- Transcription pipeline trigger (005) — used to fire the now-deleted
-- transcribe edge function on audio upload
DROP TRIGGER IF EXISTS on_audio_uploaded ON audio_uploads;
DROP FUNCTION IF EXISTS trigger_transcription() CASCADE;
DROP FUNCTION IF EXISTS complete_transcription(uuid, text, jsonb) CASCADE;

-- Consent helper (011)
DROP FUNCTION IF EXISTS check_patient_consent(uuid, uuid) CASCADE;

-- =============================================================================
-- 1. Drop tables
-- =============================================================================

DROP TABLE IF EXISTS audio_uploads CASCADE;
DROP TABLE IF EXISTS patient_consents CASCADE;

-- =============================================================================
-- 2. Drop the audio-recordings storage bucket and its policies
-- =============================================================================

DO $$
BEGIN
  -- Storage policies live in storage.objects; drop bucket-scoped ones if any.
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Staff can upload to their clinic" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Staff can read their clinic audio" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Service role can manage all audio" ON storage.objects';
  END IF;
END $$;

-- Drop the bucket itself. CASCADE is implicit — Supabase storage removes
-- objects with the bucket. Safe because we have no production audio yet.
DELETE FROM storage.buckets WHERE id = 'audio-recordings';

-- =============================================================================
-- 3. Drop audio + consent columns from visits
-- =============================================================================

ALTER TABLE visits DROP COLUMN IF EXISTS consent_recording;
ALTER TABLE visits DROP COLUMN IF EXISTS consent_timestamp;
ALTER TABLE visits DROP COLUMN IF EXISTS consent_verified;
ALTER TABLE visits DROP COLUMN IF EXISTS consent_id;
ALTER TABLE visits DROP COLUMN IF EXISTS source_language;
ALTER TABLE visits DROP COLUMN IF EXISTS audio_deleted_at;
ALTER TABLE visits DROP COLUMN IF EXISTS retention_expires_at;

-- =============================================================================
-- 4. Tighten visits.status to the new lifecycle
-- =============================================================================

-- Migrate any rows on legacy statuses to the closest equivalent before
-- swapping the constraint. recording/uploading/processing all collapse to
-- pending — the clinician will need to (re)dictate.
UPDATE visits SET status = 'pending'
WHERE status IN ('recording', 'uploading', 'processing');

ALTER TABLE visits DROP CONSTRAINT IF EXISTS visits_status_check;
ALTER TABLE visits ADD CONSTRAINT visits_status_check
  CHECK (status IN ('pending', 'review', 'sent', 'completed', 'error'));

ALTER TABLE visits ALTER COLUMN status SET DEFAULT 'pending';

-- =============================================================================
-- 5. Drop long-form transcription columns from provider_notes
-- =============================================================================

ALTER TABLE provider_notes DROP COLUMN IF EXISTS transcript_original;
ALTER TABLE provider_notes DROP COLUMN IF EXISTS transcript_english;
ALTER TABLE provider_notes DROP COLUMN IF EXISTS transcription_provider;
ALTER TABLE provider_notes DROP COLUMN IF EXISTS transcription_confidence;
ALTER TABLE provider_notes DROP COLUMN IF EXISTS diarization_output;
ALTER TABLE provider_notes DROP COLUMN IF EXISTS audio_trimmed;

-- provider_notes.transcript stays — it now holds the dictation transcript
-- (Whisper output of the clinician's voice memo, never the patient's voice).
