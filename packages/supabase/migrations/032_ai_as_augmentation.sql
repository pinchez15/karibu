-- Migration 032: AI as augmentation, not gating
-- ============================================================================
-- Purpose: reposition AI structuring as an automatic, parallel augmentation
-- to the clinician's note rather than a manual opt-in that overwrites it.
-- Lays the groundwork for the upskilling vision — every visit at every clinic
-- gets touched by an LLM, especially valuable at HC III where no doctor is
-- present to lift the standard of care.
--
-- Three structural changes:
--   1. patient_notes can have two rows per visit (clinician + AI). The unique
--      constraint moves from (visit_id) to (visit_id, source). The clinician's
--      row is the receipt-of-record; the AI row is reference / suggestion.
--   2. visits gains ai_structure_status and timestamps, independent of the
--      clinical workflow `status` enum. AI never moves a visit through the
--      status flow.
--   3. rpc_upsert_patient_note_summary is hardened to only ever write
--      source='clinician_fallback' and never touch an AI row.
--
-- The Inngest pipeline (apps/web/src/inngest/functions/structure-dictation.ts)
-- is updated in the companion code change to:
--   - write the clinician's row alongside an AI row (no overwriting)
--   - set ai_structure_status instead of visits.status
--   - skip the visits.status='review' transition entirely
--
-- The Inngest scheduled poller (apps/web/src/inngest/functions/poll-ai-queue.ts)
-- is added in the same code change and runs every 30s, finding rows ready for
-- AI structuring (documentation_complete=true AND ai_structure_status='not_started')
-- and firing 'note.dictated' for each.
--
-- Backfill semantics:
--   - Visits whose provider_notes already have note_content (AI ran in the
--     legacy flow) → ai_structure_status='completed' so the new poller skips
--     them.
--   - Visits with documentation_complete=true but no note_content yet →
--     ai_structure_status='not_started' so the poller picks them up on first
--     run. Includes every typed/keyboard-mic'd note that the legacy flow
--     never structured.
-- ============================================================================

-- ============================================================================
-- 1. patient_notes: two rows per visit (clinician + AI)
-- ============================================================================

-- The implicit UNIQUE NOT NULL on visit_id from migration 001 is named after
-- the column. Drop by name (with IF EXISTS so re-runs are safe).
ALTER TABLE patient_notes
  DROP CONSTRAINT IF EXISTS patient_notes_visit_id_key;

-- Replace with composite unique on (visit_id, source). source was added in
-- migration 029 with values 'clinician_fallback' | 'ai_generated'.
ALTER TABLE patient_notes
  ADD CONSTRAINT patient_notes_visit_id_source_key UNIQUE (visit_id, source);

CREATE INDEX IF NOT EXISTS idx_patient_notes_visit_source
  ON patient_notes(visit_id, source);

-- ============================================================================
-- 2. visits: AI status independent of clinical status
-- ============================================================================

ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS ai_structure_status TEXT NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS ai_structure_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_structure_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_structure_error TEXT,
  ADD COLUMN IF NOT EXISTS ai_structure_attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE visits DROP CONSTRAINT IF EXISTS visits_ai_structure_status_check;
ALTER TABLE visits ADD CONSTRAINT visits_ai_structure_status_check CHECK (
  ai_structure_status IN ('not_started', 'pending', 'running', 'completed', 'failed', 'skipped')
);

-- Backfill: visits whose provider_notes already have note_content are
-- already-structured under the legacy flow. Mark completed so the new
-- poller doesn't re-bill them.
UPDATE visits v
SET ai_structure_status = 'completed',
    ai_structure_completed_at = COALESCE(v.finalized_at, v.updated_at)
FROM provider_notes pn
WHERE pn.visit_id = v.id
  AND pn.note_content IS NOT NULL
  AND TRIM(pn.note_content) != ''
  AND v.ai_structure_status = 'not_started';

-- ============================================================================
-- 3. Index for the Inngest poller's scan
-- ============================================================================

-- Partial index sized to the work-to-do set: small, hot, ordered by oldest
-- first so we age-out quickly during catch-up runs.
CREATE INDEX IF NOT EXISTS idx_visits_ai_structure_queue
  ON visits (clinic_id, documentation_completed_at ASC)
  WHERE documentation_complete = TRUE
    AND ai_structure_status IN ('not_started', 'pending')
    AND ai_structure_attempts < 5;

-- ============================================================================
-- 4. rpc_upsert_patient_note_summary: enforce source='clinician_fallback'
-- ============================================================================
--
-- Two changes from migration 029's version:
--   (a) Always writes source='clinician_fallback' regardless of the input
--       (no parameter; the clinician's words are always clinician-sourced).
--   (b) The (visit_id, source) unique now scopes the upsert — there's no
--       longer any chance of overwriting an AI row, even if the WHERE clause
--       is removed in a future change. The DB enforces it.
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_upsert_patient_note_summary(
  p_id UUID,
  p_visit_id UUID,
  p_content TEXT
) RETURNS VOID AS $$
DECLARE
  v_visit_clinic UUID;
  v_role TEXT;
BEGIN
  SELECT clinic_id INTO v_visit_clinic FROM visits WHERE id = p_visit_id;
  IF v_visit_clinic IS NULL OR v_visit_clinic != get_current_clinic_id() THEN
    RAISE EXCEPTION 'Unauthorized: visit/clinic mismatch';
  END IF;

  v_role := get_current_staff_role();
  IF v_role NOT IN ('admin','doctor','nurse','clinical_officer','midwife','nursing_assistant') THEN
    RAISE EXCEPTION 'Unauthorized role: %', v_role;
  END IF;

  -- (visit_id, source) is the conflict target. The clinician fallback row is
  -- created or updated; the AI row (if it exists) is untouched.
  INSERT INTO patient_notes (id, visit_id, content, language, source, status, created_at, updated_at)
  VALUES (p_id, p_visit_id, p_content, 'en', 'clinician_fallback', 'draft', NOW(), NOW())
  ON CONFLICT (visit_id, source) DO UPDATE
    SET content = EXCLUDED.content,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_upsert_patient_note_summary(UUID, UUID, TEXT)
  TO anon, authenticated;

-- ============================================================================
-- 5. Harden rpc_upsert_provider_note against null-transcript clobbering
-- ============================================================================
--
-- Reproduces the function from migration 029 with one change: on conflict,
-- transcript is preserved if the incoming payload is null/empty. Stops the
-- "AI ran but Inngest sees no transcript" race we hit when a sync queue item
-- lands AFTER a successful submit-dictation.

CREATE OR REPLACE FUNCTION rpc_upsert_provider_note(
  p_id UUID,
  p_visit_id UUID,
  p_transcript TEXT,
  p_status TEXT DEFAULT 'draft'
) RETURNS VOID AS $$
DECLARE
  v_visit_clinic UUID;
  v_role TEXT;
BEGIN
  SELECT clinic_id INTO v_visit_clinic FROM visits WHERE id = p_visit_id;
  IF v_visit_clinic IS NULL OR v_visit_clinic != get_current_clinic_id() THEN
    RAISE EXCEPTION 'Unauthorized: visit/clinic mismatch';
  END IF;

  v_role := get_current_staff_role();
  IF v_role NOT IN ('admin','doctor','nurse','clinical_officer','midwife','nursing_assistant') THEN
    RAISE EXCEPTION 'Unauthorized role: %', v_role;
  END IF;

  INSERT INTO provider_notes (id, visit_id, transcript, status, updated_at)
  VALUES (p_id, p_visit_id, p_transcript, p_status, NOW())
  ON CONFLICT (visit_id) DO UPDATE
    SET transcript = COALESCE(NULLIF(TRIM(EXCLUDED.transcript), ''), provider_notes.transcript),
        status = EXCLUDED.status,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_upsert_provider_note(UUID, UUID, TEXT, TEXT)
  TO anon, authenticated;

-- ============================================================================
-- 6. rpc_mark_documentation_complete: keep status flow simple
-- ============================================================================
--
-- The previous version moved status pending -> sent atomically. Keep that.
-- The new poller sees documentation_complete=true and fires the Inngest event
-- regardless of visit.status, so the clinical workflow doesn't wait for AI.

CREATE OR REPLACE FUNCTION rpc_mark_documentation_complete(p_visit_id UUID)
  RETURNS VOID AS $$
DECLARE
  v_visit_clinic UUID;
  v_role TEXT;
  v_status TEXT;
BEGIN
  SELECT clinic_id, status INTO v_visit_clinic, v_status
  FROM visits WHERE id = p_visit_id;
  IF v_visit_clinic IS NULL OR v_visit_clinic != get_current_clinic_id() THEN
    RAISE EXCEPTION 'Unauthorized: visit/clinic mismatch';
  END IF;

  v_role := get_current_staff_role();
  IF v_role NOT IN ('admin','doctor','nurse','clinical_officer','midwife','nursing_assistant') THEN
    RAISE EXCEPTION 'Unauthorized role: %', v_role;
  END IF;

  -- Atomic flip: documentation_complete=true; if status='pending' nudge it
  -- to 'sent' so the cashier can take payment without waiting for AI.
  UPDATE visits
  SET documentation_complete = TRUE,
      documentation_completed_at = COALESCE(documentation_completed_at, NOW()),
      status = CASE WHEN status = 'pending' THEN 'sent' ELSE status END,
      updated_at = NOW()
  WHERE id = p_visit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_mark_documentation_complete(UUID)
  TO anon, authenticated;

-- ============================================================================
-- 7. Comments
-- ============================================================================

COMMENT ON COLUMN visits.ai_structure_status IS
  'AI structuring lifecycle, independent of clinical visit.status. Driven by the Inngest poller. Values: not_started | pending | running | completed | failed | skipped.';
COMMENT ON COLUMN visits.ai_structure_attempts IS
  'Retry counter incremented by the Inngest function on each run. Poller skips visits at >= 5.';
