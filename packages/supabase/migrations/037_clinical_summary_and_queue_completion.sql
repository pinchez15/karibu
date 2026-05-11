-- Migration 037: Clinical summary fields + durable queue completion
-- ============================================================================
-- Adds an RPC used by Android's offline sync queue to persist clinical fields
-- that are separate from the patient-facing note. Also tightens the visit
-- completion RPC so payment/skip closes both the clinical visit lifecycle and
-- the operational queue lifecycle.

CREATE OR REPLACE FUNCTION rpc_upsert_visit_clinical_summary(
  p_visit_id UUID,
  p_diagnosis TEXT DEFAULT NULL,
  p_medications TEXT DEFAULT NULL,
  p_follow_up_instructions TEXT DEFAULT NULL,
  p_tests_ordered TEXT DEFAULT NULL,
  p_structured_data TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_visit_clinic UUID;
  v_role TEXT;
  v_structured_json JSONB;
BEGIN
  SELECT clinic_id INTO v_visit_clinic FROM visits WHERE id = p_visit_id;
  IF v_visit_clinic IS NULL OR v_visit_clinic != get_current_clinic_id() THEN
    RAISE EXCEPTION 'Unauthorized: visit/clinic mismatch';
  END IF;

  v_role := get_current_staff_role();
  IF v_role NOT IN ('admin','doctor','nurse','clinical_officer','midwife','nursing_assistant') THEN
    RAISE EXCEPTION 'Unauthorized role: %', v_role;
  END IF;

  IF p_structured_data IS NOT NULL AND TRIM(p_structured_data) != '' THEN
    v_structured_json := p_structured_data::jsonb;
  END IF;

  UPDATE visits
  SET diagnosis = NULLIF(TRIM(p_diagnosis), ''),
      medications = NULLIF(TRIM(p_medications), ''),
      follow_up_instructions = NULLIF(TRIM(p_follow_up_instructions), ''),
      tests_ordered = NULLIF(TRIM(p_tests_ordered), ''),
      lab_status = CASE
        WHEN NULLIF(TRIM(p_tests_ordered), '') IS NOT NULL AND lab_status = 'not_ordered' THEN 'pending'
        WHEN NULLIF(TRIM(p_tests_ordered), '') IS NULL THEN 'not_ordered'
        ELSE lab_status
      END,
      updated_at = NOW()
  WHERE id = p_visit_id;

  UPDATE provider_notes
  SET structured_data = COALESCE(v_structured_json, structured_data),
      updated_at = NOW()
  WHERE visit_id = p_visit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_upsert_visit_clinical_summary(UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO anon, authenticated;

CREATE OR REPLACE FUNCTION complete_visit_queue(
  p_visit_id UUID,
  p_staff_id UUID DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_visit RECORD;
BEGIN
  SELECT * INTO v_visit FROM visits WHERE id = p_visit_id;

  IF v_visit IS NULL THEN
    RAISE EXCEPTION 'Visit not found';
  END IF;

  IF p_staff_id IS NOT NULL THEN
    IF v_visit.doctor_id IS DISTINCT FROM p_staff_id THEN
      IF NOT EXISTS (
        SELECT 1 FROM staff
        WHERE id = p_staff_id
          AND clinic_id = v_visit.clinic_id
          AND role IN ('admin','doctor','nurse','clinical_officer','midwife','nursing_assistant','records_officer')
          AND is_active = TRUE
      ) THEN
        RAISE EXCEPTION 'Only assigned clinician, records officer, or admin can complete visit';
      END IF;
    END IF;
  END IF;

  UPDATE visits
  SET queue_status = 'completed',
      status = 'completed',
      finalized_at = COALESCE(finalized_at, NOW()),
      updated_at = NOW()
  WHERE id = p_visit_id
    AND queue_status != 'cancelled';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visit cannot be completed from cancelled queue status';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION complete_visit_queue(UUID, UUID) TO anon, authenticated;
