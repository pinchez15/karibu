-- Migration 039: Clinical notes — patient-first + lifecycle states (Phase 2)
--
-- Step 2 of docs/patient-centered-architecture-plan.md.
-- Makes provider_notes patient-first: patient_id required, visit_id optional.
-- Adds the note lifecycle (draft → signed → amended | voided) and a source
-- discriminator (visit / phone_call / follow_up / lab_update /
-- pharmacy_update / general) so notes can attach to phone calls, lab
-- follow-ups, and other non-encounter clinical activities.
--
-- Backward compat: every existing caller of rpc_upsert_provider_note keeps
-- working. The RPC gains optional p_patient_id (derived from visit when
-- absent) and optional p_source (defaults 'visit' when visit-tied,
-- 'general' otherwise). The Inngest AI review workflow keeps reading
-- provider_notes.transcript by visit_id (visit-tied notes only).
--
-- Column-name note: finalized_at / finalized_by stay as the canonical
-- "signed" timestamps — renaming them would churn every Android/web
-- caller. New columns amended_at/by, voided_at/by, void_reason cover the
-- new lifecycle states.
--
-- Pre-launch: no production rows. Demo seed rows in 012/014 (if any) get
-- their patient_id backfilled from the joined visit; status='finalized'
-- (if any) becomes 'signed'.

-- =============================================================================
-- 1. provider_notes.patient_id (the durable record link)
-- =============================================================================

ALTER TABLE provider_notes ADD COLUMN IF NOT EXISTS patient_id UUID
  REFERENCES patients(id) ON DELETE CASCADE;

-- Backfill from joined visit. Pre-launch this only affects demo data.
UPDATE provider_notes pn
  SET patient_id = v.patient_id
  FROM visits v
  WHERE pn.visit_id = v.id
    AND pn.patient_id IS NULL;

ALTER TABLE provider_notes ALTER COLUMN patient_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_provider_notes_patient_updated
  ON provider_notes(patient_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_notes_patient_status
  ON provider_notes(patient_id, status);

-- =============================================================================
-- 2. visit_id becomes optional, but stays unique-when-present
-- =============================================================================
-- The implicit UNIQUE that came from "visit_id UUID ... UNIQUE NOT NULL" in
-- 001_initial_schema.sql is dropped; a partial unique index replaces it so
-- the "one provider note per visit" invariant still holds for visit-tied
-- notes but standalone notes can coexist with arbitrary NULL visit_ids.

ALTER TABLE provider_notes ALTER COLUMN visit_id DROP NOT NULL;

ALTER TABLE provider_notes DROP CONSTRAINT IF EXISTS provider_notes_visit_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_notes_visit_unique
  ON provider_notes(visit_id) WHERE visit_id IS NOT NULL;

-- =============================================================================
-- 3. source — what kind of clinical activity produced this note
-- =============================================================================
-- Default 'visit' preserves the existing visit-tied semantics for legacy
-- callers. Standalone notes set source explicitly via the updated RPC.

ALTER TABLE provider_notes ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'visit'
  CHECK (source IN (
    'visit', 'phone_call', 'follow_up', 'lab_update', 'pharmacy_update', 'general'
  ));

-- =============================================================================
-- 4. status lifecycle: draft → signed → amended | voided
-- =============================================================================
-- Replaces the original 'draft' | 'finalized' check. 'finalized' rows (demo
-- data) migrate to 'signed'. finalized_at / finalized_by stay as the
-- canonical signed timestamps — renaming them would cascade across every
-- Android and web caller.

UPDATE provider_notes SET status = 'signed' WHERE status = 'finalized';

ALTER TABLE provider_notes DROP CONSTRAINT IF EXISTS provider_notes_status_check;
ALTER TABLE provider_notes ADD CONSTRAINT provider_notes_status_check
  CHECK (status IN ('draft', 'signed', 'amended', 'voided'));

-- Amendment and void lifecycle metadata.
ALTER TABLE provider_notes ADD COLUMN IF NOT EXISTS amended_at TIMESTAMPTZ;
ALTER TABLE provider_notes ADD COLUMN IF NOT EXISTS amended_by UUID REFERENCES staff(id);
ALTER TABLE provider_notes ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
ALTER TABLE provider_notes ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES staff(id);
ALTER TABLE provider_notes ADD COLUMN IF NOT EXISTS void_reason TEXT;

-- =============================================================================
-- 5. Updated rpc_upsert_provider_note (patient-first, source-aware)
-- =============================================================================
-- Drops the old 4-arg signature first to avoid Postgres overload ambiguity;
-- the new signature accepts the old positional args plus optional
-- p_patient_id and p_source. Existing queued sync ops carrying the old
-- payload keep working — new params just default to NULL → derived.
--
-- transcript preservation rule: never clobber an existing transcript with
-- NULL on re-sync (the 032 hardening lives on here).

DROP FUNCTION IF EXISTS rpc_upsert_provider_note(UUID, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION rpc_upsert_provider_note(
  p_id UUID,
  p_visit_id UUID,
  p_transcript TEXT,
  p_status TEXT DEFAULT 'draft',
  p_patient_id UUID DEFAULT NULL,
  p_source TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_caller_clinic UUID;
  v_visit_clinic UUID;
  v_role TEXT;
  v_patient_id UUID;
  v_source TEXT;
BEGIN
  v_caller_clinic := get_current_clinic_id();
  v_role := get_current_staff_role();
  IF v_role NOT IN ('admin','doctor','nurse','clinical_officer','midwife','nursing_assistant') THEN
    RAISE EXCEPTION 'Unauthorized role: %', v_role;
  END IF;

  -- Resolve patient_id. Either supplied directly (new patient-first path) or
  -- derived from the visit (legacy visit-first path). At least one of
  -- p_patient_id / p_visit_id must be present.
  --
  -- Auth note: v_caller_clinic is NULL for service-role callers. The `!= NULL`
  -- comparisons below evaluate to NULL (treated as false in IF), so service-
  -- role callers pass through — same pattern migration 022's get_clinic_queue
  -- and 029's original rpc_upsert_provider_note used. Web server actions
  -- verify clinic membership at the app layer before calling.
  IF p_patient_id IS NOT NULL THEN
    v_patient_id := p_patient_id;
    SELECT clinic_id INTO v_visit_clinic FROM patients WHERE id = v_patient_id;
    IF v_visit_clinic IS NULL OR v_visit_clinic != v_caller_clinic THEN
      RAISE EXCEPTION 'Unauthorized: patient/clinic mismatch';
    END IF;
    IF p_visit_id IS NOT NULL THEN
      SELECT clinic_id INTO v_visit_clinic FROM visits WHERE id = p_visit_id;
      IF v_visit_clinic IS NULL OR v_visit_clinic != v_caller_clinic THEN
        RAISE EXCEPTION 'Unauthorized: visit/clinic mismatch';
      END IF;
    END IF;
  ELSIF p_visit_id IS NOT NULL THEN
    SELECT clinic_id, patient_id INTO v_visit_clinic, v_patient_id FROM visits WHERE id = p_visit_id;
    IF v_visit_clinic IS NULL OR v_visit_clinic != v_caller_clinic THEN
      RAISE EXCEPTION 'Unauthorized: visit/clinic mismatch';
    END IF;
  ELSE
    RAISE EXCEPTION 'Either p_patient_id or p_visit_id is required';
  END IF;

  -- Source default: visit-tied → 'visit'; standalone → 'general'.
  v_source := COALESCE(p_source, CASE WHEN p_visit_id IS NOT NULL THEN 'visit' ELSE 'general' END);

  -- Conflict on id (the stable local UUID). Preserves prior transcript on
  -- a NULL incoming value (rule kept from migration 032).
  INSERT INTO provider_notes (id, patient_id, visit_id, transcript, status, source, updated_at)
  VALUES (p_id, v_patient_id, p_visit_id, p_transcript, p_status, v_source, now())
  ON CONFLICT (id) DO UPDATE
    SET patient_id = EXCLUDED.patient_id,
        visit_id = COALESCE(provider_notes.visit_id, EXCLUDED.visit_id),
        transcript = CASE
          WHEN EXCLUDED.transcript IS NOT NULL THEN EXCLUDED.transcript
          ELSE provider_notes.transcript
        END,
        status = EXCLUDED.status,
        source = COALESCE(EXCLUDED.source, provider_notes.source),
        updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_upsert_provider_note(UUID, UUID, TEXT, TEXT, UUID, TEXT) TO anon, authenticated;

-- =============================================================================
-- 6. Lifecycle transition RPCs
-- =============================================================================
-- All three transition RPCs route through clinic + role checks. Senior
-- clinicians (admin / doctor / clinical_officer / midwife) can sign and
-- amend. Voiding is restricted to admin / doctor / clinical_officer — a
-- midwife can amend her own notes but shouldn't withdraw a signed clinical
-- record without senior authorization.

CREATE OR REPLACE FUNCTION rpc_sign_provider_note(
  p_id UUID
) RETURNS VOID AS $$
DECLARE
  v_role TEXT;
  v_clinic UUID;
  v_staff_id UUID;
BEGIN
  v_clinic := get_current_clinic_id();
  v_role := get_current_staff_role();
  v_staff_id := get_current_staff_id();
  IF v_role NOT IN ('admin','doctor','clinical_officer','midwife') THEN
    RAISE EXCEPTION 'Only clinicians can sign notes; role: %', v_role;
  END IF;

  -- v_clinic is NULL for service-role; the OR-NULL clause lets them through
  -- (web server actions verify clinic scope at the app layer).
  UPDATE provider_notes
    SET status = 'signed',
        finalized_at = now(),
        finalized_by = v_staff_id,
        updated_at = now()
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

CREATE OR REPLACE FUNCTION rpc_amend_provider_note(
  p_id UUID,
  p_transcript TEXT
) RETURNS VOID AS $$
DECLARE
  v_role TEXT;
  v_clinic UUID;
  v_staff_id UUID;
  v_status TEXT;
BEGIN
  v_clinic := get_current_clinic_id();
  v_role := get_current_staff_role();
  v_staff_id := get_current_staff_id();
  IF v_role NOT IN ('admin','doctor','clinical_officer','midwife') THEN
    RAISE EXCEPTION 'Only clinicians can amend notes; role: %', v_role;
  END IF;

  -- v_clinic is NULL for service-role; the OR-NULL clause lets them through.
  SELECT status INTO v_status FROM provider_notes
    WHERE id = p_id
      AND patient_id IN (
        SELECT id FROM patients WHERE v_clinic IS NULL OR clinic_id = v_clinic
      );
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Note not found or not in caller clinic';
  END IF;
  IF v_status NOT IN ('signed', 'amended') THEN
    RAISE EXCEPTION 'Can only amend signed or already-amended notes; current status: %', v_status;
  END IF;

  UPDATE provider_notes
    SET transcript = p_transcript,
        status = 'amended',
        amended_at = now(),
        amended_by = v_staff_id,
        updated_at = now()
    WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_amend_provider_note(UUID, TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION rpc_void_provider_note(
  p_id UUID,
  p_reason TEXT
) RETURNS VOID AS $$
DECLARE
  v_role TEXT;
  v_clinic UUID;
  v_staff_id UUID;
BEGIN
  v_clinic := get_current_clinic_id();
  v_role := get_current_staff_role();
  v_staff_id := get_current_staff_id();
  IF v_role NOT IN ('admin','doctor','clinical_officer') THEN
    RAISE EXCEPTION 'Only senior clinicians can void notes; role: %', v_role;
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Void reason is required';
  END IF;

  -- v_clinic is NULL for service-role; the OR-NULL clause lets them through.
  UPDATE provider_notes
    SET status = 'voided',
        voided_at = now(),
        voided_by = v_staff_id,
        void_reason = p_reason,
        updated_at = now()
    WHERE id = p_id
      AND patient_id IN (
        SELECT id FROM patients WHERE v_clinic IS NULL OR clinic_id = v_clinic
      );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Note not found or not in caller clinic';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_void_provider_note(UUID, TEXT) TO anon, authenticated;
