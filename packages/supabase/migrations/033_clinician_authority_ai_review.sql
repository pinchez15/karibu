-- Migration 033: clinician authority — AI as reviewer, not author
-- ============================================================================
-- Purpose: walk back the AI-as-augmentation model (migration 032) in favour
-- of one that places the clinician squarely as the medical authority.
--
-- New AI roles, in order of presence on a typical visit:
--   1. Stream the clinician's dictation as Whisper transcribes it (no change
--      to data model — just real-time chunks instead of one final blob).
--   2. Draft the very short patient-facing receipt summary (kept from 032).
--   3. Suggest a HMIS 105 diagnosis code from the free-text note (kept;
--      clinician confirms via existing DiagnosisCoder UI).
--   4. Review the clinician's vitals + note + plan against Uganda HC III
--      treatment guidelines + clinic capabilities, and ASK A QUESTION if
--      it would disagree. Question-based, evidence-cited, rare. Never
--      restructures the note.
--
-- What this migration adds:
--   1. medical_corpus + pgvector — Uganda MoH / WHO / IMCI guideline chunks
--      for retrieval-grounded AI review. Every AI suggestion must cite a
--      real chunk_id; a model-side hallucinated study fails validation.
--   2. clinic_lab_capabilities + clinic_pharmacy_formulary — per-clinic
--      menus the AI prompt is constrained against. Seeded with the HC III
--      standard menu for every existing clinic; admin can override per-
--      clinic later.
--   3. ai_review_suggestions — audit log of every disagreement question
--      AI raised + the clinician's response. Drives the AI-quality admin
--      report and the per-clinic suggestion-acceptance signal.
--   4. visits.ai_review_status — separate from ai_structure_status (which
--      is now legacy and will be dropped in a follow-up after the launch).
--
-- What this migration does NOT change:
--   - patient_notes (source='clinician_fallback' | 'ai_generated') and the
--     composite (visit_id, source) unique. The AI receipt summary still
--     writes ai_generated; the SOAP step is gone.
--   - HMIS coding tables (visit_diagnosis_codes). The downstream HMIS 105
--     report SQL is updated separately to count only ('manual',
--     'ai_confirmed') sources.
--   - visits.status flow. AI never gates clinical workflow.
-- ============================================================================

-- ============================================================================
-- 1. pgvector — required for medical_corpus retrieval
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- 2. medical_corpus — chunked Uganda guidelines + WHO/IMCI references
-- ============================================================================

CREATE TABLE IF NOT EXISTS medical_corpus (
  id BIGSERIAL PRIMARY KEY,
  doc_title TEXT NOT NULL,
  doc_version TEXT,
  section TEXT,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  source_url TEXT,
  jurisdiction TEXT NOT NULL DEFAULT 'uganda',
  -- text-embedding-3-small returns 1536-dim vectors. Switch to a different
  -- model later by adding a separate column; don't migrate this one in
  -- place because re-embedding the whole corpus is expensive.
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_medical_corpus_jurisdiction
  ON medical_corpus(jurisdiction);

-- IVFFlat index for cosine similarity. Lists=100 is a reasonable default
-- for a corpus in the low thousands; tune up to 1000 once we have >100k
-- chunks. Build the index AFTER initial seed so list assignments are good.
-- (We'll add the index in the seed script, not here, to avoid building it
-- on an empty table.)

ALTER TABLE medical_corpus ENABLE ROW LEVEL SECURITY;

-- Reads are public-ish — every clinician at every clinic uses the same
-- corpus. Service-role-only writes (the embed pipeline runs as service).
DROP POLICY IF EXISTS "medical_corpus_select" ON medical_corpus;
CREATE POLICY "medical_corpus_select" ON medical_corpus FOR SELECT
  USING (true);

-- ============================================================================
-- 3. clinic_lab_capabilities — per-clinic lab menu
-- ============================================================================

CREATE TABLE IF NOT EXISTS clinic_lab_capabilities (
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  test_name TEXT NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  last_updated_by UUID REFERENCES staff(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (clinic_id, test_name)
);

CREATE INDEX IF NOT EXISTS idx_clinic_lab_capabilities_available
  ON clinic_lab_capabilities(clinic_id) WHERE is_available = TRUE;

ALTER TABLE clinic_lab_capabilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_lab_capabilities_select" ON clinic_lab_capabilities;
CREATE POLICY "clinic_lab_capabilities_select" ON clinic_lab_capabilities FOR SELECT
  USING (clinic_id = get_current_clinic_id());

-- ============================================================================
-- 4. clinic_pharmacy_formulary — per-clinic essential medicines list
-- ============================================================================

CREATE TABLE IF NOT EXISTS clinic_pharmacy_formulary (
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  drug_name TEXT NOT NULL,
  in_stock BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  last_updated_by UUID REFERENCES staff(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (clinic_id, drug_name)
);

CREATE INDEX IF NOT EXISTS idx_clinic_pharmacy_in_stock
  ON clinic_pharmacy_formulary(clinic_id) WHERE in_stock = TRUE;

ALTER TABLE clinic_pharmacy_formulary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_pharmacy_formulary_select" ON clinic_pharmacy_formulary;
CREATE POLICY "clinic_pharmacy_formulary_select" ON clinic_pharmacy_formulary FOR SELECT
  USING (clinic_id = get_current_clinic_id());

-- ============================================================================
-- 5. Seed HC III standard lab + pharmacy menus for every existing clinic
-- ============================================================================
--
-- Source: Uganda MoH HC III Service Standards. Conservative defaults that
-- reflect what a typical HC III is supposed to offer. Admin can override
-- per-clinic via a settings page (post-launch).

INSERT INTO clinic_lab_capabilities (clinic_id, test_name, is_available)
SELECT c.id, lab.test_name, TRUE
FROM clinics c
CROSS JOIN (VALUES
  ('Malaria RDT'),
  ('Blood slide microscopy (malaria)'),
  ('HIV rapid test'),
  ('Hepatitis B test'),
  ('Syphilis (RPR) test'),
  ('Urinalysis (urine dipstick)'),
  ('Urine pregnancy test'),
  ('Hemoglobin estimation'),
  ('Stool microscopy'),
  ('Blood glucose')
) AS lab(test_name)
ON CONFLICT (clinic_id, test_name) DO NOTHING;

-- HC III essential medicines list — conservative seed of the most-used
-- drugs. Per-clinic stock state is what changes day-to-day; in_stock=TRUE
-- means "this clinic stocks this drug" not "currently has supply" (the
-- pharmacy MVP from migration 031 tracks dispensing per visit).
INSERT INTO clinic_pharmacy_formulary (clinic_id, drug_name, in_stock)
SELECT c.id, drug.name, TRUE
FROM clinics c
CROSS JOIN (VALUES
  ('Artemether/Lumefantrine (AL)'),
  ('Artesunate injection'),
  ('Amoxicillin'),
  ('Amoxicillin/Clavulanic acid'),
  ('Cotrimoxazole'),
  ('Erythromycin'),
  ('Metronidazole'),
  ('Ciprofloxacin'),
  ('Paracetamol'),
  ('Ibuprofen'),
  ('ORS (oral rehydration salts)'),
  ('Zinc sulfate'),
  ('Iron + folic acid'),
  ('Mebendazole'),
  ('Albendazole'),
  ('Promethazine'),
  ('Hydrochlorothiazide'),
  ('Nifedipine'),
  ('Methyldopa'),
  ('Salbutamol inhaler'),
  ('Tetanus toxoid (TT)'),
  ('Vitamin A'),
  ('Magnesium sulfate (severe pre-eclampsia)'),
  ('Oxytocin')
) AS drug(name)
ON CONFLICT (clinic_id, drug_name) DO NOTHING;

-- ============================================================================
-- 6. ai_review_suggestions — audit + quality signal
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_review_suggestions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  -- 'ask_lab' | 'ask_dx' | 'ask_med' | 'ask_history' | 'ask_red_flag'
  suggestion_type TEXT NOT NULL,
  question TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  -- IDs in medical_corpus that were retrieved + cited. AI prompt requires
  -- citation_ids to be a subset of the retrieved chunks; otherwise we
  -- discard the suggestion as a hallucination.
  citation_ids BIGINT[] NOT NULL DEFAULT '{}',
  confidence TEXT NOT NULL CHECK (confidence IN ('high','medium','low')),
  -- Clinician response. Null until the banner is dismissed or the note
  -- is reopened; logged as quality signal.
  clinician_response TEXT CHECK (
    clinician_response IS NULL OR
    clinician_response IN ('considered_proceeded','reopened_note','dismissed')
  ),
  responded_at TIMESTAMPTZ,
  responded_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_review_suggestions_visit
  ON ai_review_suggestions(visit_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_review_suggestions_clinic_unanswered
  ON ai_review_suggestions(clinic_id, created_at DESC)
  WHERE clinician_response IS NULL;

ALTER TABLE ai_review_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_review_suggestions_select" ON ai_review_suggestions;
CREATE POLICY "ai_review_suggestions_select" ON ai_review_suggestions FOR SELECT
  USING (clinic_id = get_current_clinic_id());

-- ============================================================================
-- 7. visits.ai_review_status — lifecycle, distinct from ai_structure_status
-- ============================================================================
--
-- We deliberately don't drop ai_structure_status yet. The Inngest pipeline
-- transitions to using ai_review_status, but old visits keep their
-- structure status for any historical reads. A follow-up migration after
-- the launch can drop the legacy columns once we're confident the new
-- flow is stable.

ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS ai_review_status TEXT NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS ai_review_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_review_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_review_no_concerns BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ai_review_error TEXT,
  ADD COLUMN IF NOT EXISTS ai_review_attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE visits DROP CONSTRAINT IF EXISTS visits_ai_review_status_check;
ALTER TABLE visits ADD CONSTRAINT visits_ai_review_status_check CHECK (
  ai_review_status IN ('not_started','pending','running','completed','failed','skipped')
);

CREATE INDEX IF NOT EXISTS idx_visits_ai_review_queue
  ON visits (clinic_id, documentation_completed_at ASC)
  WHERE documentation_complete = TRUE
    AND ai_review_status IN ('not_started','pending')
    AND ai_review_attempts < 5;

-- ============================================================================
-- 8. RPC for clinician banner response
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_record_review_response(
  p_suggestion_id UUID,
  p_response TEXT
) RETURNS VOID AS $$
DECLARE
  v_clinic UUID;
  v_role TEXT;
BEGIN
  SELECT clinic_id INTO v_clinic FROM ai_review_suggestions WHERE id = p_suggestion_id;
  IF v_clinic IS NULL OR v_clinic != get_current_clinic_id() THEN
    RAISE EXCEPTION 'Unauthorized: suggestion/clinic mismatch';
  END IF;

  v_role := get_current_staff_role();
  IF v_role NOT IN ('admin','doctor','nurse','clinical_officer','midwife','nursing_assistant') THEN
    RAISE EXCEPTION 'Unauthorized role: %', v_role;
  END IF;

  IF p_response NOT IN ('considered_proceeded','reopened_note','dismissed') THEN
    RAISE EXCEPTION 'Invalid response: %', p_response;
  END IF;

  UPDATE ai_review_suggestions
  SET clinician_response = p_response,
      responded_at = NOW(),
      responded_by = (SELECT id FROM staff WHERE clerk_user_id = auth.jwt()->>'sub' LIMIT 1)
  WHERE id = p_suggestion_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_record_review_response(UUID, TEXT) TO anon, authenticated;

-- ============================================================================
-- 9. Comments
-- ============================================================================

COMMENT ON TABLE medical_corpus IS
  'Chunked Uganda HC III treatment guidelines, WHO IMCI, and national protocols. Queried via cosine similarity for AI review grounding. Every AI suggestion citation must reference a real id here.';
COMMENT ON TABLE ai_review_suggestions IS
  'Audit log of every AI disagreement question + clinician response. Drives the AI-quality admin report. The clinician is always the authority — these are questions, not verdicts.';
COMMENT ON COLUMN visits.ai_review_no_concerns IS
  'Set by reviewClinicianNote when AI ran successfully and produced zero high-confidence disagreements. UI uses this to differentiate "AI checked, all clear" from "AI never ran".';
