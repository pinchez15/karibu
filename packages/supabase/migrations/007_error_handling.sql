-- Migration: Error Handling and Processing State
-- Adds error tracking columns and concurrency control for audio processing

-- Add error tracking columns to visits
ALTER TABLE visits ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS error_at TIMESTAMPTZ;

-- Update visits status constraint to include 'error'
ALTER TABLE visits DROP CONSTRAINT IF EXISTS visits_status_check;
ALTER TABLE visits ADD CONSTRAINT visits_status_check
  CHECK (status IN ('recording', 'uploading', 'processing', 'review', 'sent', 'completed', 'error'));

-- Add processing lock columns to audio_uploads for concurrency control
ALTER TABLE audio_uploads ADD COLUMN IF NOT EXISTS processing_lock UUID;
ALTER TABLE audio_uploads ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
ALTER TABLE audio_uploads ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
ALTER TABLE audio_uploads ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMPTZ;

-- Index for finding unlocked uploads ready for processing
CREATE INDEX IF NOT EXISTS idx_audio_uploads_processing
  ON audio_uploads(status, processing_lock)
  WHERE status IN ('uploaded', 'transcribing', 'failed');

-- Function to acquire a processing lock
CREATE OR REPLACE FUNCTION acquire_audio_processing_lock(
  p_visit_id UUID,
  p_lock_id UUID,
  p_lock_timeout_seconds INTEGER DEFAULT 300
)
RETURNS BOOLEAN AS $$
DECLARE
  v_locked BOOLEAN;
BEGIN
  -- Try to acquire lock only if:
  -- 1. No current lock exists, OR
  -- 2. Lock has expired (older than timeout)
  UPDATE audio_uploads
  SET
    processing_lock = p_lock_id,
    locked_at = NOW()
  WHERE visit_id = p_visit_id
    AND (
      processing_lock IS NULL
      OR locked_at < NOW() - (p_lock_timeout_seconds || ' seconds')::INTERVAL
    )
  RETURNING TRUE INTO v_locked;

  RETURN COALESCE(v_locked, FALSE);
END;
$$ LANGUAGE plpgsql;

-- Function to release a processing lock
CREATE OR REPLACE FUNCTION release_audio_processing_lock(
  p_visit_id UUID,
  p_lock_id UUID
)
RETURNS VOID AS $$
BEGIN
  UPDATE audio_uploads
  SET
    processing_lock = NULL,
    locked_at = NULL
  WHERE visit_id = p_visit_id
    AND processing_lock = p_lock_id;
END;
$$ LANGUAGE plpgsql;

-- Function to mark audio upload as failed and increment retry count
CREATE OR REPLACE FUNCTION mark_audio_upload_failed(
  p_visit_id UUID,
  p_error_message TEXT
)
RETURNS VOID AS $$
BEGIN
  UPDATE audio_uploads
  SET
    status = 'failed',
    error_message = p_error_message,
    retry_count = COALESCE(retry_count, 0) + 1,
    last_retry_at = NOW(),
    processing_lock = NULL,
    locked_at = NULL
  WHERE visit_id = p_visit_id;
END;
$$ LANGUAGE plpgsql;

-- Function to clear visit error state when retrying
CREATE OR REPLACE FUNCTION clear_visit_error(p_visit_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE visits
  SET
    error_message = NULL,
    error_at = NULL,
    status = 'processing'
  WHERE id = p_visit_id
    AND status = 'error';
END;
$$ LANGUAGE plpgsql;
