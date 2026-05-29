# EHR pivot — observability checklist

Program-level gates from [ehr-pivot-implementation.md](./ehr-pivot-implementation.md) §11. Wire these metrics before field pilot sign-off.

## Android (client)

| Metric | Source | Alert threshold (starting point) |
|--------|--------|----------------------------------|
| Outbox depth | `sync_queue` pending count per device | > 50 pending for > 15 min while online |
| Sync retry rate | `sync_queue.attempts` histogram | p95 attempts > 3 per entry |
| 401 rate | `AuthInterceptor` counter | > 5% of authenticated requests / hour |
| JWT refresh success | Clerk refresh callback | < 95% success over 1 h |
| Per-RPC error rate | `SyncEngine` failure logs by `operation_type` | Any RPC > 10% failure while online |

## Server (Supabase + Inngest)

| Metric | Source | Notes |
|--------|--------|-------|
| RPC errors | Postgres logs / Logflare `rpc_*` | Group by function name |
| `finalize_clinical_encounter` latency | p95 < 2 s | Pilot SLO |
| Inngest `note.draft-ai-assist` failures | Inngest dashboard | Non-blocking for clinicians |
| Edge function 5xx | `request-draft-ai-assist`, `submit-dictation` | Page on sustained spike |

## Verification

1. Run `scripts/audit-android-postgrest.sh` in CI after Android data-layer changes.
2. Run `packages/supabase/tests/rpc_idempotency.sql` against staging before release.
3. Execute [ehr-pivot-qa.md](./ehr-pivot-qa.md) offline scenarios and record pass/fail in pilot checklist.
