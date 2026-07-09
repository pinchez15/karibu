-- Regression tests for B1 + B2
-- (docs/workplans/2026-07-09-tester-feedback/inpatient-buildout.md) —
-- migrations/103_discharged_admissions.sql and
-- migrations/104_inpatient_monthly_summary.sql.
--
-- House style: BEGIN; seed minimal clinic/staff/patient/admission rows;
-- DO-block assertions (RAISE EXCEPTION on failure, matching
-- packages/supabase/tests/rpc_idempotency.sql); ROLLBACK — no committed rows.
--
-- Run as a direct psql session (not through PostgREST), so
-- karibu_is_service_role() (migrations/063_security_hardening.sql:55-70)
-- returns TRUE and assert_staff_in_clinic (called by both RPCs under test)
-- takes the trusted service-role path.
--
--   psql "$DATABASE_URL" -f packages/supabase/tests/inpatient_reports.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- Fixtures: two clinics (for cross-clinic scoping assertions), one staff row
-- per clinic, one patient per clinic (fixed UUIDs for readability).
-- ---------------------------------------------------------------------------

INSERT INTO clinics (id, name, slug) VALUES
  ('20000000-0000-0000-0000-000000000001', 'Test Inpatient Reports Clinic A', 'test-inpatient-reports-a'),
  ('20000000-0000-0000-0000-000000000002', 'Test Inpatient Reports Clinic B', 'test-inpatient-reports-b');

INSERT INTO staff (id, clerk_user_id, clinic_id, email, display_name, role, is_active) VALUES
  ('20000000-0000-0000-0000-000000000003', 'test-clerk-inpatient-reports-a', '20000000-0000-0000-0000-000000000001',
   'staffa@test-inpatient-reports.example', 'Staff A', 'doctor', TRUE),
  ('20000000-0000-0000-0000-000000000006', 'test-clerk-inpatient-reports-b', '20000000-0000-0000-0000-000000000002',
   'staffb@test-inpatient-reports.example', 'Staff B', 'doctor', TRUE);

INSERT INTO patients (id, clinic_id, display_name, first_name, last_name, sex, date_of_birth) VALUES
  ('20000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', 'Patient A', 'Patient', 'A', 'F', '1990-01-01'),
  ('20000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000002', 'Patient B', 'Patient', 'B', 'M', '1985-06-15');

-- =============================================================================
-- B1 — rpc_discharged_admissions
-- =============================================================================

-- Active admission (clinic A) — must never appear in the discharged list.
INSERT INTO admissions (id, clinic_id, patient_id, admitted_at, status, ward)
VALUES (
  '20000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000004', '2026-07-01 08:00:00+00', 'active', 'general'
);

-- Discharged, in range, outcome='recovered' — must appear.
INSERT INTO admissions (
  id, clinic_id, patient_id, admitted_at, discharged_at, status, ward, outcome, disposition
) VALUES (
  '20000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000004', '2026-07-10 08:00:00+00', '2026-07-15 08:00:00+00',
  'discharged', 'general', 'recovered', 'home'
);

-- Transferred (referred out), in range, discharged LATER than the row above
-- (for the ORDER BY discharged_at DESC assertion) — must appear.
INSERT INTO admissions (
  id, clinic_id, patient_id, admitted_at, discharged_at, status, ward, outcome, disposition
) VALUES (
  '20000000-0000-0000-0000-000000000012', '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000004', '2026-07-05 08:00:00+00', '2026-07-20 08:00:00+00',
  'transferred', 'general', 'referred', 'referred'
);

-- Discharged, clinic A, but OUTSIDE the queried range — must not appear.
INSERT INTO admissions (
  id, clinic_id, patient_id, admitted_at, discharged_at, status, ward, outcome, disposition
) VALUES (
  '20000000-0000-0000-0000-000000000013', '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000004', '2025-12-20 08:00:00+00', '2026-01-01 08:00:00+00',
  'discharged', 'general', 'recovered', 'home'
);

-- Discharged, IN range, but a DIFFERENT clinic — must never leak into clinic A's list.
INSERT INTO admissions (
  id, clinic_id, patient_id, admitted_at, discharged_at, status, ward, outcome, disposition
) VALUES (
  '20000000-0000-0000-0000-000000000014', '20000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000005', '2026-07-10 08:00:00+00', '2026-07-20 08:00:00+00',
  'discharged', 'general', 'recovered', 'home'
);

DO $$
DECLARE
  v_count INT;
  v_first_id UUID;
BEGIN
  -- Default range covering July 2026, no outcome filter.
  SELECT COUNT(*) INTO v_count
  FROM rpc_discharged_admissions(
    '20000000-0000-0000-0000-000000000001'::uuid, '2026-07-01'::date, '2026-07-31'::date, NULL
  );
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'B1: expected 2 discharged/transferred admissions in range for clinic A, got %', v_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM rpc_discharged_admissions(
      '20000000-0000-0000-0000-000000000001'::uuid, '2026-07-01'::date, '2026-07-31'::date, NULL
    ) WHERE id = '20000000-0000-0000-0000-000000000011'
  ) THEN
    RAISE EXCEPTION 'B1: discharged admission in range should be present';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM rpc_discharged_admissions(
      '20000000-0000-0000-0000-000000000001'::uuid, '2026-07-01'::date, '2026-07-31'::date, NULL
    ) WHERE id = '20000000-0000-0000-0000-000000000012'
  ) THEN
    RAISE EXCEPTION 'B1: transferred admission in range should be present';
  END IF;

  IF EXISTS (
    SELECT 1 FROM rpc_discharged_admissions(
      '20000000-0000-0000-0000-000000000001'::uuid, '2026-07-01'::date, '2026-07-31'::date, NULL
    ) WHERE id = '20000000-0000-0000-0000-000000000010'
  ) THEN
    RAISE EXCEPTION 'B1: an active admission must never appear in the discharged list';
  END IF;

  IF EXISTS (
    SELECT 1 FROM rpc_discharged_admissions(
      '20000000-0000-0000-0000-000000000001'::uuid, '2026-07-01'::date, '2026-07-31'::date, NULL
    ) WHERE id = '20000000-0000-0000-0000-000000000013'
  ) THEN
    RAISE EXCEPTION 'B1: an out-of-range discharge must not appear';
  END IF;

  IF EXISTS (
    SELECT 1 FROM rpc_discharged_admissions(
      '20000000-0000-0000-0000-000000000001'::uuid, '2026-07-01'::date, '2026-07-31'::date, NULL
    ) WHERE id = '20000000-0000-0000-0000-000000000014'
  ) THEN
    RAISE EXCEPTION 'B1: clinic scoping violated — another clinic''s discharge leaked into the result';
  END IF;

  -- Ordering: discharged_at DESC -> the later (2026-07-20) transferred row first.
  SELECT id INTO v_first_id
  FROM rpc_discharged_admissions(
    '20000000-0000-0000-0000-000000000001'::uuid, '2026-07-01'::date, '2026-07-31'::date, NULL
  )
  LIMIT 1;
  IF v_first_id IS DISTINCT FROM '20000000-0000-0000-0000-000000000012'::uuid THEN
    RAISE EXCEPTION 'B1: expected discharged_at DESC ordering (latest discharge first), got first id %', v_first_id;
  END IF;

  -- Outcome filter narrows to just the matching row.
  SELECT COUNT(*) INTO v_count
  FROM rpc_discharged_admissions(
    '20000000-0000-0000-0000-000000000001'::uuid, '2026-07-01'::date, '2026-07-31'::date, 'referred'
  );
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'B1: outcome filter should return exactly 1 row, got %', v_count;
  END IF;
END $$;

-- =============================================================================
-- B2 — rpc_inpatient_monthly_summary
-- =============================================================================
-- All admitted_at/discharged_at timestamps below are mid-month, mid-day UTC
-- (well clear of any Kampala UTC+3 month-boundary shift), so bucketing is
-- unambiguous.

-- Admitted in July, still active -> counts toward July `admissions` only.
INSERT INTO admissions (id, clinic_id, patient_id, admitted_at, status, ward)
VALUES (
  '20000000-0000-0000-0000-000000000020', '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000004', '2026-07-05 09:00:00+00', 'active', 'general'
);

-- Month-boundary case: admitted June, discharged July (18 days) -> counts
-- toward July `discharges`/`recovered`/bed_days, NOT July `admissions`.
INSERT INTO admissions (
  id, clinic_id, patient_id, admitted_at, discharged_at, status, ward, outcome, disposition
) VALUES (
  '20000000-0000-0000-0000-000000000021', '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000004', '2026-06-15 08:00:00+00', '2026-07-03 08:00:00+00',
  'discharged', 'general', 'recovered', 'home'
);

-- Admitted AND discharged in July (2 days each), one per outcome bucket.
INSERT INTO admissions (
  id, clinic_id, patient_id, admitted_at, discharged_at, status, ward, outcome, disposition
) VALUES
  ('20000000-0000-0000-0000-000000000022', '20000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000004', '2026-07-10 08:00:00+00', '2026-07-12 08:00:00+00',
   'discharged', 'general', 'improved', 'home'),
  -- Referred: sets BOTH outcome='referred' and status='transferred' (mirrors
  -- rpc_discharge_admission's own behavior) -- must be counted once in
  -- referred_out, not twice.
  ('20000000-0000-0000-0000-000000000023', '20000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000004', '2026-07-10 08:00:00+00', '2026-07-12 08:00:00+00',
   'transferred', 'general', 'referred', 'referred'),
  ('20000000-0000-0000-0000-000000000024', '20000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000004', '2026-07-10 08:00:00+00', '2026-07-12 08:00:00+00',
   'discharged', 'general', 'absconded', 'other'),
  ('20000000-0000-0000-0000-000000000025', '20000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000004', '2026-07-10 08:00:00+00', '2026-07-12 08:00:00+00',
   'discharged', 'general', 'died', 'other'),
  ('20000000-0000-0000-0000-000000000026', '20000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000004', '2026-07-10 08:00:00+00', '2026-07-12 08:00:00+00',
   'discharged', 'general', 'unchanged', 'home');

-- Fully in June (distractor) -> must not count in July at all.
INSERT INTO admissions (
  id, clinic_id, patient_id, admitted_at, discharged_at, status, ward, outcome, disposition
) VALUES (
  '20000000-0000-0000-0000-000000000027', '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000004', '2026-06-01 08:00:00+00', '2026-06-10 08:00:00+00',
  'discharged', 'general', 'recovered', 'home'
);

-- Different clinic, admitted+discharged in July -> must not leak into clinic A's summary.
INSERT INTO admissions (
  id, clinic_id, patient_id, admitted_at, discharged_at, status, ward, outcome, disposition
) VALUES (
  '20000000-0000-0000-0000-000000000028', '20000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000005', '2026-07-08 08:00:00+00', '2026-07-09 08:00:00+00',
  'discharged', 'general', 'recovered', 'home'
);

-- Deliveries: one in July (linked to admission 22), one in June (linked to
-- the June-only admission 27) -> only the July one should count in July.
INSERT INTO deliveries (id, admission_id, clinic_id, patient_id, delivered_at, outcome)
VALUES
  ('20000000-0000-0000-0000-000000000030', '20000000-0000-0000-0000-000000000022',
   '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004',
   '2026-07-11 09:00:00+00', 'live'),
  ('20000000-0000-0000-0000-000000000031', '20000000-0000-0000-0000-000000000027',
   '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004',
   '2026-06-05 09:00:00+00', 'live');

DO $$
DECLARE
  v_row RECORD;
BEGIN
  SELECT * INTO v_row
  FROM rpc_inpatient_monthly_summary('20000000-0000-0000-0000-000000000001'::uuid, '2026-07-01'::date);

  IF v_row.admissions <> 6 THEN
    RAISE EXCEPTION 'B2: expected 6 admissions (admitted-in-July bucket), got %', v_row.admissions;
  END IF;
  IF v_row.discharges <> 6 THEN
    RAISE EXCEPTION 'B2: expected 6 discharges (discharged-in-July bucket), got %', v_row.discharges;
  END IF;
  IF v_row.recovered <> 1 THEN
    RAISE EXCEPTION 'B2: expected 1 recovered (the June-admitted/July-discharged row), got %', v_row.recovered;
  END IF;
  IF v_row.improved <> 1 THEN
    RAISE EXCEPTION 'B2: expected 1 improved, got %', v_row.improved;
  END IF;
  IF v_row.unchanged <> 1 THEN
    RAISE EXCEPTION 'B2: expected 1 unchanged, got %', v_row.unchanged;
  END IF;
  IF v_row.referred_out <> 1 THEN
    RAISE EXCEPTION 'B2: expected 1 referred_out (counted once despite matching both outcome and status), got %', v_row.referred_out;
  END IF;
  IF v_row.absconded <> 1 THEN
    RAISE EXCEPTION 'B2: expected 1 absconded, got %', v_row.absconded;
  END IF;
  IF v_row.died <> 1 THEN
    RAISE EXCEPTION 'B2: expected 1 died, got %', v_row.died;
  END IF;
  IF v_row.deliveries <> 1 THEN
    RAISE EXCEPTION 'B2: expected 1 delivery in July (the June delivery must not count), got %', v_row.deliveries;
  END IF;
  IF v_row.bed_days <> 28 THEN
    RAISE EXCEPTION 'B2: expected bed_days=28 (18 + 5x2), got %', v_row.bed_days;
  END IF;
  IF v_row.mean_length_of_stay_days IS DISTINCT FROM 4.67 THEN
    RAISE EXCEPTION 'B2: expected mean_length_of_stay_days=4.67 (28/6), got %', v_row.mean_length_of_stay_days;
  END IF;
END $$;

-- June, for comparison: only the June-only admission (27) and its delivery (31)
-- should land here, plus zero admissions (admission 21's admitted_at is June
-- 15, so it DOES count as a June admission even though it discharges in July).
DO $$
DECLARE
  v_row RECORD;
BEGIN
  SELECT * INTO v_row
  FROM rpc_inpatient_monthly_summary('20000000-0000-0000-0000-000000000001'::uuid, '2026-06-01'::date);

  IF v_row.admissions <> 2 THEN
    RAISE EXCEPTION 'B2 (June): expected 2 admissions (the June-only row + the June-admitted/July-discharged row), got %', v_row.admissions;
  END IF;
  IF v_row.discharges <> 1 THEN
    RAISE EXCEPTION 'B2 (June): expected 1 discharge (the June-only row; the boundary admission discharges in July, not June), got %', v_row.discharges;
  END IF;
  IF v_row.deliveries <> 1 THEN
    RAISE EXCEPTION 'B2 (June): expected 1 delivery, got %', v_row.deliveries;
  END IF;
  IF v_row.bed_days <> 9 THEN
    RAISE EXCEPTION 'B2 (June): expected bed_days=9 (2026-06-01 08:00 to 2026-06-10 08:00), got %', v_row.bed_days;
  END IF;
END $$;

ROLLBACK;
