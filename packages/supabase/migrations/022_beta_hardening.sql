-- Migration 022: Beta-readiness hardening
--
-- Closes three pre-beta blockers:
--
--   B1. Restore the staff-authorization check that get_clinic_queue() lost in
--       migration 019 when its signature was simplified to drop p_staff_id.
--       Without this check, any authenticated user can read any clinic's queue.
--
--   B2. Enforce NOT NULL on staff.clinic_id. The original schema in 001 left it
--       nullable; a NULL clinic_id silently widens RLS via get_current_clinic_id()
--       returning NULL.
--
--   B3. Auto-maintain visits.consent_verified from the patient_consents table.
--       The transcribe edge function already gates on this flag, but nothing in
--       web or Android ever set it to true (only the deprecated Expo app did),
--       so the entire pipeline currently rejects with "Consent not verified".
--       This migration adds a trigger that flips the flag the moment all four
--       required DPPA consents exist for a visit. Also adds a defense-in-depth
--       BEFORE INSERT trigger on provider_notes so AI output cannot be persisted
--       without consent on file.

-- =============================================================================
-- B2: staff.clinic_id NOT NULL
-- =============================================================================
-- Validate first; surface bad data instead of failing the migration cryptically.
DO $$
DECLARE
  v_orphan_count INT;
BEGIN
  SELECT COUNT(*) INTO v_orphan_count FROM staff WHERE clinic_id IS NULL;
  IF v_orphan_count > 0 THEN
    RAISE EXCEPTION 'Cannot enforce staff.clinic_id NOT NULL: % staff rows have NULL clinic_id. Backfill or delete those rows first.', v_orphan_count;
  END IF;
END $$;

ALTER TABLE staff ALTER COLUMN clinic_id SET NOT NULL;

-- =============================================================================
-- B1: get_clinic_queue authorization check
-- =============================================================================
-- Restores the equivalent of the p_staff_id check that 010 had. Uses
-- auth.jwt()->>'sub' so callers don't have to pass their staff id separately.
-- Service-role callers (which run as 'service_role' with no JWT subject) are
-- allowed through unchanged for server-to-server use.
CREATE OR REPLACE FUNCTION get_clinic_queue(p_clinic_id UUID)
RETURNS TABLE (
  visit_id UUID,
  patient_id UUID,
  patient_name TEXT,
  patient_phone TEXT,
  queue_position INTEGER,
  queue_status TEXT,
  priority TEXT,
  chief_complaint TEXT,
  checked_in_at TIMESTAMPTZ,
  nurse_id UUID,
  nurse_name TEXT,
  doctor_id UUID,
  doctor_name TEXT,
  wait_minutes INTEGER
) AS $$
DECLARE
  v_clerk_user_id TEXT;
BEGIN
  v_clerk_user_id := auth.jwt()->>'sub';

  -- Service-role callers have no JWT subject; trust them.
  -- All other callers must be active staff at the requested clinic.
  IF v_clerk_user_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM staff
      WHERE clinic_id = p_clinic_id
        AND clerk_user_id = v_clerk_user_id
        AND is_active = TRUE
    ) THEN
      RAISE EXCEPTION 'Staff not authorized for this clinic';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    v.id AS visit_id,
    v.patient_id,
    trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS patient_name,
    COALESCE(p.whatsapp_number, '') AS patient_phone,
    v.queue_position,
    v.queue_status::TEXT,
    v.priority::TEXT,
    v.chief_complaint,
    v.checked_in_at,
    v.nurse_id,
    n.display_name AS nurse_name,
    v.doctor_id,
    d.display_name AS doctor_name,
    EXTRACT(EPOCH FROM (NOW() - v.checked_in_at))::INTEGER / 60 AS wait_minutes
  FROM visits v
  JOIN patients p ON p.id = v.patient_id
  LEFT JOIN staff n ON n.id = v.nurse_id
  LEFT JOIN staff d ON d.id = v.doctor_id
  WHERE v.clinic_id = p_clinic_id
    AND v.visit_date = CURRENT_DATE
    AND v.queue_status != 'cancelled'
  ORDER BY
    CASE v.priority
      WHEN 'urgent' THEN 0
      WHEN 'high' THEN 1
      WHEN 'normal' THEN 2
      WHEN 'low' THEN 3
    END,
    v.queue_position ASC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- B3: Auto-maintain visits.consent_verified + defense-in-depth on provider_notes
-- =============================================================================
-- Trigger function: recompute consent_verified for the affected visit.
-- Runs after any insert/update/delete on patient_consents that has a visit_id.
CREATE OR REPLACE FUNCTION sync_visit_consent_verified()
RETURNS TRIGGER AS $$
DECLARE
  v_visit_id UUID;
  v_patient_id UUID;
  v_verified BOOLEAN;
BEGIN
  -- Determine which visit was affected. On UPDATE/INSERT use NEW; on DELETE use OLD.
  IF TG_OP = 'DELETE' THEN
    v_visit_id := OLD.visit_id;
    v_patient_id := OLD.patient_id;
  ELSE
    v_visit_id := NEW.visit_id;
    v_patient_id := NEW.patient_id;
  END IF;

  -- Patient-level consents (no visit_id) don't gate any visit.
  IF v_visit_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_verified := check_patient_consent(v_patient_id, v_visit_id);

  UPDATE visits
  SET consent_verified = v_verified
  WHERE id = v_visit_id
    AND consent_verified IS DISTINCT FROM v_verified;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS sync_visit_consent_verified_trigger ON patient_consents;
CREATE TRIGGER sync_visit_consent_verified_trigger
  AFTER INSERT OR UPDATE OR DELETE ON patient_consents
  FOR EACH ROW
  EXECUTE FUNCTION sync_visit_consent_verified();

-- Backfill: recompute the flag for every existing visit so legacy rows reflect
-- their current consent state (rather than the original FALSE default).
UPDATE visits v
SET consent_verified = check_patient_consent(v.patient_id, v.id)
WHERE v.id IN (
  SELECT DISTINCT visit_id FROM patient_consents WHERE visit_id IS NOT NULL
);

-- Defense in depth: AI output must not be persisted without consent. If
-- something bypasses the transcribe edge function and writes directly to
-- provider_notes (admin script, future code path), this still blocks it.
CREATE OR REPLACE FUNCTION enforce_consent_on_provider_notes()
RETURNS TRIGGER AS $$
DECLARE
  v_patient_id UUID;
BEGIN
  SELECT patient_id INTO v_patient_id FROM visits WHERE id = NEW.visit_id;
  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'visit % not found when validating consent', NEW.visit_id;
  END IF;

  IF NOT check_patient_consent(v_patient_id, NEW.visit_id) THEN
    RAISE EXCEPTION 'Cannot persist provider_note for visit %: required DPPA consents missing', NEW.visit_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_consent_on_provider_notes_trigger ON provider_notes;
CREATE TRIGGER enforce_consent_on_provider_notes_trigger
  BEFORE INSERT ON provider_notes
  FOR EACH ROW
  EXECUTE FUNCTION enforce_consent_on_provider_notes();
