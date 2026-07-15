-- Storage buckets + policies for the demo project.
--
-- Only medical-corpus (evidence-library PDFs, migration 036) is current
-- product surface. The audio-recordings bucket from migration 003 was
-- removed by migration 023 (dictation streams to Whisper, never stored) —
-- do not recreate it here.
--
-- Idempotent.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'medical-corpus',
  'medical-corpus',
  TRUE,       -- world-readable (evidence library PDFs)
  52428800,   -- 50 MB cap
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Policy (from migration 036). Newer Supabase projects may refuse policy DDL
-- on storage.objects from SQL (table ownership); if this is skipped, add the
-- same read policy via Dashboard -> Storage -> medical-corpus -> Policies.
-- Only needed if the /library evidence PDFs are uploaded to the demo.
DO $$
BEGIN
  DROP POLICY IF EXISTS "medical_corpus_public_read" ON storage.objects;
  CREATE POLICY "medical_corpus_public_read" ON storage.objects
    FOR SELECT
    USING (bucket_id = 'medical-corpus');
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'storage.objects policy skipped (create via dashboard if the library is needed)';
END $$;
