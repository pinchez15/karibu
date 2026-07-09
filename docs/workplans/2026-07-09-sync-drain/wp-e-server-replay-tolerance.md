# WP-E — Server replay tolerance: idempotency gates first, fix broken replay paths

**Priority:** P1, Phase 3. Pure SQL; independent of the Android WPs. Deploy migrations **before** distributing the new APK.
**Branch suggestion:** `fix/wp-e-server-replay-tolerance`
**Files touched:** `packages/supabase/migrations/101_replay_tolerance.sql` (new), `packages/supabase/tests/replay_tolerance.sql` (new).

## Problem (verified, from the 2026-07-09 RPC audit)

The `sync_operations` ledger (`045_ehr_pivot.sql:8`, helpers `sync_op_already_applied` `:78` / `sync_op_record` `:88`) makes most RPCs replay-safe — but three gaps turn legitimate offline replays into PostgREST 400s, which the Android engine classifies **PERMANENT** (`SyncError.kt:51`) → dead-letter → cascade (WP-A):

1. **`rpc_create_care_task` replay is broken outright.** Its gate at `099_care_task_service_role_creator.sql:55` runs `SELECT entity_id FROM sync_operations WHERE client_op_id = p_client_op_id`, but `sync_operations` has no `client_op_id` column (PK is `id`, `045:9`). Every genuine replay raises `undefined_column` → 400. The idempotency mechanism itself dead-letters the retry.
2. **Existence checks run before the idempotency gate.** In the standard pattern, `SELECT ... FROM visits WHERE id = p_visit_id` + `RAISE 'Visit not found'` executes *before* `sync_op_already_applied`. A replayed op whose target was since merged/voided/purged raises 400 even though the op already applied. The gate must run first: an already-applied op returns success regardless of current state.
3. **State-conflict raises hit lagging replays that lost their op-id context.** "Cannot resubmit after full dispense" (`091_pharmacy_submit_guard.sql:102`), "Pharmacy is dispensing — send-back required" (`091:113`), "Test not found on visit" (`075_lab_test_results.sql:170`, `099:177`), "Invalid terminal dispensing status" (`045:419`). With the gate ordered first (fix 2), a true replay (same op-id) short-circuits before these; a *different* op against moved-on state still correctly 400s. So fix 2 resolves this class — no per-raise changes needed. Verify per-RPC that this holds.

## Tasks

### E1 — Migration `101_replay_tolerance.sql`

Redefine (CREATE OR REPLACE where the signature is unchanged; DROP + CREATE where not) with the corrected structure. For each function below, the body change is the same three-line pattern — move this block to the **top of the body, immediately after `assert_staff_in_clinic` (auth must still run first)** and before any entity lookup:

```sql
IF sync_op_already_applied(p_client_op_id) THEN
  RETURN;  -- or RETURN <benign value matching the function's return type>
END IF;
```

Functions to fix, with their latest definitions (redefine from these, not older copies):

| Function | Latest def | Return on replay |
|---|---|---|
| `rpc_create_care_task` | `099_care_task_service_role_creator.sql:34` | **also fix the broken column**: replay lookup is `SELECT entity_id FROM sync_operations WHERE id = p_client_op_id` (column `id`, not `client_op_id`) |
| `rpc_submit_pharmacy_order` | `091_pharmacy_submit_guard.sql:51` | void / existing behavior |
| `rpc_complete_pharmacy_dispense` | `098_wp3_pharmacy_batches.sql:347` | void |
| `rpc_record_lab_test_result` | `099_care_task_service_role_creator.sql:107` | void |
| `rpc_start_lab_test` | `075_lab_test_results.sql:128` | void |
| `rpc_record_dispense` | `045_ehr_pivot.sql:395` | void |
| `rpc_record_lab_result` | `045_ehr_pivot.sql:277` | void |
| `rpc_start_lab` | `045_ehr_pivot.sql:251` | void |
| `rpc_record_payment` | `063_security_hardening.sql:855` | already returns the existing row on replay (`:877`) — verify the gate precedes the visit lookup; reorder if not |
| `rpc_finalize_clinical_encounter` | `050_finalize_clears_clinician_queue.sql:17` | verify gate order (`:45`); reorder if existence checks precede it |

Rules for the migration:

- Preserve `SECURITY DEFINER`, `SET search_path`, grants, and every business rule verbatim — this migration ONLY reorders the gate and fixes the care-task column. Diff each function body against its source migration in the PR description.
- `sync_op_already_applied(NULL)` returns FALSE (`045:78-84`), so ops without an op-id (old clients) behave exactly as today.
- Follow the drop-before-recreate precedent (`a21ad2c`) for any signature that changes (none should).

### E2 — Regression guard for the audit's clean RPCs

No code change; add assertions (test file below) that the already-correct RPCs keep their replay behavior: `rpc_create_patient` (`086:49`), `rpc_create_visit` (`ON CONFLICT (id)` `095:178`), `rpc_insert_patient_vitals` (`029:267`), `rpc_upsert_provider_note` (`047:55`), `rpc_admit_patient_v2` (`053:94`).

## Tests — `packages/supabase/tests/replay_tolerance.sql`

House style (`BEGIN; … ROLLBACK;`, DO-block assertions, seed clinic/staff/patient/visit inside the transaction). Cases:

1. **Care-task replay fixed:** call `rpc_create_care_task` twice with the same `p_client_op_id` → no exception, exactly one `care_tasks` row. (FAILS pre-migration with `undefined_column`.)
2. **Gate-before-existence:** apply `rpc_record_lab_result` once; delete/void the visit's lab context (or delete the visit row within the txn); replay with the same op-id → returns success, no raise. (FAILS pre-migration with "Visit not found"/state raise.)
3. **State-conflict replay:** `rpc_submit_pharmacy_order` → complete dispense → replay the ORIGINAL submit op-id → success no-op; a NEW op-id against the dispensed state still raises "Cannot resubmit after full dispense" (business rule intact).
4. **Old-client path:** each fixed RPC called with `p_client_op_id := NULL` behaves exactly as today (state checks still raise where they should).
5. **E2 regression sweep:** replay each clean RPC once with an identical payload → row counts unchanged, no exceptions.

Run: `supabase db reset && psql "$DATABASE_URL" -f packages/supabase/tests/replay_tolerance.sql`.

## Acceptance criteria

- [ ] Migration 101 applies cleanly on top of 100 (WP-B); both test files pass.
- [ ] Invariant **I6** holds: replaying any queued op is a 2xx no-op.
- [ ] PR description contains a per-function diff summary proving only gate-order + the care-task column changed.
- [ ] Deployed to the Supabase project before the 1.0.32 APK ships (coordinate with WP-F).
