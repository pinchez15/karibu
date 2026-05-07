-- Migration 031: Pharmacy + Lab MVP
-- ============================================================================
-- Purpose: ship a functional pharmacy + lab workflow in time for the May
-- diocesan rollout, without locking in schema decisions before we've seen
-- real usage.
--
-- Strategy: don't introduce prescriptions / dispense_records / lab_orders /
-- lab_results / formulary / stock yet. The clinician's note already carries
-- the orders in `visits.medications` (free text) and `visits.tests_ordered`
-- (free text). The pharmacy and lab surfaces become workflows on top of the
-- existing visit row, gated by status columns on `visits` itself.
--
-- Once we have 4-6 weeks of real signal, a follow-up migration introduces
-- the structured tables. Existing visit rows stay valid forever — the new
-- tables would carry forward post-rollout data only.
--
-- What this adds:
--   1. visits.dispensing_status, dispensed_at, dispensed_by, dispense_notes
--   2. visits.lab_status, lab_results, lab_completed_at, lab_completed_by,
--      lab_abnormal (bool)
--   3. Two indexes scoped to the pharmacy / lab queue queries
--   4. Backfill: any row with non-null medications gets dispensing_status
--      default; any row with non-null tests_ordered gets lab_status='pending'
--
-- What this does NOT change:
--   - visits.status / queue_status enums
--   - RLS — writes go via service-role server actions (same pattern as
--     payments, staff toggles) so no policy changes needed.
-- ============================================================================

-- ============================================================================
-- 1. Pharmacy columns
-- ============================================================================

ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS dispensing_status TEXT NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS dispensed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispensed_by UUID REFERENCES staff(id),
  ADD COLUMN IF NOT EXISTS dispense_notes TEXT;

ALTER TABLE visits DROP CONSTRAINT IF EXISTS visits_dispensing_status_check;
ALTER TABLE visits ADD CONSTRAINT visits_dispensing_status_check CHECK (
  dispensing_status IN ('not_started', 'in_progress', 'dispensed', 'partial', 'out_of_stock')
);

-- ============================================================================
-- 2. Lab columns
-- ============================================================================

ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS lab_status TEXT NOT NULL DEFAULT 'not_ordered',
  ADD COLUMN IF NOT EXISTS lab_results TEXT,
  ADD COLUMN IF NOT EXISTS lab_abnormal BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS lab_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lab_completed_by UUID REFERENCES staff(id);

ALTER TABLE visits DROP CONSTRAINT IF EXISTS visits_lab_status_check;
ALTER TABLE visits ADD CONSTRAINT visits_lab_status_check CHECK (
  lab_status IN ('not_ordered', 'pending', 'running', 'done', 'abnormal')
);

-- ============================================================================
-- 3. Backfill existing data
-- ============================================================================

-- Visits with tests already ordered should land on the lab queue. Existing
-- production data may have tests_ordered populated from prior AI structuring;
-- without this backfill those visits stay in 'not_ordered' and are invisible
-- to the lab tech.
UPDATE visits
SET lab_status = 'pending'
WHERE tests_ordered IS NOT NULL
  AND TRIM(tests_ordered) != ''
  AND lab_status = 'not_ordered';

-- Pharmacy backfill: visits where the clinician has medications recorded
-- AND documentation is complete should be in the dispenser's queue. Status
-- stays 'not_started' (the default), so no UPDATE needed — the queue query
-- filters on documentation_complete + dispensing_status.

-- ============================================================================
-- 4. Indexes for queue queries
-- ============================================================================

-- Pharmacy queue: visits ready for dispensing. Filter on clinic + status,
-- partial index to keep it small.
CREATE INDEX IF NOT EXISTS idx_visits_pharmacy_queue
  ON visits (clinic_id, dispensing_status, documentation_complete, visit_date DESC)
  WHERE dispensing_status IN ('not_started', 'in_progress', 'partial', 'out_of_stock');

-- Lab queue: visits with tests pending or running.
CREATE INDEX IF NOT EXISTS idx_visits_lab_queue
  ON visits (clinic_id, lab_status, visit_date DESC)
  WHERE lab_status IN ('pending', 'running');

-- Visits-with-abnormal-lab — used for the clinician's "needs attention" view.
CREATE INDEX IF NOT EXISTS idx_visits_lab_abnormal
  ON visits (clinic_id, doctor_id, visit_date DESC)
  WHERE lab_abnormal = TRUE;

-- ============================================================================
-- 5. Comments (documentation only — no behavior)
-- ============================================================================

COMMENT ON COLUMN visits.dispensing_status IS
  'Pharmacy MVP — workflow state for dispensing the clinician''s `medications` text. Replaced by structured prescriptions + dispense_records in a future migration.';
COMMENT ON COLUMN visits.lab_status IS
  'Lab MVP — workflow state for completing the clinician''s `tests_ordered` text. Replaced by structured lab_orders + lab_results in a future migration.';
COMMENT ON COLUMN visits.lab_abnormal IS
  'Lab tech sets this when entering results that should ping the ordering clinician.';
