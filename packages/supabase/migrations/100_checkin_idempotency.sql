-- 100_checkin_idempotency.sql — WP-B: client-supplied visit id + idempotency
-- =============================================================================
-- Offline check-ins queued without a client visit id could duplicate visits on
-- replay and leave the local row permanently unsynced. Adds p_visit_id and
-- p_client_op_id (both DEFAULT NULL) so web and old APKs keep working.
-- =============================================================================

BEGIN;

DROP FUNCTION IF EXISTS check_in_patient(UUID, UUID, TEXT, TEXT, UUID, TEXT);

CREATE OR REPLACE FUNCTION check_in_patient(
  p_clinic_id UUID,
  p_patient_id UUID,
  p_chief_complaint TEXT DEFAULT NULL,
  p_priority TEXT DEFAULT 'normal',
  p_staff_id UUID DEFAULT NULL,
  p_department TEXT DEFAULT 'opd',
  p_visit_id UUID DEFAULT NULL,
  p_client_op_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_visit_id UUID;
  v_queue_position INTEGER;
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);

  IF p_client_op_id IS NOT NULL AND sync_op_already_applied(p_client_op_id) THEN
    RETURN (SELECT entity_id FROM sync_operations WHERE id = p_client_op_id);
  END IF;

  IF p_staff_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM staff
      WHERE id = p_staff_id
        AND clinic_id = p_clinic_id
        AND is_active = TRUE
    ) THEN
      RAISE EXCEPTION 'Staff not authorized for this clinic';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM patients WHERE id = p_patient_id AND clinic_id = p_clinic_id
  ) THEN
    RAISE EXCEPTION 'Patient not found in this clinic';
  END IF;

  v_visit_id := COALESCE(p_visit_id, gen_random_uuid());
  v_queue_position := assign_today_number(p_clinic_id, kampala_today());

  INSERT INTO visits (
    id,
    clinic_id,
    patient_id,
    status,
    queue_status,
    queue_position,
    checked_in_at,
    chief_complaint,
    priority,
    visit_date,
    department
  ) VALUES (
    v_visit_id,
    p_clinic_id,
    p_patient_id,
    'pending',
    'waiting',
    v_queue_position,
    NOW(),
    p_chief_complaint,
    p_priority,
    kampala_today(),
    p_department
  )
  ON CONFLICT (id) DO NOTHING;

  IF p_client_op_id IS NOT NULL THEN
    PERFORM sync_op_record(
      p_client_op_id, p_clinic_id, 'check_in_patient', 'visits', v_visit_id
    );
  END IF;

  RETURN v_visit_id;
END;
$$;

GRANT EXECUTE ON FUNCTION check_in_patient(
  UUID, UUID, TEXT, TEXT, UUID, TEXT, UUID, UUID
) TO anon, authenticated;

COMMIT;
