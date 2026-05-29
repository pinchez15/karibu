-- Non-destructive EHR pivot hygiene: remove obviously invalid test rows only.
-- Does NOT wipe clinics, staff, or real pilot data. Review output before COMMIT.

BEGIN;

-- Duplicate empty draft provider notes (keep newest per visit)
DELETE FROM provider_notes pn
WHERE pn.status = 'draft'
  AND (pn.transcript IS NULL OR btrim(pn.transcript) = '')
  AND pn.id NOT IN (
    SELECT DISTINCT ON (visit_id) id
    FROM provider_notes
    WHERE visit_id IS NOT NULL AND status = 'draft'
    ORDER BY visit_id, updated_at DESC NULLS LAST, created_at DESC
  );

-- Stale sync_operations audit rows (idempotency ledger) older than 90 days
DELETE FROM sync_operations
WHERE created_at < NOW() - INTERVAL '90 days';

-- ROLLBACK; -- default: inspect then run COMMIT manually
COMMIT;
