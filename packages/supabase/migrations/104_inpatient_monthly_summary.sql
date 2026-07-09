-- 104_inpatient_monthly_summary.sql
--
-- B2 (docs/workplans/2026-07-09-tester-feedback/inpatient-buildout.md) —
-- "Monthly admission & discharge summary (HMIS-aligned)."
--
-- Gap: migration 055's outcome/disposition tallies feed no report yet — the
-- diocese has no monthly inpatient count to file against HMIS 108 (the ward
-- register-alignment work is future/B2-as-stepping-stone per the workplan;
-- this migration ships the aggregation RPC only, matching the shape the
-- workplan asks for).
--
-- rpc_inpatient_monthly_summary(p_clinic_id, p_month) — SECURITY DEFINER,
-- same assert_staff_in_clinic auth pattern as rpc_active_admissions /
-- rpc_discharged_admissions (063 / 103).
--
-- BUCKETING RULE (stated per the ticket's requirement):
--   - `admissions` is counted by ADMISSION month (admissions.admitted_at
--     falls in the report month), regardless of when/whether the admission
--     was later discharged.
--   - `discharges` and every outcome breakdown column (recovered, improved,
--     unchanged, referred_out, absconded, died) are counted by DISCHARGE
--     month (admissions.discharged_at falls in the report month), and only
--     for admissions whose status is 'discharged' or 'transferred' (i.e.
--     admissions.discharged_at is set — migrations/055). An admission
--     admitted in June and discharged in July is counted once in June's
--     `admissions` and once in July's `discharges`/outcome buckets — it
--     never double-counts within a single column.
--   - `deliveries` is counted by delivery month (deliveries.delivered_at,
--     migrations/056_inpatient_maternity.sql:14-19), independent of the
--     admission's own admitted/discharged month.
--   - `referred_out` = discharges in the report month where
--     admissions.outcome = 'referred' OR admissions.status = 'transferred'.
--     These are usually the same event (rpc_discharge_admission,
--     migrations/055_inpatient_discharge.sql:38, sets status='transferred'
--     when disposition='referred'), but outcome and disposition/status are
--     independently settable fields, so the OR is a deliberate belt-and-
--     braces union of both referral signals rather than picking one; a row
--     satisfying both conditions is still counted once (COUNT ... FILTER
--     over a single discharged-admissions row set, not a UNION).
--   - `bed_days` / `mean_length_of_stay_days` use the SIMPLER option named in
--     the ticket: only CLOSED admissions discharged within the report month
--     (the same row set as `discharges` above) — a still-active admission
--     contributes nothing until the month it is actually discharged. bed_days
--     is the sum, over that set, of CEIL(discharged_at - admitted_at) in
--     days; mean_length_of_stay_days is the average of the same per-row
--     day count over that set (NULL, not 0, when there were no discharges
--     that month — there is no length of stay to average).
--
-- Month boundaries are computed in Africa/Kampala local time (the same
-- convention as kampala_today(), migrations/062_hmis_corrections.sql:43-46,
-- introduced specifically because UTC-vs-Kampala day/month-shift bugs had
-- put HMIS 105 numbers in the wrong reporting period) so a delivery/discharge
-- recorded just after UTC midnight but before Kampala midnight lands in the
-- correct calendar month.
--
-- Schema facts verified before writing this:
--   - admissions.admitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
--     admissions.discharged_at TIMESTAMPTZ
--     — migrations/048_ehr_pilot_architecture.sql:239-251.
--   - admissions.status CHECK IN ('active','discharged','transferred')
--     — migrations/048_ehr_pilot_architecture.sql:247.
--   - admissions.outcome TEXT (recovered | improved | unchanged | referred |
--     absconded | died, per the migration's own comment — no DB-level CHECK,
--     values are set exclusively by rpc_discharge_admission's p_outcome arg)
--     — migrations/055_inpatient_discharge.sql:13.
--   - admissions.disposition (home | referred | other), discharge_notes
--     — migrations/055_inpatient_discharge.sql:14-15.
--   - deliveries.delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
--     deliveries.clinic_id — migrations/056_inpatient_maternity.sql:14-19.
--   - assert_staff_in_clinic(uuid) — migrations/045_ehr_pivot.sql:52-76.

BEGIN;

CREATE OR REPLACE FUNCTION rpc_inpatient_monthly_summary(
  p_clinic_id UUID,
  p_month DATE
)
RETURNS TABLE (
  admissions INT,
  discharges INT,
  recovered INT,
  improved INT,
  unchanged INT,
  referred_out INT,
  absconded INT,
  died INT,
  deliveries INT,
  mean_length_of_stay_days NUMERIC,
  bed_days INT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_month_start TIMESTAMPTZ;
  v_month_end TIMESTAMPTZ;
BEGIN
  PERFORM assert_staff_in_clinic(p_clinic_id);

  -- Kampala-local calendar month boundaries, expressed as absolute instants
  -- (see header comment for why: matches kampala_today()'s UTC+3 handling).
  v_month_start := (date_trunc('month', p_month::timestamp) AT TIME ZONE 'Africa/Kampala');
  v_month_end := ((date_trunc('month', p_month::timestamp) + INTERVAL '1 month') AT TIME ZONE 'Africa/Kampala');

  RETURN QUERY
  WITH admitted_this_month AS (
    SELECT COUNT(*) AS cnt
    FROM admissions a
    WHERE a.clinic_id = p_clinic_id
      AND a.admitted_at >= v_month_start
      AND a.admitted_at < v_month_end
  ),
  discharged_this_month AS (
    SELECT
      a.outcome,
      a.status,
      a.admitted_at,
      a.discharged_at
    FROM admissions a
    WHERE a.clinic_id = p_clinic_id
      AND a.status IN ('discharged', 'transferred')
      AND a.discharged_at IS NOT NULL
      AND a.discharged_at >= v_month_start
      AND a.discharged_at < v_month_end
  ),
  delivered_this_month AS (
    SELECT COUNT(*) AS cnt
    FROM deliveries d
    WHERE d.clinic_id = p_clinic_id
      AND d.delivered_at >= v_month_start
      AND d.delivered_at < v_month_end
  )
  SELECT
    (SELECT cnt FROM admitted_this_month)::INT AS admissions,
    COUNT(*)::INT AS discharges,
    COUNT(*) FILTER (WHERE dtm.outcome = 'recovered')::INT AS recovered,
    COUNT(*) FILTER (WHERE dtm.outcome = 'improved')::INT AS improved,
    COUNT(*) FILTER (WHERE dtm.outcome = 'unchanged')::INT AS unchanged,
    COUNT(*) FILTER (WHERE dtm.outcome = 'referred' OR dtm.status = 'transferred')::INT AS referred_out,
    COUNT(*) FILTER (WHERE dtm.outcome = 'absconded')::INT AS absconded,
    COUNT(*) FILTER (WHERE dtm.outcome = 'died')::INT AS died,
    (SELECT cnt FROM delivered_this_month)::INT AS deliveries,
    ROUND(AVG(CEIL(EXTRACT(EPOCH FROM (dtm.discharged_at - dtm.admitted_at)) / 86400.0))::numeric, 2) AS mean_length_of_stay_days,
    COALESCE(SUM(CEIL(EXTRACT(EPOCH FROM (dtm.discharged_at - dtm.admitted_at)) / 86400.0)), 0)::INT AS bed_days
  FROM discharged_this_month dtm;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_inpatient_monthly_summary(UUID, DATE) TO anon, authenticated;

COMMIT;
