# WP-F — Rollout: backlog recovery, release observability, ship 1.0.32, verify invariants

**Priority:** P0 finish line. Runs after WP-A…WP-E are merged (WP-E deployed server-side first).
**Branch suggestion:** `chore/wp-f-sync-drain-release`
**Files touched:** `data/sync/SyncDebugLogger.kt`, `apps/android/app/build.gradle.kts` (version bump), `docs/ehr-pivot-implementation.md` (§7 contract update), release + pilot checklists below.

## Tasks

### F1 — Field evidence (do first, independent of code)

Ask the lead tester to open the sync banner → details sheet → **"Share debug log"** and send the export (beta ships `assembleDebug`, so `SyncDebugLogger` has been recording; the export is PHI-redacted by the `SAFE_DATA_KEYS` allowlist, `SyncDebugLogger.kt:34-43`). From the `queue_run_summary` lines, record the pre-fix apportionment of the 50–60: `skippedDependency` vs `transientFail` vs `permanentFail` vs backoff-idle. Save the numbers (not the raw log) to this directory as `pre-fix-baseline.md`. This is the before-photo for the pilot sign-off.

### F2 — Release-safe run telemetry

`SyncDebugLogger.log` returns early on release builds (`SyncDebugLogger.kt:56`). Beta happens to ship debug builds today, but a Play/production rollout would be blind. Change:

1. Add a `releaseSafe: Boolean = false` parameter to `log(...)`. When `BuildConfig.DEBUG` is false, write the line only if `releaseSafe` is true (same allowlist redaction applies — it already strips error bodies and payloads).
2. Mark exactly two call sites `releaseSafe = true`: the per-run summary (`SyncEngine.logRunSummary`, message `queue_run_summary`) and the per-entry failure (`SyncEngine.logSyncFailure`, message `sync_failed` — note its `error` key is already excluded by the allowlist, so only op/entity/attempt metadata lands on disk).
3. Keep the 512KB trim. The "Share debug log" button already works in release UI (it reads the same file).

Tests (`SyncDebugLoggerTest`, new): with `DEBUG=false` simulated (extract the flag into an injectable/overridable property so it's testable), `releaseSafe=true` writes, `releaseSafe=false` doesn't; redaction drops non-allowlisted keys in both modes.

### F3 — Codify the write contract in the pivot doc

Update `docs/ehr-pivot-implementation.md` §7 (and §2.7 wording if it still says "all writes land in Room first"):

- **Contract:** Room is always updated, but not always first. When `isConnected()`: direct RPC (with one 401 refresh-retry) → Room reflects server truth; outbox row only on failure. When not connected: Room + outbox, drain on reconnect/resume/enqueue/periodic.
- Document the queue-state model from WP-A (pending-retryable / failed-exhausted / failed-blocked with the `blocked:` marker / completed) and which UI surface shows each.
- Note the two enforcement scripts (`audit-android-postgrest.sh`, `audit-android-online-gate.sh`).

### F4 — Version bump + distribute

1. `apps/android/app/build.gradle.kts`: `versionCode 33 → 34`, `versionName "1.0.31" → "1.0.32"`.
2. Confirm migrations 100 + 101 are applied to the Supabase project (`supabase db push` from `packages/supabase`) **before** distributing.
3. `apps/android/scripts/upload-beta.sh "Sync drain: honest pending count, check-in idempotency, cloudReady gate. Please tap Retry all once after updating."` (service-account key at `~/Karibu Ops/...`; group `beta-testers`).
4. Full suite green before push: `:app:testDebugUnitTest` + both SQL test files + both audit scripts.

### F5 — Tester-device backlog recovery (one-time, guided)

No destructive resets. Sequence on the lead tester's device after updating to 1.0.32:

1. App update applies the WP-A Room migration → historical limbo rows move to "Needs attention" with `blocked:` reasons. Banner count immediately reflects only real retryable work.
2. First sync run + pull triggers the WP-A reconciler → creates that actually landed server-side auto-clear and revive their blocked dependents.
3. Tester taps **Retry all** once → surviving parents replay against the WP-E-tolerant server (replays are 2xx no-ops); WP-B-era `check_in_patient` rows from old payloads may create their visit server-side now.
4. Whatever remains in "Needs attention" is a real, finite list. Review it remotely via the debug log + web app cross-check; use per-entry **Mark synced** for rows verified present on the server. Target: **0** within one clinic day.
5. Capture the post-fix `queue_run_summary` and save as `post-fix-result.md` next to the baseline.

### F6 — Pilot verification script (invariants I1–I6)

Run on one device at the clinic (or remotely guided), on clinic wifi:

| Step | Action | Pass condition |
|---|---|---|
| 1 (I1) | Register a new patient, check in, record vitals | Patient + visit visible in Supabase (web app) with the device's UUIDs before leaving the vitals screen |
| 2 (I2) | Wait 30s idle | Sync banner shows 0 pending |
| 3 (I5) | Open the visit on the web app as lab/another role | Chief complaint + note draft visible within 60s of step 1 |
| 4 (I4) | Airplane mode → full workflow (register → check-in → vitals → note → lab order → pharmacy order) → airplane off | UI said "Saved on device" while offline; queue drains to 0 within 2 min of reconnect, no user action |
| 5 (I6) | During step 4's drain, force-kill the app mid-sync, reopen | Drain completes; no duplicate patient/visit on the web |
| 6 (I3) | Pull the debug log | Every non-completed row is either counted in the banner or listed under Needs attention; `skippedDependency` returns to 0 by the final run |

Record results in `post-fix-result.md`. **Pilot sign-off requires all six passing plus the lead tester's device at 0 pending / 0 unexplained needs-attention.**

## Acceptance criteria

- [ ] F1 baseline and F5/F6 results captured in this directory.
- [ ] 1.0.32 distributed to the beta-testers group; migrations 100–101 live first.
- [ ] `ehr-pivot-implementation.md` §7 matches shipped behavior (no doc/code contradiction remains).
- [ ] Lead tester's device: banner 0 on connectivity; daily screenshot shows it stays 0 for three consecutive clinic days before rolling to the other 12 staff.
