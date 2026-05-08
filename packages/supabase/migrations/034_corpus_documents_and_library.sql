-- Migration 034: corpus documents + public library structure
-- ============================================================================
-- Promotes the medical_corpus into a real publishable knowledge base. The
-- public-facing library at /library renders directly from these tables —
-- the database is the source of truth, the website is the view. No separate
-- CMS. When AI cites "Uganda Clinical Guidelines 2024, §4.2" the link goes
-- to /library/uganda-clinical-guidelines-2024#section-4-2 which shows the
-- exact text the model retrieved.
--
-- Why split into medical_documents + medical_corpus instead of denormalizing
-- doc_title onto every chunk:
--   - One row per document for /library index, with metadata (reviewers,
--     last_reviewed_at, summary) that doesn't repeat per chunk
--   - Foreign key from chunks lets us re-import a document atomically
--     (delete chunks, re-embed) without orphans
--   - Public visibility (`is_published`) gates the whole document, not chunk
--     by chunk
--
-- Migration 033 created medical_corpus with denormalized fields. Since no
-- corpus has been embedded yet (table is empty), we drop and recreate.
-- ============================================================================

-- ============================================================================
-- 1. Drop the migration-033 corpus shape (empty — safe to drop)
-- ============================================================================

DROP TABLE IF EXISTS medical_corpus;

-- ============================================================================
-- 2. medical_documents — document-level metadata
-- ============================================================================

CREATE TABLE medical_documents (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  -- High-level grouping for the /library index. Curate the set carefully —
  -- it's how clinicians (and AI prompts) navigate the corpus.
  topic TEXT NOT NULL CHECK (topic IN (
    'malaria', 'hiv_tb', 'maternal_anc', 'child_health',
    'ncd', 'mental_health', 'emergency', 'imci',
    'pharmacology', 'guidelines_general'
  )),
  jurisdiction TEXT NOT NULL DEFAULT 'uganda',
  source_org TEXT,           -- e.g., "Ministry of Health, Uganda"
  source_year INTEGER,
  source_url TEXT,           -- back-link to authoritative source PDF
  summary TEXT,              -- short paragraph for the /library index card
  reviewers TEXT[] NOT NULL DEFAULT '{}',
  last_reviewed_at DATE,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_medical_documents_topic
  ON medical_documents(topic) WHERE is_published = TRUE;

CREATE INDEX idx_medical_documents_jurisdiction
  ON medical_documents(jurisdiction) WHERE is_published = TRUE;

ALTER TABLE medical_documents ENABLE ROW LEVEL SECURITY;

-- Anyone (anonymous web visitors included) can read published documents.
DROP POLICY IF EXISTS "medical_documents_public_select" ON medical_documents;
CREATE POLICY "medical_documents_public_select" ON medical_documents FOR SELECT
  USING (is_published = TRUE);

-- ============================================================================
-- 3. medical_corpus — chunked content, FK to medical_documents
-- ============================================================================

CREATE TABLE medical_corpus (
  id BIGSERIAL PRIMARY KEY,
  document_id BIGINT NOT NULL REFERENCES medical_documents(id) ON DELETE CASCADE,
  -- Section heading the chunk falls under, e.g. "4.2 Treatment — uncomplicated".
  section TEXT,
  -- URL-safe slug for #anchor deep-linking from AI citations.
  section_anchor TEXT,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  -- text-embedding-3-small returns 1536-dim vectors.
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_medical_corpus_document
  ON medical_corpus(document_id, chunk_index);

CREATE INDEX idx_medical_corpus_anchor
  ON medical_corpus(document_id, section_anchor)
  WHERE section_anchor IS NOT NULL;

ALTER TABLE medical_corpus ENABLE ROW LEVEL SECURITY;

-- Public read-through joins to medical_documents.is_published.
DROP POLICY IF EXISTS "medical_corpus_public_select" ON medical_corpus;
CREATE POLICY "medical_corpus_public_select" ON medical_corpus FOR SELECT
  USING (
    document_id IN (
      SELECT id FROM medical_documents WHERE is_published = TRUE
    )
  );

-- ============================================================================
-- 4. Updated-at triggers
-- ============================================================================

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS medical_documents_updated_at ON medical_documents;
CREATE TRIGGER medical_documents_updated_at
  BEFORE UPDATE ON medical_documents
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================================================
-- 5. Comments
-- ============================================================================

COMMENT ON TABLE medical_documents IS
  'Public evidence library — Uganda HC III treatment guidelines, WHO IMCI, national protocols. The /library page on the Karibu site renders directly from this table; AI citations link back to the exact chunk via section_anchor.';
COMMENT ON COLUMN medical_documents.is_published IS
  'Gate before public visibility. New documents land unpublished; reviewer flips to true after editorial check.';
COMMENT ON COLUMN medical_documents.reviewers IS
  'Names of medical reviewers shown on the /library page for credibility. Must include at least one Uganda-licensed clinician before the document is published.';
