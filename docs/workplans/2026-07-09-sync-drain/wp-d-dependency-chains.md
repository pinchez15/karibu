# WP-D — Dependency chains: orders must be linearized behind their visit

**Priority:** P1, Phase 2. Land **after** WP-C (both touch `VisitRepository.kt`; rebase this one).
**Branch suggestion:** `fix/wp-d-order-dependency-chains`
**Files touched:** `data/repository/VisitRepository.kt`, `data/repository/VitalsRepository.kt`, `data/repository/NoteRepository.kt`, new `data/sync/SyncDependencyResolver.kt`, tests.

## Problem (verified)

1. **Orders are orphans.** `submitLabOrder` (`VisitRepository.kt:704-714`), `submitPharmacyOrder` (`:492-502`), and every verb routed through `enqueueVisitRpc` (`:1100-1110`) build `SyncQueueEntry` with `dependsOn = null`. Queued offline against a not-yet-synced visit, they race `create_visit`/`check_in_patient` in the queue: if they run first, the server raises "Visit not found" → 400 → PERMANENT → dead-letter + cascade (see WP-A). The engine's topological sort only orders what `depends_on` declares.
2. **The resolver is blind to check-ins.** `getPendingVisitSyncDependency` (`NoteRepository.kt:56-60`, duplicated at `VitalsRepository.kt:46`) matches only `operationType == "create_visit"`. Visits created via the check-in split enqueue `operationType == "queue_op"` (`VisitRepository.kt:425`), so vitals and notes for a locally-checked-in patient get `dependsOn = null` — same race.

Keep the pivot doc's rule in force: **minimal `depends_on` — only true FK ordering** (`ehr-pivot-implementation.md` §3.3). This WP adds exactly the missing FK edges (op → its visit), nothing else. No autosave chains, no cross-entity chains.

## Tasks

### D1 — Shared resolver

New `data/sync/SyncDependencyResolver.kt`:

```kotlin
/**
 * Resolves the queue entry a visit-scoped op must wait for: the pending
 * create_visit OR check-in queue_op that creates this visit server-side.
 * Null when the visit already exists on the server (nothing to wait for).
 * Minimal-depends_on rule (ehr-pivot-implementation.md §3.3): FK ordering only.
 */
@Singleton
class SyncDependencyResolver @Inject constructor(
    private val syncQueueDao: SyncQueueDao,
) {
    suspend fun pendingVisitDependency(visitId: String): String? {
        syncQueueDao.getByEntityAndOperation(visitId, "create_visit")
            ?.takeIf { it.status != "completed" }?.let { return it.id }
        return syncQueueDao.getByEntityAndOperation(visitId, "queue_op")
            ?.takeIf { it.status != "completed" && it.payload.contains("\"check_in_patient\"") }
            ?.id
    }
}
```

(The dedupe key `(entityId, operationType)` guarantees at most one row per pair — `SyncQueueHelper.kt:21` — so these lookups are exact. The payload check distinguishes check-in from other queue ops on the same visit; after WP-B the check-in payload is serialized JSON so the quoted-string match is stable.)

### D2 — Replace the duplicated resolvers

`NoteRepository.kt:56-60` and `VitalsRepository.kt:46`: delete the private copies, inject `SyncDependencyResolver`, keep the existing `effectivePredecessor = predecessorSyncId ?: resolver.pendingVisitDependency(visitId)` semantics unchanged.

### D3 — Wire orders and remaining visit-scoped enqueues

Set `dependsOn = predecessorSyncId ?: resolver.pendingVisitDependency(visitId)` on the `SyncQueueEntry` built in:

- `submitLabOrder` (`VisitRepository.kt:704-714`)
- `submitPharmacyOrder` (`:492-502`)
- `enqueueVisitRpc` (`:1100-1110`) — this covers all `rpc_start_lab*`, `rpc_record_lab*`, dispense, send-back verbs
- `markDocumentationComplete` fallback (`:1156`) — currently caller-supplied only; add the resolver fallback
- `checkInPatient`'s own entry stays rootless (it IS the visit creator)

Direct-write short-circuit: where these methods currently attempt a direct RPC when online, extend the guard to skip the direct attempt when `pendingVisitDependency(visitId) != null` (same pattern as `createVisit`'s `patientSyncEntryId == null` check at `VisitRepository.kt:319` — a direct order against an unsynced visit is a guaranteed "Visit not found").

### D4 — Cascade-on-arrival interaction (WP-A)

`SyncQueueHelper.enqueue` (post-WP-A) blocks a new row whose parent is already terminally failed. No extra work here — but add one test proving an order enqueued after its visit-creator died is blocked, not left pending (test 5).

## Tests

New `SyncDependencyResolverTest`:

1. `matchesPendingCreateVisit` — pending `create_visit` row for the visit → its id returned.
2. `matchesPendingCheckInQueueOp` — pending `queue_op` with `check_in_patient` payload → its id; a `queue_op` with a different rpc (e.g. `assign_to_nurse`) → null.
3. `completedCreatorReturnsNull` — completed `create_visit` → null.

`VisitRepository`-level (extend `VisitRepositoryCheckInTest.kt` or new file, MockK):

4. `offlineLabOrderChainsToVisitCreator` — offline visit via check-in, then `submitLabOrder` → enqueued entry has `dependsOn == checkInEntryId`. Same assertion for `submitPharmacyOrder` and one `enqueueVisitRpc` verb. (FAILS on current code: `dependsOn == null`.)
5. `orderAfterDeadVisitCreatorIsBlocked` — visit-creator row terminally failed → enqueued order is written blocked (WP-A semantics), never attempted.
6. `directOrderSkippedWhenVisitPending` — online, but visit has a pending creator → no direct RPC attempted, entry enqueued with `dependsOn` set.

`SyncEngineTest` (integration of ordering):

7. `topologicalSortRunsCreatorBeforeOrder` — queue containing [order(dependsOn=checkin), checkin] in that created_at order → engine processes check-in first, then the order in the same run (assert call order on the mocked api).

## Acceptance criteria

- [ ] All new tests pass; suite green.
- [ ] Grep check in PR: every `SyncQueueEntry(` construction in `data/repository/` for a visit-scoped op either sets `dependsOn` via the resolver or has a comment stating why not (patient-creator, visit-creator, patient-scoped ops).
- [ ] One offline patient workflow (register → check-in → vitals → note → lab order → pharmacy order) produces a queue whose topological order replays cleanly against a live server in one run (manual or instrumented — part of WP-F's pilot script, invariant **I4**).
