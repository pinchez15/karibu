-- 055_inpatient_discharge.sql
--
-- HC III inpatient discharge / outcome close-out (docs/hciii-inpatient-panel-spec.md,
-- Phase 2). Closing the admission is what makes the ward census trustworthy (the
-- patient leaves the board) and what feeds HMIS 105 admission/outcome tallies.
--
-- The admissions table already carries status ('active'|'discharged'|'transferred')
-- and discharged_at; this adds the outcome detail and an idempotent RPC. Referral
-- itself reuses the existing rpc_create_referral (visit-less, from_department
-- 'inpatient') — no new referral plumbing here.

ALTER TABLE admissions
  ADD COLUMN IF NOT EXISTS outcome TEXT,           -- recovered | improved | unchanged | referred | absconded | died
  ADD COLUMN IF NOT EXISTS disposition TEXT,       -- home | referred | other
  ADD COLUMN IF NOT EXISTS discharge_notes TEXT,
  ADD COLUMN IF NOT EXISTS discharged_by UUID REFERENCES staff(id);

CREATE OR REPLACE FUNCTION rpc_discharge_admission(
  p_admission_id UUID,
  p_outcome TEXT,
  p_disposition TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_client_op_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_clinic_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id FROM admissions WHERE id = p_admission_id;
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Admission not found';
  END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);

  -- 'died' is recorded as an outcome but keeps status semantics consistent:
  -- the patient leaves the active ward either way.
  UPDATE admissions
  SET status = CASE WHEN p_disposition = 'referred' THEN 'transferred' ELSE 'discharged' END,
      discharged_at = COALESCE(discharged_at, NOW()),
      outcome = p_outcome,
      disposition = p_disposition,
      discharge_notes = p_notes,
      discharged_by = get_current_staff_id(),
      updated_at = NOW()
  WHERE id = p_admission_id;

  IF p_client_op_id IS NOT NULL AND NOT sync_op_already_applied(p_client_op_id) THEN
    PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'discharge_admission', 'admissions', p_admission_id);
  END IF;
  RETURN p_admission_id;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_discharge_admission(UUID, TEXT, TEXT, TEXT, UUID) TO anon, authenticated;
