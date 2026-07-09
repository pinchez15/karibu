# WP-C — Unified cloudReady gate + direct-write 401 retry

**Priority:** P0, Phase 2 (after WP-A/WP-B merge).
**Branch suggestion:** `fix/wp-c-cloudready-gate`
**Files touched:** all `data/repository/*.kt` with write paths (~20 files, mechanical), `util/NetworkMonitor.kt`, `data/sync/PullSyncManager.kt`, `ui/MainActivity.kt`, new `data/remote/DirectWrite.kt`, new audit script `scripts/audit-android-online-gate.sh`, tests.

## Problem (verified)

WP2 D1 established that `isOnline()` (requires `NET_CAPABILITY_VALIDATED`) is a dishonest gate — Android's validation probe flaps on congested/captive networks — and moved the **SyncEngine** to `isConnected()` (`SyncEngine.kt:79`, `NetworkMonitor.kt:55-63`). But:

- All **66** repository call sites still gate direct writes on `isOnline()` (`grep -rn "isOnline()" data/repository/` → 66; `isConnected()` → 0). On unvalidated wifi, every write silently enqueues, creating the outbox inflow and chain exposure this whole plan exists to reduce. Example sites: `PatientRepository.kt:180`, `VisitRepository.kt:319`, `NoteRepository.kt:176`, `VitalsRepository.kt:98`, `InpatientRepository.kt:838-844`.
- The reconnect drain trigger watches `isOnlineFlow` (`PullSyncManager.kt:40`) — on a never-validating network the offline→online transition never fires, so the drain relies solely on enqueue-triggered and 15-minute periodic workers.
- App foreground (`MainActivity.kt:86-90`) runs `pullAll()` only — **no push drain on resume**.
- Direct writes have **no 401 handling**: a stale Clerk JWT (>1h idle) makes the direct RPC fail and silently fall through to the outbox (empty catch blocks), where the engine then refreshes and retries — needless queue churn on the first write after every idle period.

## Design

- **`cloudReady` = `isConnected()`.** Token freshness is handled per-call by the retry helper (below), not baked into the gate — a gate that also checks token age would silently skip direct writes instead of refreshing.
- **One shared direct-write helper** so 401-refresh-retry exists in exactly one place. This is the seed of the arch review's `ClinicalWriteCoordinator`; do not build the full coordinator here.

## Tasks

### C1 — `NetworkMonitor`: add `isConnectedFlow`

Mirror `isOnlineFlow` (`NetworkMonitor.kt:71-101`) but emitting `currentStatus().isConnected` / `statusFromCapabilities(...).isConnected`, `distinctUntilChanged()`. Keep `isOnlineFlow` for UI (connection-quality display, `isGoodForAi`).

### C2 — Repository gate flip (mechanical, complete)

In `data/repository/**`, replace every `networkMonitor.isOnline()` with `networkMonitor.isConnected()`. This includes read-path prefetch gates (`getPatientTimeline`, `findDuplicateCandidates`, `refreshPatients`, etc.) — they already fail soft (empty list / cached data), and attempting on an unvalidated network is strictly better than not attempting. Exceptions (leave untouched):

- Any usage of `isGoodForAi` / `ConnectionQuality` (quality-based decisions, e.g. dictation upload).
- UI-layer `isOnline` state flows (`MainViewModel.isOnline` stays validated for the connectivity chip).

### C3 — Enforcement script

Add `scripts/audit-android-online-gate.sh` (mirror the precedent `scripts/audit-android-postgrest.sh`, which is wired per `docs/ehr-pivot-implementation.md` §"No Android write uses direct PostgREST"): fail with a file:line listing if `isOnline()` appears anywhere under `apps/android/app/src/main/java/com/karibuhealth/app/data/repository/`. Wire it into `android-ci.yml` alongside the existing audit step.

### C4 — Direct-write 401 retry helper

New `data/remote/DirectWrite.kt`:

```kotlin
/**
 * Wraps a direct (non-outbox) RPC attempt: on 401, refresh the Clerk token
 * once and retry the same call once. Any other failure returns as-is —
 * callers keep their existing fall-through-to-outbox behavior.
 */
class DirectWriteExecutor @Inject constructor(
    private val tokenRefresher: TokenRefresher,
) {
    suspend fun <T> run(block: suspend () -> Response<T>): Response<T> {
        val first = block()
        if (first.code() != 401) return first
        if (!tokenRefresher.refreshToken()) return first
        return block()
    }
}
```

Apply it to the **structural** direct-write sites (the ones whose silent fall-through creates chains): `PatientRepository.createPatient`, `VisitRepository.createVisit` / `checkInPatient` / `submitPharmacyOrder` / `submitLabOrder` / `enqueueVisitRpc` / `markDocumentationComplete`, `NoteRepository` sign/finalize/upsert paths, `VitalsRepository.recordVitals`, `InpatientRepository.pushOrQueue`, `AncRepository`, `HivTbRepository`, `ReferralRepository`, `CareTaskRepository`, `RegionProtocolRepository`. (Autosave `upsertProviderNote` is included automatically via NoteRepository — the helper adds no latency in the non-401 case.)

Note: `TokenRefresher` lives in `data/sync`; injecting it here is fine (it's an interface bound to `ClerkAuthManager`).

### C5 — Reconnect + resume drains

1. `PullSyncManager.startObserving` (`PullSyncManager.kt:40`): collect the new `isConnectedFlow` instead of `isOnlineFlow`.
2. `MainActivity` STARTED block (`MainActivity.kt:86-90`): alongside `pullAll()`, enqueue the immediate push worker (inject `SyncQueueHelper` and call `scheduleImmediateSync()`, or enqueue `SyncWorker.buildImmediateRequest()` with `APPEND_OR_REPLACE` directly — match `SyncQueueHelper.kt:42-51`).

## Tests

`NetworkMonitorTest` (exists per WP2 test #7 — extend; it targets the pure `statusFromCapabilities`):

1. `internetWithoutValidatedIsConnectedNotOnline` — capabilities with INTERNET but not VALIDATED → `isConnected == true`, `isOnline == false`.

New `DirectWriteExecutorTest`:

2. `non401PassesThrough` — 500 response returned unchanged; `refreshToken` never called.
3. `on401RefreshesAndRetriesOnce` — first call 401, refresh true, second call 200 → 200 returned; block invoked exactly twice.
4. `on401RefreshFailureReturnsOriginal` — refresh false → original 401 returned; block invoked once.

New `PatientRepositoryDirectWriteTest` (MockK, mirror existing fixture style):

5. `unvalidatedNetworkStillAttemptsDirectWrite` — `isConnected=true`, direct RPC mocked 200 → **no** `syncQueueHelper.enqueue` call. (This test FAILS on current code where the gate is `isOnline()` — mock `isOnline=false`.)
6. `staleTokenDirectWriteRecoversWithoutEnqueue` — first RPC 401, refresher succeeds, retry 200 → no enqueue.

Audit script:

7. Run `scripts/audit-android-online-gate.sh` in CI — passing is the test.

## Acceptance criteria

- [ ] `grep -rn "isOnline()" apps/android/app/src/main/java/com/karibuhealth/app/data/repository/` → 0 matches; CI audit step enforces it permanently.
- [ ] All new tests pass; suite green.
- [ ] Manual: airplane-mode → wifi-without-internet (validation fails) → writes still attempt direct RPC (observe via logcat `rpc_error`/success), and on a real connection the outbox drains on app resume without any user action (invariant **I2**).
- [ ] No behavioral change to offline path: `isConnected=false` still writes Room + enqueues exactly as before (invariant **I4**).
