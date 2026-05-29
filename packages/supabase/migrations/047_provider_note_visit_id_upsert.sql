-- Restore visit_id-idempotent upsert for visit-tied provider notes.
-- Migration 042 used ON CONFLICT (id) only; idx_provider_notes_visit_unique still
-- allows one row per visit. Android + web with different local note UUIDs
-- hit 23505 on visit_id.

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
  v_staff_id UUID;
BEGIN
  v_caller_clinic := get_current_clinic_id();
  v_staff_id := get_current_staff_id();
  v_role := get_current_staff_role();
  IF v_role NOT IN ('admin','doctor','nurse','clinical_officer','midwife','nursing_assistant') THEN
    RAISE EXCEPTION 'Unauthorized role: %', v_role;
  END IF;

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

  v_source := COALESCE(p_source, CASE WHEN p_visit_id IS NOT NULL THEN 'visit' ELSE 'general' END);

  IF p_visit_id IS NOT NULL THEN
    INSERT INTO provider_notes (id, patient_id, visit_id, transcript, status, source, created_by, updated_at)
    VALUES (p_id, v_patient_id, p_visit_id, p_transcript, p_status, v_source, v_staff_id, now())
    ON CONFLICT (visit_id) WHERE visit_id IS NOT NULL DO UPDATE
      SET patient_id = EXCLUDED.patient_id,
          transcript = CASE
            WHEN EXCLUDED.transcript IS NOT NULL THEN EXCLUDED.transcript
            ELSE provider_notes.transcript
          END,
          status = EXCLUDED.status,
          source = COALESCE(EXCLUDED.source, provider_notes.source),
          updated_at = now();
    RETURN;
  END IF;

  INSERT INTO provider_notes (id, patient_id, visit_id, transcript, status, source, created_by, updated_at)
  VALUES (p_id, v_patient_id, p_visit_id, p_transcript, p_status, v_source, v_staff_id, now())
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
