-- KaribuLearn — public storage bucket for downloadable case packs (.kpack).
-- Run in KaribuLearn Supabase → SQL Editor after 002_case_corrections.sql.
--
-- Packs are immutable JSON (no PHI). Public read keeps downloads simple for
-- offline-first Learn; uploads use the service role from your machine/CI.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'learn-packs',
  'learn-packs',
  TRUE,
  10485760,  -- 10 MB per pack (chapter packs are typically < 2 MB)
  ARRAY['application/json', 'application/octet-stream', 'text/plain']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- World-readable objects (bucket is public; RLS still applies on storage.objects).
DROP POLICY IF EXISTS "learn_packs_public_read" ON storage.objects;
CREATE POLICY "learn_packs_public_read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'learn-packs');

-- Optional: let authenticated learners list pack objects (not required for GET-by-URL).
DROP POLICY IF EXISTS "learn_packs_authenticated_list" ON storage.objects;
CREATE POLICY "learn_packs_authenticated_list" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'learn-packs');
