# Patient-Centered EHR — Implementation Reference

> **Status:** Authoritative implementation guide for the pre-launch big-bang pivot.  
> **Audience:** Engineers and AI agents implementing this work.  
> **Scope:** Full replacement of queue-as-spine architecture with patient-chart-first EHR.  
> **Data:** Pre-launch — test data only; destructive schema/client changes are acceptable.

**Related docs (historical context, not execution source of truth):**

- `docs/patient-centered-architecture-plan.md` — original strategic plan
- `docs/offline-first-refactor.md` — offline-first rationale and known sync defects
- `docs/hc3-rollout-plan.md` — rollout context

When this doc conflicts with older plans, **this doc wins**.

---

## 1. Executive summary

Karibu started as a **clinic queue tool** (intake → clinician → payment → done). It is now a **mobile EHR** for remote Ugandan HC IIIs: intermittent cell data, power loss at desktop stations, multiple staff touching the same patient the same day, searchable longitudinal records, and lab/pharmacy on **Android phones** when PCs are off.

### What stays

- Postgres / Supabase
- Clerk auth + JWT → Supabase RLS
- Visual design language (Karibu UI tokens, cards, typography)
- Core tables: `patients`, `visits` (as encounters), `provider_notes`, `patient_vitals`, `payments`, stock tables, `care_tasks`

### What changes

| Old | New |
|-----|-----|
| Queue state drives lifecycle | **Patient chart** is the hub |
| Payment gates “done” | **Billing module** — optional, async |
| Pharmacy after note finalized | **Pharmacy when order submitted** (note may stay open) |
| Mixed REST + RPC writes | **All writes via SECURITY DEFINER RPCs** |
| Per-keystroke outbox chains | **One outbox row per intent** (upsert in place) |
| Android lab/pharm read-only | **Lab + pharmacy modules on Android** (same app) |
| Worklists = truth | Worklists = **operational views**; chart = clinical truth |

---

## 2. Locked product decisions

These are **not open for re-litigation** during implementation unless the product owner explicitly changes them.

### 2.1 Pharmacy timing

**Problem:** Clinician may keep a **draft/open note** while waiting for lab results before final diagnosis, but still wants pharmacy to dispense (e.g. symptomatic meds, starter antibiotics).

**Decision:**

- Pharmacy queue is triggered when the clinician **submits a pharmacy order**, not when `documentation_complete = true`.
- Note may remain `draft` / unsigned; encounter may remain clinically open.
- Implement an explicit signal, e.g. `pharmacy_order_submitted_at TIMESTAMPTZ` (or `pharmacy_order_status = 'submitted'`) set by clinician action **“Send to pharmacy”**.
- Pharmacy queue predicate: `medications` non-empty **AND** pharmacy order submitted **AND** `dispensing_status` not terminal — **NOT** `documentation_complete`.

**Web today (must change):** `apps/web/src/app/dashboard/pharmacy/page.tsx` filters `.eq('documentation_complete', true)`.  
**RPC today (must change):** `rpc_worklist_needs_pharmacy` requires `documentation_complete = TRUE` (migration 041).

### 2.2 Offline pharmacy stock

**Decision:**

- Allow **dispense offline**.
- **Decrement stock locally** in Room immediately (optimistic).
- Queue **`rpc_record_dispense`** (or equivalent) with stock movements for sync.
- On reconnect: upsert server stock; reconcile conflicts (single dispenser device per site — see 2.3).

Local tables (Android): cache `pharmacy_stock_items` + pending `pharmacy_stock_movements`.

### 2.3 Lab concurrency

**Decision:**

- One lab tech, one Android device per clinic — **no multi-device lab conflict** design required for v1.
- Last-write on lab result fields is acceptable.

### 2.4 Concurrent editing (multi-role, same patient)

**Decision:**

- **Concurrent editing is expected** across roles (intake, nurse, clinician).
- **Not** on the same note section simultaneously under normal ops.
- Accept **last-write-wins per artifact** (vitals row, note transcript, clinical summary fields) with these mitigations:
  - **Separate artifacts:** vitals → `patient_vitals`; intake → patient demographics; clinician → `provider_notes.transcript` + visit summary fields.
  - **Patient timeline** merges events after sync — no single merged “document.”
  - Pull merge must **not blindly overwrite** newer local rows (timestamp / version check).

**Scenario to support:** Cell down → intake registers patient → nurse records vitals → clinician writes note without seeing vitals → cell returns → all three sync; timeline shows all contributions.

### 2.5 Single Android app

**Decision:**

- **No second APK.** Lab and pharmacy live in the main Karibu Health Android app.
- **Role-based home screens** route `lab_tech` → Lab Home, `dispenser` → Pharmacy Home, clinicians → Patient search + chart.
- **Clinicians must see lab/pharmacy status** on the patient chart (read from encounter row + timeline).

### 2.6 Payment

**Decision:**

- Payment is **not** required to close a clinical encounter.
- Remove `record_payment` → `complete_visit_queue` dependency chain on Android.
- Billing uses `rpc_worklist_needs_payment` / patient chart Billing tab when ready.

### 2.7 Offline-first (non-negotiable)

Clinicians must continue through patients when cell drops. All writes land in Room first; sync is background. UI shows **“Saved on device”** vs **“Synced to cloud”** — not an opaque “86 items pending” without detail.

---

## 3. Architecture

### 3.1 Conceptual model

```text
PATIENT (durable record)
  ├── demographics, identifiers, search
  ├── timeline (union of events)
  └── encounters (visits) — optional context for today's work
        ├── vitals (patient_vitals, visit_id optional)
        ├── provider_notes (patient_id required, visit_id optional)
        ├── clinical summary fields (diagnosis, meds, tests — on visit for MVP)
        ├── lab workflow (lab_status, lab_results, …)
        ├── pharmacy workflow (dispensing_status, pharmacy_order_submitted_at, …)
        └── payments (optional billing module)
```

**Queue / worklists:** derived filters for operational screens — **not** authoritative lifecycle state.

### 3.2 Write path (all clients)

```text
UI action
  → Room upsert (immediate, always succeeds)
  → Outbox upsert ONE row per (entity_type, entity_id, operation_type)
  → SyncEngine (when online): refresh JWT → RPC with client_op_id → mark complete
  → Pull: merge server rows + reconcile outbox
```

**Rules:**

1. **No direct PostgREST inserts** from Android (especially `POST /payments`).
2. **All RPCs** accept optional `p_client_op_id UUID` for idempotency (`sync_operations` table).
3. **Autosave:** update existing outbox row for `(note_id, upsert_provider_note)` — never insert per debounce tick.
4. **JWT:** refresh on 401 once before retry; refresh before `processQueue()` batch.

### 3.3 Sync outbox schema (Room + behavior)

Keep `sync_queue` table but change semantics:

| Field | Usage |
|-------|--------|
| `operation_type` | e.g. `upsert_provider_note`, `rpc_record_dispense` |
| `entity_id` | Stable id of note, visit, payment, etc. |
| `payload` | Latest JSON intent — **updated in place** on repeat saves |
| `depends_on` | **Minimal use** — only true FK ordering (patient before visit). No autosave chains. |
| `client_op_id` | UUID sent to server for dedup |

Use `SyncQueueDao.getByEntityAndOperation()` before insert; **update** if pending row exists.

### 3.4 Server: idempotency

New migration — `sync_operations`:

```sql
CREATE TABLE sync_operations (
  id UUID PRIMARY KEY,              -- client-supplied op id
  clinic_id UUID NOT NULL REFERENCES clinics(id),
  staff_id UUID REFERENCES staff(id),
  operation_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sync_operations_clinic ON sync_operations(clinic_id, applied_at DESC);
```

Each write RPC: if `p_client_op_id` already exists → return success without re-applying.

---

## 4. Data model delta

### 4.1 New / changed columns on `visits`

| Column | Purpose |
|--------|---------|
| `pharmacy_order_submitted_at TIMESTAMPTZ` | Clinician sent meds to pharmacy (queue gate) |
| `pharmacy_order_submitted_by UUID` | Staff who submitted |

**Non-goal (v1 simplification):** do **not** introduce a separate `clinical_status` axis. We already have too many lifecycle
signals (`status`, `queue_status`, `documentation_complete`, `ai_review_status`). The pivot should **reduce** lifecycle
columns, not add another.

**Deprecate for logic (keep columns for migration period):**

- Using `queue_status` transitions for sync or “done”
- Using `complete_visit_queue` after payment

### 4.2 Pharmacy queue predicate (new)

```sql
-- Needs pharmacy when:
WHERE clinic_id = p_clinic_id
  AND medications IS NOT NULL AND medications <> ''
  AND pharmacy_order_submitted_at IS NOT NULL
  AND dispensing_status IN ('not_started', 'in_progress', 'partial', 'out_of_stock')
-- NOT documentation_complete
```

### 4.3 New RPCs (minimum set)

| RPC | Purpose |
|-----|---------|
| `rpc_submit_pharmacy_order(p_visit_id, p_medications, p_client_op_id)` | Set meds + `pharmacy_order_submitted_at`, set `dispensing_status = 'not_started'` if needed |
| `rpc_record_payment(...)` | SECURITY DEFINER — replace Android REST POST |
| `rpc_start_lab(p_visit_id, ...)` | Mirror web `startLabRun` |
| `rpc_record_lab_result(p_visit_id, p_result, p_abnormal, ...)` | Mirror web `recordLabResult` |
| `rpc_record_dispense(p_visit_id, p_status, p_movements jsonb, ...)` | Mirror web `recordDispenseAndStock` |
| `rpc_set_dispensing_status(...)` | Mirror web in-progress transitions |
| `rpc_finalize_clinical_encounter(...)` | Atomic sign + patient receipt + visit summary (migration 048) |
| `rpc_get_clinic_catalog(p_clinic_id)` | Sorted lab + formulary catalog for pickers and AI |
| `rpc_get_opd_patients_today(p_clinic_id, p_filter)` | Patient-first OPD list for today's encounters |
| `rpc_admit_patient(...)` | Create inpatient admission |
| `rpc_activate_clinical_protocol(...)` | Activate enrolled outbreak/isolation protocol |
| `rpc_request_draft_ai_assist(p_visit_id, ...)` | Gate + queue draft-stage AI assist |

Implement `check_in_patient` in Android `SyncEngine.syncQueueOperation` (currently no-op).

### 4.4 Android Room additions

| Table | Purpose |
|-------|---------|
| `pharmacy_stock_items` | Cached stock levels |
| `pharmacy_stock_movements` | Pending offline decrements |
| `lab_queue_cache` / `pharmacy_queue_cache` | Optional snapshot of worklist RPCs |
| `patients` FTS or search index | Fast offline search |

### 4.5 Entity sync flags

Keep `is_synced` on entities for UI (“this visit hasn’t reached cloud”). **Banner count** should align with outbox after reconciliation — or show two indicators: “X not synced” (outbox) vs clinical state.

---

## 5. Android application structure

### 5.1 Navigation (role-based home)

Single `KaribuNavHost` — branch on `staff.role` after auth:

| Role | Home | Primary actions |
|------|------|-----------------|
| `clinical_officer`, `midwife`, `doctor`, `nurse` | Search + recent patients + open encounters | Chart, document, order lab/pharm |
| `nursing_assistant`, `nurse` | Vitals-needed list + search | Vitals, check-in assist |
| `records_officer` | Search + register | New patient, encounters |
| `lab_tech` | **Lab Home** (port of web lab queue) | Start run, record result |
| `dispenser` | **Pharmacy Home** (port of web pharmacy queue) | Dispense, stock decrement |
| `admin` | Operations overview | All modules |

**Shared:** `PatientChartScreen` — timeline, vitals, notes, encounter summary, **lab status**, **pharmacy status**, billing link.

Reference web implementations:

- Lab: `apps/web/src/app/dashboard/lab/LabQueueClient.tsx`, `lab/actions.ts`
- Pharmacy: `apps/web/src/app/dashboard/pharmacy/PharmacyQueueClient.tsx`, `pharmacy/actions.ts`
- Patient chart: `apps/web/src/app/dashboard/patients/[id]/PatientDetailClient.tsx`

### 5.2 Clinician: pharmacy order without closing note

New UI on dictation / visit chart:

- **“Send to pharmacy”** — calls `rpc_submit_pharmacy_order` (or queues equivalent).
- Does **not** sign note or set `documentation_complete`.
- Sets `pharmacy_order_submitted_at`; pharmacy queues update on next sync/pull.

**Medication source of truth (required decision):**

- **Source**: `visits.medications` (existing flattened field) populated by **structured input** in the Android dictation UI
  (`DictationScreen` already has a dedicated `sections.medications` field).
- **Not allowed**: parsing free-text transcript to derive medications.
- **UX**: “Send to pharmacy” opens a small confirmation sheet/form that shows the current `medications` text (editable) and
  then submits it via `rpc_submit_pharmacy_order`.

Optional: **“Order labs”** similarly if tests should queue before note finalize (lab already gates on `tests_ordered` + `lab_status`).

### 5.3 Remove / refactor

- Payment screen **not** in clinician sign pipeline
- `PaymentRepository` chain: drop `dependsOn` link to `complete_visit_queue`
- Home dashboard queue slices driven by `queue_status` → replace with “open encounters today” + chart search
- `WorklistsScreen` showing all 7 sections to every role → role-filtered or replace with role homes

---

## 6. Web application alignment

| Area | Change |
|------|--------|
| Pharmacy queue page | Remove `documentation_complete` gate; use `pharmacy_order_submitted_at` |
| Pharmacy actions | Add submit order RPC usage from visit detail if not only Android |
| Worklist RPC 041 | Update `rpc_worklist_needs_pharmacy` |
| Visit detail | “Send to pharmacy” button independent of sign |
| Queue dashboard | Demote to Operations; patient list / search as primary |
| Patient chart | Already strong — ensure lab/pharm status visible |
| Clinician home | **Patient search + today's patients** primary; physical queue deprecated |
| Admin inventory | Edit catalog code, category, display_order, active per lab/formulary item |
| Superadmin | Edit `clinics.workflow_config`; enroll clinics in clinical protocols |

Web can remain **admin/reports/HMIS** heavy; Android is **field resilience** for all clinical + lab + pharm roles.

### 6.1 OPD / Inpatient navigation (migration 048)

- **OPD:** `rpc_get_opd_patients_today` returns one row per patient for today's visit, filterable by workflow keys (`waiting`, `needs_vitals`, `with_clinician`, `awaiting_labs`, `at_pharmacy`, `done_today`). Clinic defaults live in `clinics.workflow_config.default_opd_filters`. **Android:** `VisitRepository.refreshOpdPatientsToday` calls the RPC when online (local bucket fallback offline).
- **Inpatient:** `admissions` table + `visits.admission_id` link encounters to ward stays. `rpc_admit_patient` creates active admissions. **Android:** `InpatientHomeScreen` + admit form (online required).
- **Web clinician dashboard:** patient search + link to today's patients list; physical queue hidden when `workflow_config.show_physical_queue_filter` is false.

### 6.2 Clinic catalog platform

- `clinic_lab_capabilities` and `clinic_pharmacy_formulary` gain `code`, `category`, `display_order`, `active`.
- `rpc_get_clinic_catalog(p_clinic_id)` returns sorted lab + formulary JSON for Android pickers and AI constraint prompts.
- **Android pickers:** lab list from Room catalog + `HcLabCatalog` offline fallback; formulary names from catalog with `code` mapped to `HcDrugCatalog` for dose/freq/route/confusables until formulary metadata carries sig fields.
- Admin inventory UI toggles availability/stock plus catalog metadata.

### 6.3 Clinical protocol engine

- `clinical_protocol_definitions` — seeded slugs (e.g. `ebola-suspect-v1`, `cholera-suspect-v1`).
- `clinic_protocol_enrollments` — superadmin enables protocols per clinic.
- `protocol_activations` — `rpc_activate_clinical_protocol` spawns care tasks from protocol steps.
- `workflow_config.enabled_protocol_slugs` mirrors enrollments for client defaults.

### 6.4 Progressive AI tiers

| Phase | When | Storage |
|-------|------|---------|
| `draft` | During open note (`rpc_request_draft_ai_assist`) | `ai_review_suggestions.phase = 'draft'` — dispatched from Android autosave + web `queueDraftAiAssist` via edge function `request-draft-ai-assist` |
| `pre_sign` | Reserved for attestation gate | same table |
| `post_sign` | After sign / finalize (Inngest `note.dictated`) | default phase |

Draft suggestions coach in-note; post-sign suggestions surface on review queue. All tiers use the same disagreement prompt — questions only, clinician retains authority.

### 6.5 Queue UI deprecated

The legacy **physical queue** (`get_clinic_queue`, queue_status spine) remains for transition but is **not** the primary clinician surface. Chart search, OPD patient list, and role homes (lab/pharmacy) replace queue-as-spine UX. Set `workflow_config.show_physical_queue_filter` to hide queue filters on Android when ready.

---

## 7. Sync engine rewrite (Android)

Replace current failure modes documented in `docs/offline-first-refactor.md`:

### 7.1 Must fix

1. **401 handling** — `AuthInterceptor` or `SyncEngine`: on 401, `refreshToken()`, retry once.
2. **`rpc_record_payment`** — delete direct `POST payments` from `SyncEngine.syncRecordPayment`.
3. **Outbox dedup** — `NoteRepository.upsertProviderNote`: upsert queue row via `getByEntityAndOperation`.
4. **Pull reconciliation** — if server has entity, `forceComplete` matching outbox rows.
5. **`check_in_patient`** in `syncQueueOperation`.
6. **Immediate sync** — enqueue `SyncWorker` one-shot after any outbox insert.
7. **Merge not overwrite** — `refreshTodayVisits` / `refreshVisit`: don’t revert newer local clinical flags.

### 7.2 Autosave

- Debounce 1.5s stays (`DictationViewModel`).
- Each cycle: Room upsert + **single** outbox row update (same `entity_id` = note id).

### 7.3 Sign pipeline

On sign: flush autosave → sign → summary → clinical summary → doc complete.  
Each step: direct RPC if online **or** one outbox row each (4–5 max), **not** 50.  
Trigger `processQueue()` at end of sign.

---

## 8. Implementation phases

Agents should implement **in order**; later phases assume earlier migrations exist.

### Phase 0 — Hygiene (can parallelize)

- [x] **Do not wipe the database.** Preserve existing “real” test data. Provide a *non-destructive* cleanup script for obviously-bad rows only (`scripts/ehr-pivot-cleanup.sql`).
- [x] Feature flag or branch `ehr-pivot` for big-bang (pilot on `main` post-641cdb8; use clinic `workflow_config` for per-site toggles)

### Phase 1 — Database & RPCs

**Owner:** migrations + shared types

- [x] Migration: `sync_operations` table
- [x] Migration: `pharmacy_order_submitted_at`, `pharmacy_order_submitted_by` on `visits`
- [x] Fix **`pending → review` transition** for AI dictation workflow: `submit-dictation` / `note.dictated` must not leave visits stuck in `status='pending'` forever
- [x] Migration: `rpc_submit_pharmacy_order`
- [x] Migration: `rpc_record_payment` (SECURITY DEFINER)
- [x] Migration: `rpc_start_lab`, `rpc_record_lab_result`, `rpc_reopen_lab` (wrap existing logic)
- [x] Migration: `rpc_record_dispense`, `rpc_set_dispensing_status`
- [x] Add SQL helper + convention: `assert_staff_in_clinic(p_clinic_id uuid)` and require every SECURITY DEFINER RPC to call it as the **first line**
- [x] Update `rpc_worklist_needs_pharmacy` (drop doc complete gate)
- [x] Web: update `apps/web/src/app/dashboard/pharmacy/page.tsx` to drop `documentation_complete` gate and filter/sort by `pharmacy_order_submitted_at`
- [x] Update `@karibu/shared` types
- [x] Tests: SQL/pgTAP or integration tests for RPC idempotency (`packages/supabase/tests/rpc_idempotency.sql`)

**Files:** `packages/supabase/migrations/`, `packages/shared/src/types.ts`

### Phase 2 — Android sync core

**Owner:** Android data layer

- [x] Refactor `SyncEngine` — all ops via RPC; payment migration
- [x] `AuthInterceptor` 401 retry + token refresh
- [x] Outbox upsert-in-place in `NoteRepository`, `VisitRepository`, etc.
- [x] `SyncWorker` trigger on enqueue (`SyncQueueHelper`)
- [x] Pull reconciliation service (`PullReconciliationService` + `OutboxReconciler`)
- [x] Merge strategy for visit/patient refresh (`VisitMerge`, `PatientMerge` on pull refresh)
- [x] Unit tests: `SyncEngineTest` expanded (`finalize_clinical_encounter` + reconciliation)

**Files:** `apps/android/.../data/sync/`, `.../repository/`, `AuthInterceptor.kt`

### Phase 3 — Android patient chart & role homes

**Owner:** Android UI

- [x] `PatientChartScreen` (timeline, vitals, lab/pharm badges) — `PatientTimelineScreen` + web-aligned pathway labels
- [x] Role-based home routing in `HomeScreen` (`lab_tech` / `dispenser`)
- [x] `LabHomeScreen` + ViewModel (RPC list + actions)
- [x] `PharmacyHomeScreen` + ViewModel (online dispense; offline stock cache still TODO)
- [x] “Send to pharmacy” on dictation/chart
- [x] Demote old Home queue UX (`workflow_config.show_physical_queue_filter`; web clinician dashboard hides physical queue when false)
- [x] Sync status UX: saved vs synced (`SyncStatusPill` on timeline + visit details; pending count per visit)

**Files:** `apps/android/.../ui/`

### Phase 4 — Web pharmacy/lab alignment

**Owner:** web dashboard

- [x] Visit detail: submit pharmacy order
- [x] Verify lab flow unchanged except shared RPCs (manual script in `docs/ehr-pivot-qa.md` § lab tech)

**Files:** `apps/web/src/app/dashboard/pharmacy/`, `worklists/`, `patients/`, `visits/`

### Phase 5 — Payment decoupling

- [x] Android: remove payment from sign/close path (review → visit details, not payment)
- [x] Billing module entry from chart + needs_payment worklist (`BillingHomeScreen` + chart payments icon; worklist via `rpc_worklist_needs_payment`)
- [x] Remove `complete_visit_queue` from payment outbox chain

### Phase 6 — QA & field prep

- [x] Offline test script: see `docs/ehr-pivot-qa.md`
- [ ] Offline test script (execute in field): register → vitals → note → pharm order (note open) → lab → dispense offline → sync
- [ ] Multi-role same-patient test with airplane mode
- [x] Update `docs/hc3-rollout-plan.md` training notes (EHR pivot §12)

---

## 9. Role day-in-the-life (acceptance scenarios)

Use these as **manual QA scripts** after each phase.

### Records + nurse (offline mid-morning)

1. Register new patient offline
2. Record vitals offline
3. Confirm patient appears in local search
4. Go online — timeline shows registration + vitals

### Clinician (pharmacy before note close)

1. Open patient chart, start encounter
2. Write draft note, order meds, tap **Send to pharmacy** (note stays draft)
3. Lab tech sees pharmacy queue **without** documentation complete
4. Later sign note after lab returns — pharmacy already dispensed

### Lab tech (Android, desktop off)

1. Open Lab Home — see pending tests
2. Start run, enter result offline
3. Sync — clinician chart shows result

### Dispenser (Android, offline stock)

1. Open Pharmacy Home — see submitted order
2. Dispense — local stock decrements
3. Sync — server stock + visit dispensing_status updated

### Cashier (optional, end of day)

1. Open billing queue — only documented/sent encounters
2. Record payment — does not alter note or queue_status

---

## 10. Key code locations (current repo)

| Concern | Path |
|---------|------|
| Android sync engine | `apps/android/app/src/main/java/com/karibuhealth/app/data/sync/SyncEngine.kt` |
| Outbox DAO | `.../data/local/db/dao/SyncQueueDao.kt` |
| Auth interceptor | `.../data/remote/api/AuthInterceptor.kt` |
| Payment (needs RPC) | `.../data/repository/PaymentRepository.kt` |
| Note autosave | `.../ui/dictation/DictationViewModel.kt`, `NoteRepository.kt` |
| Android nav | `.../ui/navigation/KaribuNavHost.kt` |
| Web lab | `apps/web/src/app/dashboard/lab/` |
| Web pharmacy | `apps/web/src/app/dashboard/pharmacy/` |
| Worklist RPCs | `packages/supabase/migrations/041_care_tasks_and_worklists.sql` |
| Lab/pharm MVP cols | `packages/supabase/migrations/031_pharmacy_lab_mvp.sql` |
| Stock | `packages/supabase/migrations/043_pharmacy_lab_stock.sql` |
| Patient timeline RPC | `packages/supabase/migrations/040_patient_timeline.sql` |
| Web patient chart | `apps/web/src/app/dashboard/patients/[id]/` |

---

## 11. Definition of done (program level)

- [x] No Android write uses direct PostgREST to RLS tables (payments included) — CI script `scripts/audit-android-postgrest.sh`
- [x] **Observability exists**: dashboard/metrics for outbox depth, retry rate, 401 rate, JWT refresh success rate, per-RPC error rate (and an alert when these regress) — see [ehr-pivot-observability.md](./ehr-pivot-observability.md)
- [ ] Clinician can send pharmacy order with note still in draft
- [ ] Lab tech + dispenser complete full workflows on Android offline, sync on reconnect
- [ ] Offline dispense decrements local stock and reconciles server stock
- [ ] Payment never blocks clinical documentation or sync chain
- [x] Patient chart shows timeline + lab/pharm status for clinicians
- [x] Autosave produces O(1) outbox rows per note, not O(keystrokes)
- [ ] Multi-role same-patient offline scenario passes QA script
- [ ] Test data reset; field pilot checklist updated

---

## 12. Agent coordination notes

- **One migration thread** — serialize Supabase migrations to avoid timestamp conflicts.
- **Shared types first** — merge RPC types to `packages/shared` before parallel Android/web UI work.
- **Do not** reintroduce `documentation_complete` as pharmacy gate.
- **Do not** add a second Android app.
- **Prefer** porting web lab/pharmacy **behavior** via RPCs, not duplicating business rules in clients.
- When unsure, default to: **patient chart first**, **Room write always succeeds**, **RPC-only cloud writes**, **explicit product decisions in §2**.

---

*Last updated: 2026-05-29 — EHR pilot architecture (migration 048): finalize encounter RPC, catalog, protocols, OPD/inpatient nav, progressive AI phases, queue UI deprecated.*
