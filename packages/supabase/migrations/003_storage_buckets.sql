-- Storage buckets for audio files

-- Create audio bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'audio-recordings',
  'audio-recordings',
  false,
  104857600, -- 100MB max file size
  ARRAY['audio/m4a', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/webm', 'audio/aac']
);

-- Storage policies for audio bucket
CREATE POLICY "Staff can upload audio for their clinic"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'audio-recordings' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM clinics WHERE id = get_current_clinic_id()
  )
);

CREATE POLICY "Staff can view audio for their clinic"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'audio-recordings' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM clinics WHERE id = get_current_clinic_id()
  )
);

CREATE POLICY "Staff can delete audio for their clinic"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'audio-recordings' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM clinics WHERE id = get_current_clinic_id()
  )
);
