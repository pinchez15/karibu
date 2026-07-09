# WP-B — check_in_patient: client-supplied visit id + idempotency (blocks next APK)

**Priority:** P0. The check-in split (`e996c24`) is on main but NOT in the shipped 1.0.31 — this WP must land **before** the next beta APK, or every flaky-wifi check-in becomes a duplicate-visit + permanent-400 generator.
**Branch suggestion:** `fix/wp-b-checkin-idempotency`
**Files touched:** `packages/supabase/migrations/100_checkin_idempotency.sql` (new), `packages/supabase/tests/checkin_idempotency.sql` (new), `apps/android/.../data/repository/VisitRepository.kt`, `apps/android/.../data/sync/SyncEngine.kt`, new `VisitRepositoryCheckInTest.kt`.

## Problem (verified)

1. `check_in_patient` (latest def `095_wp2_day_line_checkin.sql:75`) does a plain `INSERT ... RETURNING` (`095:135`) — no `p_client_op_id`, no client-supplied id, no `ON CONFLICT`. A replayed queue op silently creates a **duplicate visit**.
2. The Android offline/fallback path (`VisitRepository.kt:390-434`) creates a local visit with a locally-generated UUID but the queued RPC payload (`:428`) carries no visit id. When the queue op eventually syncs, the server creates a visit with a **different** UUID; `syncQueueOperation` (`SyncEngine.kt:726-758`) ignores the response body. The local visit row stays `isSynced=false` forever, the pull creates a *second* (server) visit locally, and every downstream op keyed on the local visit UUID (vitals, notes, orders) references a visit that never exists server-side → FK/existence RAISE → 400 → PERMANENT → cascade (see WP-A).
3. The queue payload at `VisitRepository.kt:428` is built by string interpolation with hand-rolled quote escaping. A chief complaint containing a newline or backslash produces malformed JSON → `SerializationException` in `syncQueueOperation` → classified TRANSIENT → retried forever.

## Tasks

### B1 — Migration `100_checkin_idempotency.sql`

Redefine `check_in_patient` with two new trailing parameters, both defaulted so existing callers (web, old APKs) are unaffected. PostgREST cannot disambiguate overloads — `DROP FUNCTION` the exact old signature first (find it in `095_wp2_day_line_checkin.sql:75`; follow the drop-then-recreate precedent from `a21ad2c` / migration 095).

New signature (keep all existing params in order, append):
```sql
p_visit_id uuid DEFAULT NULL,
p_client_op_id uuid DEFAULT NULL
```

Body changes (keep all existing behavior — day line, queue position, department — intact):

1. **Replay gate first:** if `p_client_op_id` is not null and `sync_op_already_applied(p_client_op_id)`, return the previously created visit id: `SELECT entity_id::uuid FROM sync_operations WHERE id = p_client_op_id` (column is `id`, NOT `client_op_id` — see the rpc_create_care_task bug in WP-E). Return type must stay identical to today (the visit id).
2. **Client id honored:** `v_visit_id := COALESCE(p_visit_id, gen_random_uuid());` and `INSERT ... (id, ...) VALUES (v_visit_id, ...) ON CONFLICT (id) DO NOTHING`. If the insert conflicts (row already there from a direct write that timed out client-side), return `v_visit_id` without error.
3. **Record the op:** `PERFORM sync_op_record(p_client_op_id, <clinic>, <staff>, 'check_in_patient', 'visits', v_visit_id)` (match the arg order used by other RPCs, e.g. `091_pharmacy_submit_guard.sql`). Only when `p_client_op_id` is not null.
4. Preserve `SECURITY DEFINER`, `search_path`, and the staff/clinic assertion exactly as in 095.

### B2 — Android: thread the visit id + op id through both paths

In `VisitRepository.checkInPatient` (`VisitRepository.kt:354-435`):

1. Generate `visitId = UUID.randomUUID().toString()` and `opId = UUID.randomUUID().toString()` **before** the online attempt.
2. Direct path: add `p_visit_id` and `p_client_op_id` to `rpcParams`. On success the returned id now equals `visitId` — keep the existing `refreshVisit` + local upsert flow (it will match the local row instead of duplicating).
3. Offline/fallback path: build the local `Visit` with `id = visitId` (same UUID as the direct attempt — the op id makes a timed-out-but-landed direct call a safe replay).
4. **Replace the interpolated payload string** (`:428`) with a serialized object: `buildJsonObject { put("rpc", "check_in_patient"); put("params", buildJsonObject { ... including p_visit_id and p_client_op_id ... }) }` encoded via the injected `json`. Note: also fix `p_staff_id` — today a null `staffId` interpolates as the literal string `"null"`; with `buildJsonObject`, omit the key when null.
5. Use `opId` as the `SyncQueueEntry.id` so the queue row id and the RPC's `p_client_op_id` are the same value (matches the `create_patient` pattern, `PatientRepository.kt:178-182`).

### B3 — SyncEngine: mark the visit synced after queued check-in lands

In `syncQueueOperation` (`SyncEngine.kt:726`), after a successful `check_in_patient` response, call `markVisitSyncedIfQuiet(entry)` (entity id is the visit id and now matches the server row). Other queue RPCs unchanged.

### B4 — Legacy-payload tolerance

Old queue rows (from a pre-WP-B build) have payloads without `p_visit_id`. `syncQueueOperation` passes params through opaquely, so they still work — but they will still create server-side visits with fresh ids (the old bug). Do NOT try to remap those; WP-A's reconciler + "Mark synced" is the recovery path. Add a one-line comment in `syncQueueOperation` noting this.

## Tests

### SQL — `packages/supabase/tests/checkin_idempotency.sql`

Follow the house style (`tests/rpc_idempotency.sql`): `BEGIN; … ROLLBACK;`, DO-block assertions, seed minimal clinic/staff/patient rows inside the transaction. Assert:

1. **Signature:** `to_regprocedure` for the new signature exists; the old signature no longer exists.
2. **Client id honored:** call with `p_visit_id := :fixed_uuid` → the visits row has that exact id.
3. **Replay is a no-op:** call twice with the same `p_client_op_id` and `p_visit_id` → exactly **one** visits row for the patient today; second call returns the same visit id; exactly one `sync_operations` row.
4. **Conflict tolerance:** insert the visit row first (simulating a landed-but-timed-out direct write), then call with the same `p_visit_id` + new op id → no exception, returns the id, no duplicate.
5. **Back-compat:** call with neither new param → visit created with a generated id (old behavior).

Run: `psql "$DATABASE_URL" -f packages/supabase/tests/checkin_idempotency.sql` after `supabase db reset`.

### Android — new `app/src/test/.../data/repository/VisitRepositoryCheckInTest.kt`

MockK style (mirror `SyncEngineTest` fixtures; mock `SupabaseApi`, `VisitDao`, `SyncQueueDao`, `SyncQueueHelper`, `NetworkMonitor`):

6. `directCheckInSendsVisitIdAndOpId` — online success path: capture `rpcParams`; assert `p_visit_id` and `p_client_op_id` present and the local visit upserted with the same id.
7. `offlineCheckInQueuesSameVisitId` — offline: the enqueued `SyncQueueEntry` payload, decoded with kotlinx `Json`, contains `params.p_visit_id == visit.id` and `params.p_client_op_id == entry.id`; the local visit row uses the same id.
8. `payloadSurvivesHostileChiefComplaint` — chief complaint `"line1\nline2 \"quoted\" \\slash"` → payload decodes cleanly via `Json.decodeFromString(JsonObject.serializer(), payload)` (this test FAILS against the current interpolation code — state the failing output in the PR).
9. `nullStaffIdOmittedFromPayload` — `staffId = null` → params object has no `p_staff_id` key (current code emits the string `"null"`).

`SyncEngineTest.kt`:

10. `queuedCheckInMarksVisitSyncedWhenQuiet` — successful `check_in_patient` queue op with no active siblings → `visitDao.updateSyncState(entry.entityId, true)`.

## Acceptance criteria

- [ ] SQL test file passes against a reset local DB; migration applies cleanly on top of 099.
- [ ] All new Android tests pass; suite green.
- [ ] Web check-in (which calls `check_in_patient` without the new params) is verified unaffected — grep `apps/web` for the call site and confirm the param list still matches.
- [ ] Invariant **I1** holds for the check-in path: device UUID == server UUID.
- [ ] Migration 100 is deployed to the Supabase project **before** any APK containing B2 is distributed (old server + new client would 404 on the named params). State this ordering in the PR description.
