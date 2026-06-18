-- 070_appointments.sql
--
-- F-SCHED (#2 / user request A) — scheduling. One calendar holds both
-- patient-linked follow-ups (nullable patient_id set) and clinic-level events
-- (drives, admin work, external lab/agency visits — patient_id NULL). The Today
-- board reads upcoming rows; "Book follow-up" from a chart inserts one.

CREATE TABLE IF NOT EXISTS appointments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id    UUID REFERENCES patients(id) ON DELETE CASCADE,  -- NULL = clinic-level event
  event_type    TEXT NOT NULL DEFAULT 'follow_up'
                  CHECK (event_type IN ('follow_up', 'drive', 'admin', 'external_lab_agency')),
  title         TEXT,            -- label for clinic-level events
  reason        TEXT,            -- reason for patient follow-ups
  scheduled_at  TIMESTAMPTZ NOT NULL,
  scheduled_end TIMESTAMPTZ,
  unit          TEXT,            -- opd | inpatient | lab | pharmacy | billing | data (optional)
  status        TEXT NOT NULL DEFAULT 'scheduled'
                  CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
  created_by    UUID REFERENCES staff(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointments_clinic_date ON appointments (clinic_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments (patient_id) WHERE patient_id IS NOT NULL;

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS appointments_select_clinic ON appointments;
CREATE POLICY appointments_select_clinic ON appointments
  FOR SELECT TO authenticated USING (clinic_id = get_current_clinic_id());

-- Create an appointment (patient follow-up or clinic event).
CREATE OR REPLACE FUNCTION rpc_create_appointment(
  p_clinic_id UUID,
  p_event_type TEXT,
  p_scheduled_at TIMESTAMPTZ,
  p_patient_id UUID DEFAULT NULL,
  p_title TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_unit TEXT DEFAULT NULL,
  p_scheduled_end TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);
  INSERT INTO appointments (clinic_id, patient_id, event_type, title, reason, scheduled_at, scheduled_end, unit, created_by)
  VALUES (p_clinic_id, p_patient_id, p_event_type, p_title, p_reason, p_scheduled_at, p_scheduled_end, p_unit, get_current_staff_id())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- List appointments in a window for the Today calendar.
CREATE OR REPLACE FUNCTION rpc_list_appointments(
  p_clinic_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ
)
RETURNS TABLE (
  id UUID,
  patient_id UUID,
  patient_name TEXT,
  event_type TEXT,
  title TEXT,
  reason TEXT,
  scheduled_at TIMESTAMPTZ,
  scheduled_end TIMESTAMPTZ,
  unit TEXT,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);
  RETURN QUERY
  SELECT
    a.id, a.patient_id,
    COALESCE(p.display_name, NULLIF(TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), '')),
    a.event_type, a.title, a.reason, a.scheduled_at, a.scheduled_end, a.unit, a.status
  FROM appointments a
  LEFT JOIN patients p ON p.id = a.patient_id
  WHERE a.clinic_id = p_clinic_id
    AND a.scheduled_at >= p_from
    AND a.scheduled_at < p_to
    AND a.status <> 'cancelled'
  ORDER BY a.scheduled_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_create_appointment(UUID, TEXT, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION rpc_list_appointments(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;
