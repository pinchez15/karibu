# Sync Drain — zero retryable pending on connectivity

**Date:** 2026-07-09
**Symptom:** Lead tester's device (1.0.31, versionCode 33) shows 50–60 "pending syncs" daily while on wifi + data. Data recorded on Android is not reaching the web app (lab tech at laptop) reliably.
**Investigation:** Full root-cause session 2026-07-09 (code-verified, file:line cited below). This plan supersedes the "cloud-primary / offline-degraded" architecture review where they conflict: the dominant cause is **queue accounting**, not the write path, so we fix drain mechanics first and defer the blocking-write UX bet.

## Root causes (ranked)

| # | Root cause | Where | Fixed by |
|---|-----------|-------|----------|
| 1 | `markDependentsFailed` cascades children to `status='failed'` **without** `attempts=maxAttempts`. They count as "pending" in the banner forever (`getPendingCount` counts `failed` rows with `attempts < max`), are skipped every run by the dependency gate, never appear in "Needs attention", and are never reconciled (`OutboxReconciler` reads only `status='pending'`). "Retry all" re-runs the parent, which permanently fails again and re-cascades — a futility loop. | `SyncEngine.kt:483`, `SyncQueueDao.kt:33`, `OutboxReconciler.kt:41` | **WP-A** |
| 2 | WP2's honest-connectivity fix (`isConnected()` vs validated `isOnline()`) was applied only inside `SyncEngine`. All **66** repository direct-write gates and the reconnect drain trigger still use `isOnline()` (NET_CAPABILITY_VALIDATED). Flapping validation on clinic wifi routes every write into the outbox and delays drains. | `data/repository/*` (66 sites), `PullSyncManager.kt:40` | **WP-C** |
| 3 | Unshipped regression on main (`e996c24`, NOT in 1.0.31): `checkInPatient` offline/fallback path queues `check_in_patient` with **no client visit id and no idempotency**. Replay duplicates visits; the server-assigned visit UUID is never remapped locally, so all downstream ops reference a visit that never exists server-side → permanent 400s → cascades. Payload is also built by string interpolation (newlines/backslashes in chief complaint produce malformed JSON → infinite transient retry). | `VisitRepository.kt:374-434`, `095_wp2_day_line_checkin.sql:75` | **WP-B** (gates next APK) |
| 4 | Lab/pharmacy order enqueues set no `dependsOn`; the vitals/note dependency resolver only matches `create_visit` rows, so check-in-created visits produce unordered chains. | `VisitRepository.kt:492-502, :704-714`, `NoteRepository.kt:56-60` | **WP-D** |
| 5 | Server RPCs `RAISE EXCEPTION` (PostgREST 400 → classified PERMANENT) on state conflicts, with existence checks *before* the `sync_operations` idempotency gate; `rpc_create_care_task` replay queries a nonexistent `client_op_id` column and 400s on every genuine replay. | `091:102`, `075:170`, `099:55` | **WP-E** |
| 6 | `SyncQueueHelper.enqueue` dedupe resets `attempts=0, status='pending'` on every autosave, resurrecting cascade-failed rows into permanently-blocked "pending". | `SyncQueueHelper.kt:22-32` | **WP-A** |
| 7 | No release-build sync telemetry (`SyncDebugLogger` is DEBUG-only; beta happens to ship debug builds today, but release rollout would be blind). | `SyncDebugLogger.kt:56` | **WP-F** |

## Work packages and sequencing

```
Phase 1 (parallel, gates next APK):   WP-A  queue accounting + reconciliation
                                      WP-B  check_in_patient idempotency (server + client)
Phase 2 (parallel, after Phase 1):    WP-C  unified cloudReady gate + direct-write 401 retry
                                      WP-D  dependency chains for orders          [merge after WP-C]
Phase 3 (server-only, anytime):       WP-E  server replay tolerance
Phase 4 (release):                    WP-F  backlog recovery, observability, ship 1.0.32
```

- WP-A and WP-B touch disjoint files and can run as parallel agents.
- WP-C and WP-D both touch `VisitRepository.kt`; land WP-C first, rebase WP-D.
- WP-E is pure SQL; deploy migrations 100–101 **before** distributing the new APK.
- WP-F is the integration/release pass and runs last.

Each WP file is self-contained: an agent should be able to execute it without reading the others (cross-references are informational).

## Invariants (system-level acceptance)

These are the definition of "fully fixed". WP-F contains the manual pilot script that walks them.

- **I1 — Structural durability:** with connectivity, after "register patient → check in → vitals", the `patients` and `visits` rows exist in Supabase **with the same UUIDs the device generated**, before the clinician leaves the vitals screen.
- **I2 — Outbox drains:** with connectivity and no in-flight action, retryable `sync_queue` count reaches **0 within 30 seconds** of the last user action.
- **I3 — No invisible stuck state:** every `sync_queue` row is, at all times, exactly one of: *retryable soon* (counted in the banner), *terminally failed / blocked* (visible under "Needs attention"), or *completed*. No row may be simultaneously uncounted as failed and unprocessable as pending.
- **I4 — Offline honesty:** offline, the UI says "Saved on device", the outbox may grow; on reconnect, a single-patient workflow drains within **2 minutes** without user action.
- **I5 — Cross-surface truth:** within 60 seconds of I1, the web visit chart shows the chief complaint (and note draft if entered) — the lab tech at the laptop sees the visit.
- **I6 — Replay safety:** re-sending any queued op (same `client_op_id` / client id) is a 2xx no-op server-side. No duplicates, no 400s from replays.

## Test commands

- **Android unit tests:** `JAVA_HOME="$(/usr/libexec/java_home -v 17 2>/dev/null || echo /Applications/Android\ Studio.app/Contents/jbr/Contents/Home)" ./gradlew :app:testDebugUnitTest` from `apps/android/` (Gradle needs the Android Studio JBR in this environment). CI: `android-ci.yml`.
- **SQL tests:** `psql "$DATABASE_URL" -f packages/supabase/tests/<file>.sql` against a local `supabase db reset` database. Convention: `BEGIN; … DO-block assertions … ROLLBACK;` (see `tests/rpc_idempotency.sql`).
- Every WP adds tests that **fail before its change and pass after** — agents must demonstrate both (run the new test against unmodified code first, or assert on the pre-fix behavior in a comment with the failing output).

## Non-goals (explicitly deferred)

- **Blocking navigation until server ACK** (the cloud-primary review's riskiest element). Deferred until post-fix field numbers show drains are still insufficient. The write contract (direct RPC when ready, outbox as fallback) is enforced by WP-C without blocking UX.
- **Composite `register + check_in` RPC** (arch review Phase B). WP-B + WP-D shrink the chain and make it safe; the composite RPC remains a good follow-up, tracked separately.
- **Full `ClinicalWriteCoordinator` abstraction.** WP-C's shared 401-retry direct-write helper is the seed; consolidating all 20 repositories behind one coordinator is a refactor to schedule after the pilot is stable.
- PostHog wiring for sync metrics (WP-F leaves structured logs release-safe; dashboard wiring is follow-up).

## Evidence still wanted (do not block on it)

Beta ships `assembleDebug`, so the tester's device is writing PHI-redacted NDJSON run summaries. Ask the lead tester to open the sync sheet → **"Share debug log"** and send it. Use it to validate the post-fix apportionment (how many of the 50–60 were cascade-blocked vs backoff vs genuinely failing). The plan does not depend on it; WP-A's Room data migration re-baselines the historical rows regardless.
