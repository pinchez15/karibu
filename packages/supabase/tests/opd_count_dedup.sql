-- OPD count dedup regression (migration 114).
-- Run: psql "$DATABASE_URL" -f packages/supabase/tests/opd_count_dedup.sql

BEGIN;

INSERT INTO clinics (id, name, slug, timezone)
VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa14',
  'OPD Dedup Test Clinic',
  'opd-dedup-test',
  'Africa/Kampala'
);

INSERT INTO patients (id, clinic_id, first_name, last_name)
VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb14', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa14', 'Admit', 'Test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb15', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa14', 'Double', 'Checkin');

-- 1. Admission-linked visit must not appear on the OPD queue.
DO $$
DECLARE
  v_clinic UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa14';
  v_patient UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb14';
  v_admission UUID := 'cccccccc-cccc-cccc-cccc-cccccccccc14';
  v_opd_visit UUID;
  v_ip_visit UUID := 'dddddddd-dddd-dddd-dddd-dddddddddd14';
  v_queue_count INT;
BEGIN
  v_opd_visit := check_in_patient(v_clinic, v_patient, 'fever', 'normal', NULL, 'opd', NULL, NULL);

  INSERT INTO admissions (id, clinic_id, patient_id, ward, status)
  VALUES (v_admission, v_clinic, v_patient, 'general', 'active');

  INSERT INTO visits (
    id, clinic_id, patient_id, admission_id, visit_date, department,
    status, queue_status, priority
  ) VALUES (
    v_ip_visit, v_clinic, v_patient, v_admission, kampala_today(), 'inpatient',
    'pending', 'with_doctor', 'normal'
  );

  SELECT COUNT(*) INTO v_queue_count
  FROM get_clinic_queue(v_clinic)
  WHERE patient_id = v_patient;

  IF v_queue_count <> 1 THEN
    RAISE EXCEPTION 'expected 1 OPD queue row for admitted patient, got %', v_queue_count;
  END IF;
END $$;

-- 2. Second check-in same day reuses the open OPD visit.
DO $$
DECLARE
  v_clinic UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa14';
  v_patient UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb15';
  v_first UUID;
  v_second UUID;
  v_visit_count INT;
BEGIN
  v_first := check_in_patient(v_clinic, v_patient, 'cough', 'normal', NULL, 'opd', NULL, NULL);
  v_second := check_in_patient(v_clinic, v_patient, 'cough again', 'normal', NULL, 'opd', NULL, NULL);

  IF v_first IS DISTINCT FROM v_second THEN
    RAISE EXCEPTION 'second check-in should reuse visit %, got %', v_first, v_second;
  END IF;

  SELECT COUNT(*) INTO v_visit_count
  FROM visits
  WHERE clinic_id = v_clinic
    AND patient_id = v_patient
    AND visit_date = kampala_today()
    AND admission_id IS NULL;

  IF v_visit_count <> 1 THEN
    RAISE EXCEPTION 'expected 1 OPD visit after double check-in, got %', v_visit_count;
  END IF;
END $$;

ROLLBACK;
