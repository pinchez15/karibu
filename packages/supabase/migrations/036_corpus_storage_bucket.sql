-- Migration 036: medical-corpus storage bucket
-- ============================================================================
-- The /library page on the Karibu site lets clinicians (and the public)
-- read the same evidence the AI cites, AND download the original PDF
-- source. The PDFs live in Supabase Storage in a public bucket so they
-- can be served via a stable URL and don't bloat the Next.js deploy.
--
-- The embed script (packages/supabase/scripts/embed-corpus.ts) uploads
-- each source PDF here, then extracts + chunks + embeds the text into
-- medical_corpus. medical_documents.source_url ends up pointing back to
-- the Storage object so /library can offer a "Download original" link.
-- ============================================================================

-- Idempotent — safe to re-run if the bucket already exists from an
-- earlier dashboard-side setup.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'medical-corpus',
  'medical-corpus',
  TRUE,                                  -- world-readable
  52428800,                              -- 50 MB cap; biggest current PDF is ~12 MB
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Anyone can read objects in the bucket (the bucket is public, but RLS
-- still applies to storage.objects). Service-role writes — no policy
-- needed for that since service role bypasses RLS.
DROP POLICY IF EXISTS "medical_corpus_public_read" ON storage.objects;
CREATE POLICY "medical_corpus_public_read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'medical-corpus');
