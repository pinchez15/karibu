-- 068_decouple_lifecycles.sql
--
-- F1 (#6) — split the three lifecycles that were tracked as one:
--   1. patient record (durable)        2. queue/encounter (operational)
--   3. note / documentation (clinical)
--
-- Two concrete schema moves (the rest is UI: stop surfacing raw queue_status as
-- the patient's state, and a Check-out action that does NOT require a signed note):
--
--  a) Notes anchor to the PATIENT; a visit is optional. This unblocks
--     register-without-a-visit (front desk enrolling a whole family — only the
--     person seeking care gets queued) and patient-only follow-up notes.
--     provider_notes.patient_id is already populated by rpc_upsert_provider_note.
ALTER TABLE provider_notes ALTER COLUMN visit_id DROP NOT NULL;

--  b) Check out an encounter for the day independently of documentation. Queue
--     position is operational; signing is clinical. This sets queue_status only
--     and deliberately leaves documentation_complete / status / the note alone,
--     so a clinician can keep the note open after the patient has left.
CREATE OR REPLACE FUNCTION rpc_check_out_visit(
  p_visit_id UUID,
  p_client_op_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID;
BEGIN
  SELECT clinic_id INTO v_clinic FROM visits WHERE id = p_visit_id;
  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'Visit not found';
  END IF;
  PERFORM assert_staff_in_clinic(v_clinic);

  UPDATE visits
     SET queue_status = 'completed',
         updated_at = NOW()
   WHERE id = p_visit_id;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_check_out_visit(UUID, UUID) TO authenticated, service_role;
