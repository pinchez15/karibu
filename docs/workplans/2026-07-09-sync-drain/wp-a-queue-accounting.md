# WP-A — Queue accounting: cascaded failures must be visible, rescuable, and never counted as pending

**Priority:** P0 (gates next APK). Parallel-safe with WP-B.
**Branch suggestion:** `fix/wp-a-sync-queue-accounting`
**Files touched:** `apps/android/app/src/main/java/com/karibuhealth/app/data/sync/SyncEngine.kt`, `data/sync/SyncQueueHelper.kt`, `data/sync/OutboxReconciler.kt`, `data/local/db/dao/SyncQueueDao.kt`, `data/local/db/KaribuDatabase.kt` (version bump + migration), `ui/components/SyncDetailsSheet.kt`, tests under `app/src/test/java/com/karibuhealth/app/data/sync/`.

## Problem

`markDependentsFailed` (`SyncEngine.kt:483-496`) sets dependents to `status='failed'` without touching `attempts`. Consequences (all verified):

1. `getPendingCount()` (`SyncQueueDao.kt:33`) counts `status IN ('pending','failed') AND attempts < max_attempts` → cascaded children inflate the banner **forever**.
2. `getRetryable()` returns them each run; the dependency gate (`SyncEngine.kt:128-149`) skips them because the parent is `failed`, not `completed` → never processed, never exhausted.
3. "Needs attention" (`getTerminallyFailedCount`, `SyncQueueDao.kt:61`) requires `attempts >= max_attempts` → cascaded children never surface as stuck.
4. `OutboxReconciler.reconcilePendingWithLocalState` (`OutboxReconciler.kt:40-41`) iterates `getPending()` (`status='pending'` only) → a failed `create_*` whose entity actually landed on the server is never cleared.
5. `SyncQueueHelper.enqueue` (`SyncQueueHelper.kt:22-32`) resets a reused row to `status='pending', attempts=0` — note autosave resurrects cascade-failed rows into permanently-blocked "pending" and prevents any failing draft from ever dead-lettering while the clinician types.

## Design decision

We do NOT add a new status enum value (Room schema stays; smaller blast radius). A **blocked** row is: `status='failed' AND attempts >= max_attempts AND last_error LIKE 'blocked:%'`. The `blocked:` prefix is the discriminator between "blocked by upstream" and "exhausted own retries". Document this convention in a comment on `markDependentsFailed`.

## Tasks

### A1 — Cascade marks dependents terminally failed

In `SyncEngine.markDependentsFailed` (`SyncEngine.kt:483`), when cascading, set on each dependent:

```kotlin
dep.copy(
    status = "failed",
    attempts = dep.maxAttempts,          // NEW: leaves pending count, enters Needs attention
    lastError = "blocked: $reason",      // NEW: 'blocked:' prefix is the machine-readable marker
    nextRetryAt = null,
)
```

Keep the recursion and the `completed`/`failed` skip guard. Update `recordPermanentFailure` / `recordTransientFailure` call sites only if signatures change (they shouldn't).

### A2 — Enqueue must not resurrect blocked rows, and must cascade-on-arrival

In `SyncQueueHelper.enqueue` (`SyncQueueHelper.kt:20-40`):

1. **Cascade-on-arrival:** after resolving the row (reused or new), if its effective `dependsOn` points to an entry with `status='failed'` (any attempts), immediately write the row as blocked (`status='failed'`, `attempts=maxAttempts`, `lastError="blocked: upstream <parentOp> already failed"`). Do not schedule immediate sync for it. Return the id as today (callers use it for chaining; a blocked child's own dependents will cascade the same way on their enqueue).
2. **Fresh-budget reset stays** for the healthy-parent case: reusing a pending/failed row with a new payload still resets `status='pending', attempts=0` — a new payload legitimately deserves a fresh budget. The A2.1 check runs *after* this, so a blocked parent always wins.
3. Inject `SyncQueueDao.getById` usage for the parent lookup (dao already injected).

### A3 — Reconciler covers failed rows and revives their dependents

In `OutboxReconciler`:

1. Add DAO query:
```kotlin
@Query("SELECT * FROM sync_queue WHERE status IN ('pending', 'failed') ORDER BY created_at ASC")
suspend fun getActiveForReconciliation(): List<SyncQueueEntry>
```
2. `reconcilePendingWithLocalState` iterates `getActiveForReconciliation()` instead of `getPending()`. The operation-aware safety rules are UNCHANGED — only pure creates (`create_patient`, `create_visit`, `insert_patient_vitals`, `queue_op`/`check_in_patient`) may be force-completed off the local `isSynced` proxy. (Do not weaken this; see the class doc comment about silently dropped clinical writes.)
3. After `forceComplete(entry.id)`, **revive blocked direct dependents**: for each row in `getDependents(entry.id)` with `status='failed' AND lastError LIKE 'blocked:%'`, reset to `status='pending', attempts=0, lastError=null, nextRetryAt=null`. (One hop only — grandchildren revive on subsequent passes once their parent completes; add a comment saying so.) Add DAO helper if a targeted UPDATE is cleaner:
```kotlin
@Query("UPDATE sync_queue SET status='pending', attempts=0, last_error=NULL, next_retry_at=NULL WHERE depends_on = :parentId AND status='failed' AND last_error LIKE 'blocked:%'")
suspend fun reviveBlockedDependents(parentId: String): Int
```
4. Same revival after a parent entry completes normally is NOT needed (normal completion never blocked anyone), but `MainViewModel.retryAll` flow is fixed in A4.

### A4 — Retry-all revives blocked rows coherently

`SyncQueueDao.resetFailed()` (`SyncQueueDao.kt:89-94`) already resets all failed rows to pending/0 — blocked children included. That is correct behavior for retryAll (parent retried first via topological sort; if it permanently fails again, A1 re-blocks the children in the same run — the count no longer lies between runs). No change to `resetFailed` needed; add a test proving the round-trip (retryAll → parent perm-fails → children re-blocked, banner count excludes them).

### A5 — One-time re-baseline of historical limbo rows (Room migration)

Bump the Room database version in `KaribuDatabase.kt` by 1 and add a migration whose SQL is exactly:

```sql
UPDATE sync_queue SET attempts = max_attempts, last_error = COALESCE('blocked: ' || last_error, 'blocked: legacy cascade')
WHERE status = 'failed' AND attempts < max_attempts
```

This moves every historical cascade-limbo row out of the pending count and into "Needs attention" on first launch of the new build — the tester's 50–60 becomes an honest, actionable list. Follow the existing migration style in `KaribuDatabase.kt` (find the current `version =` and the `Migration(N, N+1)` list; the v30→v31 max-attempts bump is precedent).

### A6 — "Needs attention" groups blocked children under their root cause

In `SyncDetailsSheet.kt` (and `MainViewModel` if a derived list is needed):

- Partition `failedEntries` into roots (`lastError` does NOT start with `blocked:`) and blocked children.
- Render roots as today (op name, attempts, lastError, "Mark synced").
- Under each root, render one collapsed line: `"…and N dependent records blocked by this"` (match children via `dependsOn` transitively within the failed set; a simple one-hop grouping by `dependsOn == root.id` is acceptable — note the limitation in a comment).
- Blocked children not attributable to a visible root (orphaned) render in a flat "Blocked" section.
- Copy for the header stays honest: these items are NOT on the server.

## Tests (write first where practical; each must fail on unmodified code)

`SyncEngineTest.kt` (MockK + `runTest`, follow existing fixture style):

1. `cascadeMarksDependentsTerminallyFailed` — parent perm-fails (mock 422 `SyncHttpException`); dependent entry exists via `getDependents`; assert the dependent update captured has `attempts == maxAttempts`, `status == "failed"`, `lastError` starts with `"blocked:"`. Assert recursion: grandchild also blocked.
2. `blockedChildrenAreNotRetriedNorCounted` — simulate second run: `getRetryable` returns nothing for blocked rows (this is a DAO-contract test — see test 6) and engine `skippedDependency` stays 0 for blocked rows.
3. `retryAllRoundTripReblocksChildren` — after `resetFailed` semantics (feed reset rows into a run where parent perm-fails again), children end the run blocked again.

`SyncQueueHelperTest.kt`:

4. `enqueueOntoDeadParentIsBlockedImmediately` — enqueue entry with `dependsOn` → parent mocked `status='failed'`; assert row written with `attempts == maxAttempts` and `lastError` starting `"blocked:"`, and `scheduleImmediateSync` NOT called for it.
5. `autosaveReuseDoesNotResurrectBlockedRow` — existing row is blocked, its parent still failed; re-enqueue (autosave) leaves it blocked.

`OutboxReconcilerTest.kt`:

6. `failedCreateVisitWithSyncedEntityIsForceCompleted` — failed (not pending) `create_visit` row + `visitDao.getByIdOnce(...).isSynced == true` → `forceComplete` called.
7. `forceCompleteRevivesBlockedDependents` — after force-completing the parent, `reviveBlockedDependents(parent.id)` invoked (or dependents reset), and non-blocked failed rows are untouched.

DAO-level (if a Room instrumentation-free test isn't feasible with the current setup, encode as a unit test against the SQL string or add to an existing Robolectric/Room test if one exists — check `app/src/test` first):

8. Blocked rows (`failed`, `attempts=max`) are excluded from `getPendingCount` and `getRetryable`, included in `getTerminallyFailedCount`.

## Acceptance criteria

- [ ] All new tests pass; full `:app:testDebugUnitTest` suite green.
- [ ] Invariant **I3** holds by construction: enumerate the states in a table in the PR description (pending-retryable / failed-exhausted / failed-blocked / completed) and show which query surfaces each.
- [ ] Room migration applies cleanly on a database created by the previous version (test with an on-device upgrade or a migration test if the harness exists).
- [ ] No change to server contracts, no change to enqueue call sites in repositories.
