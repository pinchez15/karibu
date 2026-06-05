-- HCIII → HCIV referral / transfer records. v1: structured capture + printable summary.
-- Digital receive at hospital is future work; this stores the clinical handoff packet.

CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  visit_id UUID REFERENCES visits(id) ON DELETE SET NULL,
  from_department TEXT NOT NULL DEFAULT 'opd',
  to_facility TEXT NOT NULL,
  urgency TEXT NOT NULL CHECK (urgency IN ('routine', 'urgent', 'emergency')),
  reason TEXT NOT NULL,
  clinical_summary TEXT,
  transport_mode TEXT,
  referred_by UUID REFERENCES staff(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referrals_clinic_created
  ON referrals(clinic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_referrals_patient
  ON referrals(patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_referrals_visit
  ON referrals(visit_id)
  WHERE visit_id IS NOT NULL;

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

-- Staff read referrals for their clinic via JWT-scoped RPCs only.

CREATE OR REPLACE FUNCTION rpc_create_referral(
  p_id UUID,
  p_clinic_id UUID,
  p_patient_id UUID,
  p_visit_id UUID,
  p_from_department TEXT,
  p_to_facility TEXT,
  p_urgency TEXT,
  p_reason TEXT,
  p_clinical_summary TEXT DEFAULT NULL,
  p_transport_mode TEXT DEFAULT NULL,
  p_client_op_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_staff_id UUID;
  v_row referrals%ROWTYPE;
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);

  IF sync_op_already_applied(p_client_op_id) THEN
    SELECT * INTO v_row FROM referrals WHERE id = p_id;
    IF FOUND THEN
      RETURN jsonb_build_object('id', v_row.id, 'created_at', v_row.created_at);
    END IF;
    RETURN jsonb_build_object('id', p_id);
  END IF;

  IF p_urgency NOT IN ('routine', 'urgent', 'emergency') THEN
    RAISE EXCEPTION 'Invalid urgency: %', p_urgency;
  END IF;

  IF NULLIF(TRIM(p_to_facility), '') IS NULL THEN
    RAISE EXCEPTION 'to_facility required';
  END IF;

  IF NULLIF(TRIM(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'reason required';
  END IF;

  IF p_visit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM visits
    WHERE id = p_visit_id
      AND clinic_id = p_clinic_id
      AND patient_id = p_patient_id
  ) THEN
    RAISE EXCEPTION 'Visit/patient/clinic mismatch';
  END IF;

  v_staff_id := get_current_staff_id();

  INSERT INTO referrals (
    id,
    clinic_id,
    patient_id,
    visit_id,
    from_department,
    to_facility,
    urgency,
    reason,
    clinical_summary,
    transport_mode,
    referred_by,
    status,
    created_at,
    updated_at
  ) VALUES (
    p_id,
    p_clinic_id,
    p_patient_id,
    p_visit_id,
    COALESCE(NULLIF(TRIM(p_from_department), ''), 'opd'),
    TRIM(p_to_facility),
    p_urgency,
    TRIM(p_reason),
    NULLIF(TRIM(p_clinical_summary), ''),
    NULLIF(TRIM(p_transport_mode), ''),
    v_staff_id,
    'active',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    to_facility = EXCLUDED.to_facility,
    urgency = EXCLUDED.urgency,
    reason = EXCLUDED.reason,
    clinical_summary = EXCLUDED.clinical_summary,
    transport_mode = EXCLUDED.transport_mode,
    updated_at = NOW();

  PERFORM sync_op_record(
    p_client_op_id, p_clinic_id, 'create_referral', 'referrals', p_id
  );

  SELECT * INTO v_row FROM referrals WHERE id = p_id;
  RETURN jsonb_build_object(
    'id', v_row.id,
    'created_at', v_row.created_at,
    'status', v_row.status
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_create_referral(
  UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID
) TO anon, authenticated;

CREATE OR REPLACE FUNCTION rpc_list_referrals_today(
  p_clinic_id UUID
) RETURNS TABLE (
  id UUID,
  patient_id UUID,
  visit_id UUID,
  patient_name TEXT,
  to_facility TEXT,
  urgency TEXT,
  reason TEXT,
  clinical_summary TEXT,
  transport_mode TEXT,
  status TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);

  RETURN QUERY
  SELECT
    r.id,
    r.patient_id,
    r.visit_id,
    COALESCE(
      NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''),
      p.display_name,
      'Unknown'
    ) AS patient_name,
    r.to_facility,
    r.urgency,
    r.reason,
    r.clinical_summary,
    r.transport_mode,
    r.status,
    r.created_at
  FROM referrals r
  JOIN patients p ON p.id = r.patient_id
  WHERE r.clinic_id = p_clinic_id
    AND r.created_at >= (CURRENT_DATE AT TIME ZONE 'UTC')
    AND r.status = 'active'
  ORDER BY r.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_list_referrals_today(UUID) TO anon, authenticated;
