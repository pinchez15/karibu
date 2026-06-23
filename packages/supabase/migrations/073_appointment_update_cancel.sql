-- 073_appointment_update_cancel.sql
-- Edit and soft-delete calendar events from the Clinic calendar page.

CREATE OR REPLACE FUNCTION rpc_update_appointment(
  p_clinic_id UUID,
  p_appointment_id UUID,
  p_event_type TEXT,
  p_scheduled_at TIMESTAMPTZ,
  p_patient_id UUID DEFAULT NULL,
  p_title TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_scheduled_end TIMESTAMPTZ DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);

  IF p_event_type NOT IN ('follow_up', 'drive', 'admin', 'external_lab_agency') THEN
    RAISE EXCEPTION 'Invalid event type';
  END IF;

  IF p_event_type = 'follow_up' AND p_patient_id IS NULL THEN
    RAISE EXCEPTION 'Patient required for follow-up';
  END IF;

  IF p_event_type <> 'follow_up' AND NULLIF(TRIM(p_title), '') IS NULL THEN
    RAISE EXCEPTION 'Title required for clinic event';
  END IF;

  IF p_patient_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM patients
      WHERE id = p_patient_id AND clinic_id = p_clinic_id
    ) THEN
      RAISE EXCEPTION 'Patient not found';
    END IF;
  END IF;

  UPDATE appointments
  SET
    patient_id = CASE WHEN p_event_type = 'follow_up' THEN p_patient_id ELSE NULL END,
    event_type = p_event_type,
    title = CASE WHEN p_event_type = 'follow_up' THEN NULL ELSE NULLIF(TRIM(p_title), '') END,
    reason = NULLIF(TRIM(p_reason), ''),
    scheduled_at = p_scheduled_at,
    scheduled_end = p_scheduled_end,
    updated_at = NOW()
  WHERE id = p_appointment_id
    AND clinic_id = p_clinic_id
    AND status <> 'cancelled';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION rpc_cancel_appointment(
  p_clinic_id UUID,
  p_appointment_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);

  UPDATE appointments
  SET status = 'cancelled', updated_at = NOW()
  WHERE id = p_appointment_id
    AND clinic_id = p_clinic_id
    AND status <> 'cancelled';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_update_appointment(
  UUID, UUID, TEXT, TIMESTAMPTZ, UUID, TEXT, TEXT, TIMESTAMPTZ
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION rpc_cancel_appointment(UUID, UUID) TO authenticated, service_role;
