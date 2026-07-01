-- Clear pharmacy Waiting queue for go-live (demo backlog).
--
-- Waiting = pharmacy_order_submitted_at set, medications present,
-- dispensing_status = 'not_started'.
--
-- IMPORTANT: Do not hardcode clinic UUID — production Ssunga is NOT the demo
-- seed id (30033fce-aab4-4d87-b580-...). Look up your clinic first.

-- Step 0 — find clinic id (run this first)
SELECT id, name, district
FROM clinics
WHERE name ILIKE '%ssunga%'
   OR slug ILIKE '%ssunga%'
ORDER BY name;

-- Step 1 — preview (replace :clinic_id with id from step 0)
-- Or use the name join version below (no uuid copy/paste typos).

SELECT
  c.name AS clinic_name,
  v.id,
  v.visit_date,
  v.pharmacy_order_submitted_at,
  ROUND(EXTRACT(EPOCH FROM (NOW() - v.pharmacy_order_submitted_at)) / 3600)::int AS hours_waiting,
  v.dispensing_status,
  LEFT(v.medications, 80) AS medications_preview
FROM visits v
JOIN clinics c ON c.id = v.clinic_id
WHERE c.name ILIKE '%ssunga%'
  AND v.pharmacy_order_submitted_at IS NOT NULL
  AND COALESCE(TRIM(v.medications), '') <> ''
  AND v.dispensing_status = 'not_started'
ORDER BY v.pharmacy_order_submitted_at ASC;

-- Step 2 — mark as dispensed (run after preview returns your ~16 rows)
BEGIN;

UPDATE visits v
SET
  dispensing_status = 'dispensed',
  dispensed_at = NOW(),
  dispense_notes = COALESCE(v.dispense_notes || E'\n', '')
    || '[Go-live queue clear ' || NOW()::timestamptz || ']',
  updated_at = NOW()
FROM clinics c
WHERE c.id = v.clinic_id
  AND c.name ILIKE '%ssunga%'
  AND v.pharmacy_order_submitted_at IS NOT NULL
  AND COALESCE(TRIM(v.medications), '') <> ''
  AND v.dispensing_status = 'not_started';

UPDATE prescription_orders po
SET status = 'dispensed'
FROM visits v
JOIN clinics c ON c.id = v.clinic_id
WHERE po.visit_id = v.id
  AND po.clinic_id = v.clinic_id
  AND c.name ILIKE '%ssunga%'
  AND v.dispensing_status = 'dispensed'
  AND v.dispense_notes LIKE '%Go-live queue clear%'
  AND po.status IN ('ordered', 'dispensing', 'partially_dispensed', 'needs_clarification');

COMMIT;

-- Step 3 — verify queue should be empty
SELECT COUNT(*) AS still_waiting
FROM visits v
JOIN clinics c ON c.id = v.clinic_id
WHERE c.name ILIKE '%ssunga%'
  AND v.pharmacy_order_submitted_at IS NOT NULL
  AND COALESCE(TRIM(v.medications), '') <> ''
  AND v.dispensing_status = 'not_started';
