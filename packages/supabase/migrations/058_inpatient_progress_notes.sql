-- 058_inpatient_progress_notes.sql
--
-- HC III inpatient progress notes (docs/hciii-inpatient-panel-spec.md, Phase 4).
-- Typed, append-only ward notes against an admission — the note IS the handover,
-- so per the reality-check there is NO dictation path here (a queued audio blob
-- that may transcribe hours later is a clinical-record liability on the ward).

CREATE TABLE IF NOT EXISTS admission_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_id UUID NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  recorded_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admission_notes_admission
  ON admission_notes(admission_id, created_at DESC);

CREATE OR REPLACE FUNCTION rpc_record_admission_note(
  p_id UUID,
  p_admission_id UUID,
  p_note TEXT,
  p_created_at TIMESTAMPTZ DEFAULT NULL,
  p_client_op_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_clinic_id UUID;
  v_patient_id UUID;
BEGIN
  SELECT clinic_id, patient_id INTO v_clinic_id, v_patient_id
  FROM admissions WHERE id = p_admission_id;
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Admission not found';
  END IF;
  PERFORM assert_staff_in_clinic(v_clinic_id);

  INSERT INTO admission_notes (id, admission_id, clinic_id, patient_id, note, recorded_by, created_at)
  VALUES (p_id, p_admission_id, v_clinic_id, v_patient_id, p_note, get_current_staff_id(), COALESCE(p_created_at, NOW()))
  ON CONFLICT (id) DO NOTHING;

  IF p_client_op_id IS NOT NULL AND NOT sync_op_already_applied(p_client_op_id) THEN
    PERFORM sync_op_record(p_client_op_id, v_clinic_id, 'record_admission_note', 'admission_notes', p_id);
  END IF;
  RETURN p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_record_admission_note(UUID, UUID, TEXT, TIMESTAMPTZ, UUID)
  TO anon, authenticated;

-- Notes for one admission, with the author's display name resolved.
CREATE OR REPLACE FUNCTION rpc_admission_notes(p_admission_id UUID)
RETURNS TABLE (
  id UUID,
  admission_id UUID,
  note TEXT,
  author_name TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT n.id, n.admission_id, n.note, s.display_name, n.created_at
  FROM admission_notes n
  LEFT JOIN staff s ON s.id = n.recorded_by
  WHERE n.admission_id = p_admission_id
  ORDER BY n.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION rpc_admission_notes(UUID) TO anon, authenticated;
