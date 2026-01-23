-- Trigger to automatically start transcription when audio is uploaded
-- This calls the transcribe Edge Function when audio upload status changes to 'uploaded'

CREATE OR REPLACE FUNCTION trigger_transcription()
RETURNS TRIGGER AS $$
DECLARE
  supabase_url TEXT;
  service_key TEXT;
BEGIN
  -- Only trigger when status changes to 'uploaded'
  IF NEW.status = 'uploaded' AND (OLD.status IS NULL OR OLD.status != 'uploaded') THEN
    -- Get the Supabase URL and service key from vault (or use pg_net extension)
    -- For now, we'll use a webhook approach where the app confirms upload
    -- and triggers transcription

    -- Update status to indicate transcription is queued
    NEW.status := 'transcribing';
    NEW.transcription_started_at := NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: The actual Edge Function call is made by the mobile app after confirming upload
-- This trigger just updates the status for tracking

CREATE TRIGGER on_audio_uploaded
  BEFORE UPDATE ON audio_uploads
  FOR EACH ROW
  EXECUTE FUNCTION trigger_transcription();

-- Function to be called by Edge Function when transcription is complete
CREATE OR REPLACE FUNCTION complete_transcription(
  p_visit_id UUID,
  p_transcript TEXT
)
RETURNS VOID AS $$
BEGIN
  -- Update audio upload status
  UPDATE audio_uploads
  SET status = 'completed',
      transcription_completed_at = NOW()
  WHERE visit_id = p_visit_id;

  -- Insert or update provider note with transcript
  INSERT INTO provider_notes (visit_id, transcript, status)
  VALUES (p_visit_id, p_transcript, 'draft')
  ON CONFLICT (visit_id)
  DO UPDATE SET transcript = p_transcript, updated_at = NOW();
END;
$$ LANGUAGE plpgsql;
