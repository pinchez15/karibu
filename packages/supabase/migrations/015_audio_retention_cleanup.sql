-- Audio retention cleanup function
-- Deletes audio files from storage after retention period expires (90 days)
-- Sets retention_expires_at on visits when audio is uploaded (if not already set)

-- Backfill: set retention_expires_at for existing visits that have audio but no expiry
UPDATE visits
SET retention_expires_at = visit_date + INTERVAL '90 days'
WHERE retention_expires_at IS NULL
  AND status NOT IN ('recording', 'uploading')
  AND audio_deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM audio_uploads
    WHERE audio_uploads.visit_id = visits.id
      AND audio_uploads.status = 'completed'
  );

-- Function to clean up expired audio recordings
-- Should be called on a schedule (daily via pg_cron or edge function cron)
CREATE OR REPLACE FUNCTION cleanup_expired_audio()
RETURNS TABLE(deleted_count INTEGER, error_count INTEGER) AS $$
DECLARE
  v_visit RECORD;
  v_deleted INTEGER := 0;
  v_errors INTEGER := 0;
BEGIN
  -- Find visits with expired retention that still have audio
  FOR v_visit IN
    SELECT v.id AS visit_id, au.storage_path
    FROM visits v
    JOIN audio_uploads au ON au.visit_id = v.id
    WHERE v.retention_expires_at < NOW()
      AND v.audio_deleted_at IS NULL
      AND au.storage_path IS NOT NULL
    LIMIT 100  -- Process in batches to avoid long transactions
  LOOP
    BEGIN
      -- Mark the audio as deleted (storage deletion happens via edge function)
      UPDATE visits
      SET audio_deleted_at = NOW()
      WHERE id = v_visit.visit_id;

      -- Mark audio upload record
      UPDATE audio_uploads
      SET status = 'deleted'
      WHERE visit_id = v_visit.visit_id;

      -- Audit log
      INSERT INTO audit_logs (actor_type, action, resource_type, resource_id, metadata)
      VALUES (
        'system',
        'audio_retention_deleted',
        'visit',
        v_visit.visit_id,
        jsonb_build_object(
          'storage_path', v_visit.storage_path,
          'reason', 'retention_period_expired'
        )
      );

      v_deleted := v_deleted + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN QUERY SELECT v_deleted, v_errors;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to service role (called by edge function or pg_cron)
GRANT EXECUTE ON FUNCTION cleanup_expired_audio() TO service_role;

-- Trigger to auto-set retention_expires_at when audio upload completes
CREATE OR REPLACE FUNCTION set_retention_expiry()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    UPDATE visits
    SET retention_expires_at = NOW() + INTERVAL '90 days'
    WHERE id = NEW.visit_id
      AND retention_expires_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS set_retention_on_upload ON audio_uploads;
CREATE TRIGGER set_retention_on_upload
  AFTER UPDATE ON audio_uploads
  FOR EACH ROW
  EXECUTE FUNCTION set_retention_expiry();
