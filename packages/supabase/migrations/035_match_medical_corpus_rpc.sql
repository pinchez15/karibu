-- Migration 035: medical_corpus retrieval RPC
-- ============================================================================
-- The Inngest reviewClinicianNote function calls supabase.rpc('match_medical_corpus')
-- to retrieve the top-N most similar guideline chunks against an embedded
-- query (clinician note + chief complaint + vitals). pgvector exposes <=>
-- (cosine distance) but PostgREST can't compose that operator directly in a
-- .from(...).select() chain — we wrap it in a SECURITY DEFINER function.
--
-- Returns chunk + document metadata as a flat shape so the function avoids
-- a follow-up join.
-- ============================================================================

-- Build the IVFFlat index now that the table is set up. Lists=100 is fine
-- for the low thousands of chunks we'll have at launch; bump to 1000 if
-- the corpus grows past 100k.
CREATE INDEX IF NOT EXISTS idx_medical_corpus_embedding_cosine
  ON medical_corpus
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE OR REPLACE FUNCTION match_medical_corpus(
  query_embedding vector(1536),
  match_count INT DEFAULT 6
)
RETURNS TABLE (
  id BIGINT,
  document_id BIGINT,
  document_title TEXT,
  document_slug TEXT,
  source_org TEXT,
  source_year INTEGER,
  section TEXT,
  section_anchor TEXT,
  content TEXT,
  distance FLOAT
)
LANGUAGE SQL STABLE
AS $$
  SELECT
    c.id,
    c.document_id,
    d.title AS document_title,
    d.slug AS document_slug,
    d.source_org,
    d.source_year,
    c.section,
    c.section_anchor,
    c.content,
    (c.embedding <=> query_embedding)::float AS distance
  FROM medical_corpus c
  JOIN medical_documents d ON d.id = c.document_id
  WHERE d.is_published = TRUE
    AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Service-role client (used by the Inngest function) bypasses RLS, but
-- grant explicit execute so the function is callable from PostgREST too.
GRANT EXECUTE ON FUNCTION match_medical_corpus(vector(1536), INT)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION match_medical_corpus IS
  'Cosine-similarity retrieval over published medical_corpus chunks. Returns chunks ordered by distance (lower is more similar). Used by the Inngest reviewClinicianNote function.';
