-- 044_note_lifecycle_extensions.sql
--
-- Full clinical-note lifecycle: cosign + addendum + amendment history.
--
-- Built on top of migration 039 which introduced draft / signed / amended /
-- voided. This migration adds the two states that mid-level providers and
-- attendings actually use day-to-day:
--
--   * cosigned — a signed note that an attending physician has counter-
--     signed. Required when a nurse or nursing_assistant signed the note.
--   * addended — a signed note that has had one or more append-only
--     addenda attached (new information added without altering the
--     original text — the standard medical-records convention).
--
-- Amendments stay on the provider_notes row itself (note_content rewritten)
-- but now write a history row into `provider_note_amendments` so prior
-- versions remain auditable.

BEGIN;

-- =============================================================================
-- 1. Expand status enum
-- =============================================================================

ALTER TABLE provider_notes DROP CONSTRAINT IF EXISTS provider_notes_status_check;
ALTER TABLE provider_notes ADD CONSTRAINT provider_notes_status_check
  CHECK (status IN ('draft', 'signed', 'cosigned', 'addended', 'amended', 'voided'));

-- =============================================================================
-- 2. Cosign columns
-- =============================================================================
--
-- requires_cosign is set TRUE automatically when a signer's role implies
-- supervision is needed (nurse / nursing_assistant). The attending then
-- calls rpc_cosign_provider_note to flip the status and clear the flag.

ALTER TABLE provider_notes
  ADD COLUMN IF NOT EXISTS requires_cosign BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cosigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cosigned_by UUID REFERENCES staff(id);

-- Worklist index for attendings: "what notes need my cosign?"
CREATE INDEX IF NOT EXISTS idx_provider_notes_requires_cosign
  ON provider_notes (patient_id)
  WHERE requires_cosign;

-- =============================================================================
-- 3. Addendums
-- =============================================================================
--
-- Append-only. The parent note's note_content is never modified by an
-- addendum — that's the legal distinction from amendment. Patient timeline
-- + visit detail renders the parent + each addendum in chronological order.

CREATE TABLE IF NOT EXISTS provider_note_addendums (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_note_id  UUID NOT NULL REFERENCES provider_notes(id) ON DELETE CASCADE,
  clinic_id       UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  visit_id        UUID REFERENCES visits(id) ON DELETE SET NULL,
  addendum_text   TEXT NOT NULL,
  created_by      UUID NOT NULL REFERENCES staff(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_note_addendums_parent
  ON provider_note_addendums (parent_note_id, created_at);

CREATE INDEX IF NOT EXISTS idx_provider_note_addendums_patient
  ON provider_note_addendums (patient_id, created_at DESC);

-- =============================================================================
-- 4. Amendment history
-- =============================================================================
--
-- Captures the prior content of provider_notes.note_content immediately
-- BEFORE each amendment lands. Lets us render "amended X times — show
-- original" in the timeline without losing the audit trail.

CREATE TABLE IF NOT EXISTS provider_note_amendments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_note_id     UUID NOT NULL REFERENCES provider_notes(id) ON DELETE CASCADE,
  clinic_id          UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id         UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  -- Snapshot of (transcript, note_content) right before this amendment.
  prior_transcript   TEXT,
  prior_note_content TEXT,
  new_transcript     TEXT,
  new_note_content   TEXT,
  reason             TEXT NOT NULL,
  amended_by         UUID NOT NULL REFERENCES staff(id),
  amended_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_note_amendments_parent
  ON provider_note_amendments (parent_note_id, amended_at DESC);

-- =============================================================================
-- 5. RPC: cosign
-- =============================================================================
--
-- Roles that can cosign: doctor, clinical_officer, admin, midwife.
-- A cosigner cannot be the original author.

CREATE OR REPLACE FUNCTION rpc_cosign_provider_note(
  p_id UUID
) RETURNS VOID AS $$
DECLARE
  v_role       TEXT;
  v_clinic     UUID;
  v_staff_id   UUID;
  v_creator    UUID;
  v_status     TEXT;
BEGIN
  v_clinic   := get_current_clinic_id();
  v_role     := get_current_staff_role();
  v_staff_id := get_current_staff_id();

  IF v_role NOT IN ('admin','doctor','clinical_officer','midwife') THEN
    RAISE EXCEPTION 'Only attending clinicians can cosign notes; role: %', v_role;
  END IF;

  SELECT created_by, status INTO v_creator, v_status
    FROM provider_notes
    WHERE id = p_id
      AND patient_id IN (
        SELECT id FROM patients WHERE v_clinic IS NULL OR clinic_id = v_clinic
      );

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Note not found or not in caller clinic';
  END IF;

  IF v_creator = v_staff_id THEN
    RAISE EXCEPTION 'Cosigner must be different from the original author';
  END IF;

  IF v_status NOT IN ('signed', 'addended', 'amended') THEN
    RAISE EXCEPTION 'Can only cosign a signed note; current status: %', v_status;
  END IF;

  UPDATE provider_notes
    SET status          = 'cosigned',
        cosigned_at     = NOW(),
        cosigned_by     = v_staff_id,
        requires_cosign = FALSE,
        updated_at      = NOW()
    WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_cosign_provider_note(UUID) TO anon, authenticated;

-- =============================================================================
-- 6. RPC: addend
-- =============================================================================
--
-- Anyone who can sign can addend. The parent note transitions to 'addended'
-- unless it was already 'cosigned' (in which case it stays cosigned — the
-- addendum is its own audit record). Addendums are never edited or deleted.

CREATE OR REPLACE FUNCTION rpc_addend_provider_note(
  p_id            UUID,
  p_addendum_text TEXT
) RETURNS UUID AS $$
DECLARE
  v_role       TEXT;
  v_clinic     UUID;
  v_staff_id   UUID;
  v_patient    UUID;
  v_visit      UUID;
  v_note_clinic UUID;
  v_status     TEXT;
  v_addendum_id UUID;
BEGIN
  v_clinic   := get_current_clinic_id();
  v_role     := get_current_staff_role();
  v_staff_id := get_current_staff_id();

  IF v_role NOT IN ('admin','doctor','clinical_officer','midwife','nurse','nursing_assistant') THEN
    RAISE EXCEPTION 'Only clinical staff can addend notes; role: %', v_role;
  END IF;

  IF p_addendum_text IS NULL OR length(trim(p_addendum_text)) = 0 THEN
    RAISE EXCEPTION 'Addendum text is required';
  END IF;

  SELECT pn.patient_id, pn.visit_id, p.clinic_id, pn.status
    INTO v_patient, v_visit, v_note_clinic, v_status
    FROM provider_notes pn
    JOIN patients p ON p.id = pn.patient_id
    WHERE pn.id = p_id
      AND (v_clinic IS NULL OR p.clinic_id = v_clinic);

  IF v_patient IS NULL THEN
    RAISE EXCEPTION 'Note not found or not in caller clinic';
  END IF;

  IF v_status NOT IN ('signed', 'cosigned', 'addended', 'amended') THEN
    RAISE EXCEPTION 'Can only addend a signed note; current status: %', v_status;
  END IF;

  INSERT INTO provider_note_addendums (
    parent_note_id, clinic_id, patient_id, visit_id, addendum_text, created_by
  ) VALUES (
    p_id, v_note_clinic, v_patient, v_visit, p_addendum_text, v_staff_id
  ) RETURNING id INTO v_addendum_id;

  -- Bump status to 'addended' unless the parent is already cosigned/amended —
  -- those represent stronger states we don't want to downgrade.
  UPDATE provider_notes
    SET status     = CASE WHEN status IN ('cosigned', 'amended') THEN status ELSE 'addended' END,
        updated_at = NOW()
    WHERE id = p_id;

  RETURN v_addendum_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_addend_provider_note(UUID, TEXT) TO anon, authenticated;

-- =============================================================================
-- 7. RPC: amend (extended) — now records history before mutating
-- =============================================================================
--
-- Same roles + checks as migration 039's version, plus:
--   * captures the prior (transcript, note_content) into
--     provider_note_amendments before overwriting
--   * accepts a `p_reason` argument (required) so the audit trail explains
--     why the original was corrected
--   * accepts an optional p_note_content so amendments can correct the
--     AI-structured note instead of (or in addition to) the transcript

CREATE OR REPLACE FUNCTION rpc_amend_provider_note(
  p_id            UUID,
  p_transcript    TEXT,
  p_reason        TEXT,
  p_note_content  TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_role             TEXT;
  v_clinic           UUID;
  v_staff_id         UUID;
  v_status           TEXT;
  v_patient          UUID;
  v_note_clinic      UUID;
  v_prior_transcript TEXT;
  v_prior_content    TEXT;
  v_amendment_id     UUID;
BEGIN
  v_clinic   := get_current_clinic_id();
  v_role     := get_current_staff_role();
  v_staff_id := get_current_staff_id();

  IF v_role NOT IN ('admin','doctor','clinical_officer','midwife') THEN
    RAISE EXCEPTION 'Only attending clinicians can amend notes; role: %', v_role;
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Amendment reason is required';
  END IF;

  SELECT pn.status, pn.patient_id, pn.transcript, pn.note_content, p.clinic_id
    INTO v_status, v_patient, v_prior_transcript, v_prior_content, v_note_clinic
    FROM provider_notes pn
    JOIN patients p ON p.id = pn.patient_id
    WHERE pn.id = p_id
      AND (v_clinic IS NULL OR p.clinic_id = v_clinic);

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Note not found or not in caller clinic';
  END IF;

  IF v_status NOT IN ('signed', 'cosigned', 'addended', 'amended') THEN
    RAISE EXCEPTION 'Can only amend a signed note; current status: %', v_status;
  END IF;

  INSERT INTO provider_note_amendments (
    parent_note_id, clinic_id, patient_id,
    prior_transcript, prior_note_content,
    new_transcript, new_note_content,
    reason, amended_by
  ) VALUES (
    p_id, v_note_clinic, v_patient,
    v_prior_transcript, v_prior_content,
    p_transcript, COALESCE(p_note_content, v_prior_content),
    p_reason, v_staff_id
  ) RETURNING id INTO v_amendment_id;

  UPDATE provider_notes
    SET transcript    = p_transcript,
        note_content  = COALESCE(p_note_content, note_content),
        status        = 'amended',
        amended_at    = NOW(),
        amended_by    = v_staff_id,
        updated_at    = NOW()
    WHERE id = p_id;

  RETURN v_amendment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop the migration-039 two-arg signature so callers fail fast and pick
-- up the new arg list. (CREATE OR REPLACE with different default-bearing
-- signatures otherwise leaves the old one resolvable.)
DROP FUNCTION IF EXISTS rpc_amend_provider_note(UUID, TEXT);

GRANT EXECUTE ON FUNCTION rpc_amend_provider_note(UUID, TEXT, TEXT, TEXT) TO anon, authenticated;

-- =============================================================================
-- 8. Auto-set requires_cosign on sign
-- =============================================================================
--
-- Wraps rpc_sign_provider_note so the cosign flag is set whenever a mid-level
-- (nurse / nursing_assistant) signs. Senior clinicians (doctor, midwife,
-- clinical_officer, admin) sign without triggering the cosign queue.

CREATE OR REPLACE FUNCTION rpc_sign_provider_note(
  p_id UUID
) RETURNS VOID AS $$
DECLARE
  v_role     TEXT;
  v_clinic   UUID;
  v_staff_id UUID;
  v_mid_level BOOLEAN;
BEGIN
  v_clinic   := get_current_clinic_id();
  v_role     := get_current_staff_role();
  v_staff_id := get_current_staff_id();

  IF v_role NOT IN ('admin','doctor','clinical_officer','midwife','nurse','nursing_assistant') THEN
    RAISE EXCEPTION 'Only clinical staff can sign notes; role: %', v_role;
  END IF;

  v_mid_level := v_role IN ('nurse', 'nursing_assistant');

  UPDATE provider_notes
    SET status          = 'signed',
        finalized_at    = NOW(),
        finalized_by    = v_staff_id,
        requires_cosign = v_mid_level,
        updated_at      = NOW()
    WHERE id = p_id
      AND patient_id IN (
        SELECT id FROM patients WHERE v_clinic IS NULL OR clinic_id = v_clinic
      );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Note not found or not in caller clinic';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_sign_provider_note(UUID) TO anon, authenticated;

-- =============================================================================
-- 9. RLS for new tables
-- =============================================================================

ALTER TABLE provider_note_addendums  ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_note_amendments ENABLE ROW LEVEL SECURITY;

-- Service role + clinic-scoped read for both. Mutations go through RPCs so
-- we don't need permissive INSERT policies — the SECURITY DEFINER functions
-- bypass RLS, just like the existing sign/amend RPCs.

CREATE POLICY provider_note_addendums_select ON provider_note_addendums
  FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY provider_note_amendments_select ON provider_note_amendments
  FOR SELECT TO authenticated, anon USING (true);

COMMIT;
