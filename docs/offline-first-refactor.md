# Offline-First Architecture Refactor

> **Status (2026-05-12, post-shipping):** the schema portion of this plan shipped in migrations 029 (`patient_vitals`, `documentation_complete` flag, SECURITY DEFINER RPCs for offline writes, `patient_notes.source` discriminator), 032 (composite unique on `patient_notes(visit_id, source)`, `rpc_upsert_provider_note` hardened to preserve transcripts on null re-sync), and 033 (AI-as-colleague reframe with `ai_review_status` and `ai_review_suggestions`). The status-flow change is live: `rpc_mark_documentation_complete` jumps `pending → sent` directly. **One outstanding defect:** the Android sync engine still has an ID-propagation bug at `SyncEngine.kt:99-128` — when `syncCreatePatient` succeeds with HTTP 200 it upserts the server patient to Room but does **not** walk dependents to swap the local UUID for the server UUID (that walk only fires inside the HTTP 409 conflict branch). Queued visit RPCs then fail server FK validation, get marked `failed` after 5 retries, and downstream notes stall forever at the single-hop dependency gate (`SyncEngine.kt:51`). The fix lives in Phase 6 of `docs/patient-centered-architecture-plan.md`.
>
> **Original status (preserved for context):** planning, post-Codex round 2 revision. Strictly additive through Phase 1 — no schema drops, no enum collapses. Every existing flow (web review, payment, HMIS, print) keeps working. Architectural inversion happens by **adding alternative non-AI paths alongside the current AI-driven ones**, with a single same-phase change to status-state semantics so payment is reachable from the non-AI path.

## Context

The current architecture conflates AI structuring with basic clinical record-keeping. `NoteRepository.saveDraftTranscript()` ([data/repository/NoteRepository.kt:37](../apps/android/app/src/main/java/com/karibuhealth/app/data/repository/NoteRepository.kt:37)) writes only to local Room. Cloud persistence of the note happens **only** via the `submit-dictation` edge function ([data/remote/api/DictationApiClient.kt:74](../apps/android/app/src/main/java/com/karibuhealth/app/data/remote/api/DictationApiClient.kt:74), [ui/dictation/DictationViewModel.kt:143](../apps/android/app/src/main/java/com/karibuhealth/app/ui/dictation/DictationViewModel.kt:143)) which fires Inngest AI structuring. So:

- Offline clinicians never get their notes server-side
- Clinicians who don't want AI never get their notes server-side either
- Payment is only reachable via AI review approval ([KaribuNavHost.kt:112](../apps/android/app/src/main/java/com/karibuhealth/app/ui/navigation/KaribuNavHost.kt:112), [ReviewScreen.kt:165](../apps/android/app/src/main/java/com/karibuhealth/app/ui/review/ReviewScreen.kt:165))
- AI being slow / down / unconfigured blocks plain documentation **and** payment closure
- The current `submit-dictation` edge function has zero recorded invocations in production

This refactor inverts the model: **clinical record-keeping is the foundation, AI is augmentation that runs on top, payment is reachable without AI**. Wi-Fi at every clinic is the goal target environment, but the system must degrade gracefully to fully offline operation.

Two missing capabilities are addressed at the same time:

1. **Vitals capture has no UI.** Inpatient maternal care needs longitudinal vitals (multiple readings over hours/days), so vitals are keyed primarily on `patient_id` with a nullable `visit_id`.
2. **`chief_complaint` field exists server-side ([008_queue_system.sql:14](../packages/supabase/migrations/008_queue_system.sql:14)) but isn't captured in the new-patient flow** ([NewVisitViewModel.kt:131](../apps/android/app/src/main/java/com/karibuhealth/app/ui/newvisit/NewVisitViewModel.kt:131)).

## Architectural principles

1. **Clinical record-keeping is offline-first and AI-independent.** Patient → vitals → chief complaint → note → save → payment-eligible. Zero AI involvement in this critical path.
2. **Direct-write first, queue as fallback.** When online, the client attempts a synchronous write so the clinician sees their data in Supabase immediately. On failure or offline, the operation queues to `sync_queue` with linear `depends_on` chain.
3. **AI is opt-in and asynchronous.** The clinician taps a small button. Existing Inngest workflow runs in the background. Result lands in the existing `provider_notes` / `patient_notes` / `visit_diagnosis_codes` columns.
4. **Additive-first migration.** Existing tables and columns stay untouched. New capability is added alongside; collapse and cleanup is deferred until every consumer has migrated.
5. **One coordinated semantic change**: when the clinician taps Save, `status` advances `pending → sent` (skipping `review`). This is the *only* status-flow change, and every consumer is updated in the same phase. Payment becomes reachable without AI; AI review becomes optional polish.
6. **HMIS coding stays a back-office function.** Webapp central reviewer continues to use existing `hmis_diagnosis_codes` + `visit_diagnosis_codes` from [013_hmis_reporting.sql](../packages/supabase/migrations/013_hmis_reporting.sql). No code picker on Android.
7. **Edge functions for synchronous request/response. Inngest for async workflows.** No churn — current split is correct.
8. **`visits` is a compatibility container, not the final domain model.** The target shape is `care_episode + encounter` (one episode of care can span multiple encounters: OPD → admit → ward → discharge; or maternity → ANC → prenatal → postnatal). This refactor keeps adding to `visits` because everything in the codebase currently keys off it, but everything we add (vitals on `patient_id` with nullable `visit_id`, the `clinician_fallback` patient_notes path, `documentation_complete` flag) is forward-compatible with the eventual encounter model. Don't lock into one-encounter-per-visit assumptions.
9. **Reuse `visits.department` for OPD vs maternity vs ANC routing.** Migration 024 already added it ([024_hc3_roles_and_departments.sql:47](../packages/supabase/migrations/024_hc3_roles_and_departments.sql:47)) with values `'opd','anc','maternity','family_planning','immunization'`. HMIS report filtering already gates on `department='opd'`. `check_in_patient` already accepts `p_department`. Do not invent new "encounter_type" axes.

## Status lifecycle (clarified)

```
pending          ─── (clinician dictates with AI) ───▶ review ─── (approve) ───▶ sent ──▶ completed
   │
   └─── (clinician saves directly, NEW) ─── documentation_complete=true ─────▶ sent ──▶ completed
```

Both paths converge at `sent`. AI path keeps the existing `pending → review → sent` flow ([actions.ts:67](../apps/web/src/app/dashboard/review/actions.ts:67), [actions.ts:219](../apps/web/src/app/dashboard/review/actions.ts:219)). Direct path skips `review` entirely. From `sent` onward, payment / print / HMIS reporting all work unchanged.

`error` state still exists for AI failures. Direct save can't enter `error`; it can only fail to sync and stay in `pending` with `documentation_complete=false`.

## Three-layer note model — using existing tables

| Layer | Storage | Producer | Consumer |
|---|---|---|---|
| Clinician's note (raw) | `provider_notes.transcript` | Clinician via `rpc_upsert_provider_note` | Always preserved; Inngest reads but never overwrites |
| AI-augmented SOAP | `provider_notes.note_content` + `structured_data` | Inngest `structure-dictation` | Web review screen, dashboard |
| Patient receipt summary | `patient_notes.content` | AI (`source='ai_generated'`) **or** clinician fallback (`source='clinician_fallback'`) | Print/pharmacy receipt |
| Diagnosis codes | `visit_diagnosis_codes` + `hmis_diagnosis_codes` (existing) | AI suggests, central reviewer confirms | HMIS reporting |

**Patient summary fallback content (when AI hasn't run):** copy the clinician's `transcript` directly into `patient_notes.content`. No prettifying, no inference, no extra clinician input field. The receipt prints the clinician's actual words. AI later overwrites with a polished version (allowed by the upsert WHERE clause). Receipt re-renders clean.

If the clinician wants something different on the receipt, that's a future feature (a separate "patient instructions" field). Not in this refactor.

## Data model — additions only

### What stays untouched

- `visits.status` enum and existing transitions (`pending → review → sent → completed`)
- `provider_notes.note_content` and `structured_data` — Inngest keeps writing
- `patient_notes` table — gains a `source` column, no other changes
- `hmis_diagnosis_codes` + `visit_diagnosis_codes` — reused as-is
- The visit-flattened fields (`visits.diagnosis`, `medications`, `tests_ordered`, `follow_up_instructions`) — keep AI-populated

### New table: `patient_vitals`

```sql
CREATE TABLE patient_vitals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  visit_id UUID REFERENCES visits(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by UUID REFERENCES staff(id),
  weight_kg NUMERIC(5,2),
  height_cm NUMERIC(5,1),
  temp_c NUMERIC(3,1),
  bp_systolic INTEGER,
  bp_diastolic INTEGER,
  pulse_bpm INTEGER,
  resp_rate INTEGER,
  spo2_pct INTEGER,
  muac_cm NUMERIC(4,1),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_patient_vitals_patient ON patient_vitals(patient_id, recorded_at DESC);
CREATE INDEX idx_patient_vitals_visit ON patient_vitals(visit_id) WHERE visit_id IS NOT NULL;
ALTER TABLE patient_vitals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "patient_vitals_select" ON patient_vitals FOR SELECT
  USING (
    patient_id IN (SELECT id FROM patients WHERE clinic_id = get_current_clinic_id())
  );
-- All writes via SECURITY DEFINER RPC; no direct-insert policy needed.
```

`uuid_generate_v4()` matches existing schema convention from [001_initial_schema.sql:5](../packages/supabase/migrations/001_initial_schema.sql:5).

### New columns

```sql
ALTER TABLE visits ADD COLUMN documentation_complete BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE visits ADD COLUMN documentation_completed_at TIMESTAMPTZ;
ALTER TABLE patient_notes ADD COLUMN source TEXT NOT NULL DEFAULT 'ai_generated'
  CHECK (source IN ('ai_generated','clinician_fallback'));
```

`documentation_complete` is the durable signal that the clinician finished writing — independent of the AI/review state machine. UI consumers prefer this flag for "ready to print" / "ready to bill" semantics rather than reverse-engineering from `status` and presence of `note_content`.

### SECURITY DEFINER RPCs

PostgREST direct INSERT into `visits` returns 404 in production — exact root cause not fully isolated, but the SECURITY DEFINER RPC route sidesteps it cleanly and matches the existing queue RPC pattern from [008_queue_system.sql](../packages/supabase/migrations/008_queue_system.sql) (`check_in_patient`, `assign_to_nurse`, `claim_patient`, `start_visit_self_triage`).

```sql
-- Visit creation — replaces failing direct PostgREST INSERT path.
-- p_department defaults to 'opd' to match the existing visits.department column
-- default (migration 024). Reception screen / encounter routing in later phases
-- will pass 'anc' / 'maternity' / 'family_planning' / 'immunization' explicitly.
CREATE OR REPLACE FUNCTION rpc_create_visit(
  p_id UUID, p_clinic_id UUID, p_patient_id UUID,
  p_doctor_id UUID DEFAULT NULL,
  p_chief_complaint TEXT DEFAULT NULL,
  p_visit_date DATE DEFAULT CURRENT_DATE,
  p_department TEXT DEFAULT 'opd'
) RETURNS VOID AS $$
DECLARE v_caller_clinic UUID;
BEGIN
  v_caller_clinic := get_current_clinic_id();
  IF v_caller_clinic IS NULL OR v_caller_clinic != p_clinic_id THEN
    RAISE EXCEPTION 'Unauthorized: clinic mismatch';
  END IF;
  INSERT INTO visits (id, clinic_id, patient_id, doctor_id, chief_complaint, visit_date,
                      department, status, queue_status, priority)
  VALUES (p_id, p_clinic_id, p_patient_id, p_doctor_id, p_chief_complaint, p_visit_date,
          p_department, 'pending', 'waiting', 'normal')
  ON CONFLICT (id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION rpc_create_visit(UUID, UUID, UUID, UUID, TEXT, DATE, TEXT)
  TO anon, authenticated;

-- Provider note — bypasses 009 doctor-only RLS for the broader 024 clinical role set.
-- IMPORTANT: keep this allowlist in sync with the staff_role_check constraint in
-- 024_hc3_roles_and_departments.sql line 40. Adding a clinical role server-side
-- without updating this list silently locks them out of writes.
CREATE OR REPLACE FUNCTION rpc_upsert_provider_note(
  p_id UUID, p_visit_id UUID, p_transcript TEXT, p_status TEXT DEFAULT 'draft'
) RETURNS VOID AS $$
DECLARE v_visit_clinic UUID; v_role TEXT;
BEGIN
  SELECT clinic_id INTO v_visit_clinic FROM visits WHERE id = p_visit_id;
  IF v_visit_clinic IS NULL OR v_visit_clinic != get_current_clinic_id() THEN
    RAISE EXCEPTION 'Unauthorized: visit/clinic mismatch';
  END IF;
  v_role := get_current_staff_role();
  IF v_role NOT IN ('admin','doctor','nurse','clinical_officer','midwife','nursing_assistant') THEN
    RAISE EXCEPTION 'Unauthorized role: %', v_role;
  END IF;
  INSERT INTO provider_notes (id, visit_id, transcript, status, updated_at)
  VALUES (p_id, p_visit_id, p_transcript, p_status, now())
  ON CONFLICT (visit_id) DO UPDATE
    SET transcript = EXCLUDED.transcript,
        status = EXCLUDED.status,
        updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION rpc_upsert_provider_note(UUID, UUID, TEXT, TEXT)
  TO anon, authenticated;

-- Patient note (the receipt-facing summary) — non-AI fallback path
CREATE OR REPLACE FUNCTION rpc_upsert_patient_note_summary(
  p_id UUID, p_visit_id UUID, p_content TEXT
) RETURNS VOID AS $$
DECLARE v_visit_clinic UUID; v_role TEXT;
BEGIN
  SELECT clinic_id INTO v_visit_clinic FROM visits WHERE id = p_visit_id;
  IF v_visit_clinic IS NULL OR v_visit_clinic != get_current_clinic_id() THEN
    RAISE EXCEPTION 'Unauthorized: visit/clinic mismatch';
  END IF;
  v_role := get_current_staff_role();
  IF v_role NOT IN ('admin','doctor','nurse','clinical_officer','midwife','nursing_assistant') THEN
    RAISE EXCEPTION 'Unauthorized role: %', v_role;
  END IF;
  -- Insert as clinician_fallback. AI may overwrite later (see Inngest tweak below).
  INSERT INTO patient_notes (id, visit_id, content, language, source, created_at, updated_at)
  VALUES (p_id, p_visit_id, p_content, 'en', 'clinician_fallback', now(), now())
  ON CONFLICT (visit_id) DO UPDATE
    SET content = EXCLUDED.content,
        source = EXCLUDED.source,
        updated_at = now()
    WHERE patient_notes.source = 'clinician_fallback';   -- never overwrite AI-generated content
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION rpc_upsert_patient_note_summary(UUID, UUID, TEXT)
  TO anon, authenticated;

-- Vitals reading
CREATE OR REPLACE FUNCTION rpc_insert_patient_vitals(
  p_id UUID, p_patient_id UUID,
  p_visit_id UUID DEFAULT NULL,
  p_weight_kg NUMERIC DEFAULT NULL, p_height_cm NUMERIC DEFAULT NULL,
  p_temp_c NUMERIC DEFAULT NULL,
  p_bp_systolic INTEGER DEFAULT NULL, p_bp_diastolic INTEGER DEFAULT NULL,
  p_pulse_bpm INTEGER DEFAULT NULL, p_resp_rate INTEGER DEFAULT NULL,
  p_spo2_pct INTEGER DEFAULT NULL, p_muac_cm NUMERIC DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_recorded_at TIMESTAMPTZ DEFAULT now()
) RETURNS VOID AS $$
DECLARE v_patient_clinic UUID; v_visit_clinic UUID; v_staff_id UUID; v_role TEXT;
BEGIN
  SELECT clinic_id INTO v_patient_clinic FROM patients WHERE id = p_patient_id;
  IF v_patient_clinic IS NULL OR v_patient_clinic != get_current_clinic_id() THEN
    RAISE EXCEPTION 'Unauthorized: patient/clinic mismatch';
  END IF;
  IF p_visit_id IS NOT NULL THEN
    SELECT clinic_id INTO v_visit_clinic FROM visits WHERE id = p_visit_id;
    IF v_visit_clinic != get_current_clinic_id() THEN
      RAISE EXCEPTION 'Unauthorized: visit/clinic mismatch';
    END IF;
  END IF;
  v_role := get_current_staff_role();
  IF v_role NOT IN ('admin','doctor','nurse','clinical_officer','midwife','nursing_assistant') THEN
    RAISE EXCEPTION 'Unauthorized role: %', v_role;
  END IF;
  v_staff_id := get_current_staff_id();
  INSERT INTO patient_vitals (id, patient_id, visit_id, recorded_at, recorded_by,
                               weight_kg, height_cm, temp_c,
                               bp_systolic, bp_diastolic, pulse_bpm, resp_rate, spo2_pct,
                               muac_cm, notes)
  VALUES (p_id, p_patient_id, p_visit_id, p_recorded_at, v_staff_id,
          p_weight_kg, p_height_cm, p_temp_c,
          p_bp_systolic, p_bp_diastolic, p_pulse_bpm, p_resp_rate, p_spo2_pct,
          p_muac_cm, p_notes)
  ON CONFLICT (id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION rpc_insert_patient_vitals(
  UUID, UUID, UUID, NUMERIC, NUMERIC, NUMERIC, INTEGER, INTEGER,
  INTEGER, INTEGER, INTEGER, NUMERIC, TEXT, TIMESTAMPTZ
) TO anon, authenticated;

-- Mark documentation complete (clinician taps Save) — also advances status pending → sent.
-- This is the only status-flow change in the refactor, the same-phase semantic shift.
CREATE OR REPLACE FUNCTION rpc_mark_documentation_complete(p_visit_id UUID)
RETURNS VOID AS $$
DECLARE v_visit_clinic UUID;
BEGIN
  SELECT clinic_id INTO v_visit_clinic FROM visits WHERE id = p_visit_id;
  IF v_visit_clinic IS NULL OR v_visit_clinic != get_current_clinic_id() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  UPDATE visits
    SET documentation_complete = true,
        documentation_completed_at = now(),
        status = CASE WHEN status = 'pending' THEN 'sent' ELSE status END,
        updated_at = now()
    WHERE id = p_visit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION rpc_mark_documentation_complete(UUID)
  TO anon, authenticated;
```

## Edge functions — additive only

### Keep, unchanged
- `dictate` — Whisper transcription. Edge function returns transcript synchronously.
- `submit-dictation` — kept. The "Structure with AI" button continues to invoke this. Inngest workflow unchanged.
- `approve-dictation` / `reject-dictation` — kept. Web review flow continues to use them for AI-augmented visits that still go through the `pending → review → sent` path.

### No new edge functions in Phase 0–2

The existing `submit-dictation` already does what we need. No `structure-note` rename, no new thin trigger.

## Inngest workflows — one tiny change

`structure-dictation` ([apps/web/src/inngest/functions/structure-dictation.ts](../apps/web/src/inngest/functions/structure-dictation.ts)) keeps writing to `provider_notes.note_content`, `structured_data`, `patient_notes.content`, `visit_diagnosis_codes`, and the flattened `visits.*` fields. **One added line**: when writing `patient_notes`, set `source = 'ai_generated'`. That's it. The clinician fallback `WHERE source = 'clinician_fallback'` clause in `rpc_upsert_patient_note_summary` then prevents the clinician fallback from ever clobbering AI output.

## Sync queue — linearized dependencies

`SyncQueueEntry.depends_on` is a single nullable foreign key ([Entities.kt:175](../apps/android/app/src/main/java/com/karibuhealth/app/data/local/db/entity/Entities.kt:175)) and `SyncEngine.processQueue()` resolves a single chain only. So multi-prerequisite dependencies must be **linearized**, not modeled as DAGs.

Linear chain for a fresh patient → visit → vitals + note → save:

```
create_patient
    └── create_visit                (depends_on = create_patient)
            └── insert_patient_vitals (depends_on = create_visit)
                    └── upsert_provider_note (depends_on = insert_patient_vitals)
                            └── upsert_patient_note_summary (depends_on = upsert_provider_note)
                                    └── mark_documentation_complete (depends_on = upsert_patient_note_summary)
```

If vitals are skipped, the chain becomes patient → visit → provider_note → patient_note → mark_complete. The provider_note step's `depends_on` falls back to whichever visit-tier op was queued last (visit if no vitals, vitals otherwise).

Topological sort in `SyncEngine.kt:46` already handles linear chains correctly. No engine changes needed.

For inpatient longitudinal vitals (later, separate flow): `insert_patient_vitals` with `visit_id=null` depends only on `create_patient`. Different chain root, same machinery.

### New operation types

| operationType | RPC | depends_on (typical) |
|---|---|---|
| `create_patient` (existing) | `POST /rest/v1/patients` | — |
| `create_visit` (existing, swap to RPC) | `rpc_create_visit` | create_patient |
| `insert_patient_vitals` (NEW) | `rpc_insert_patient_vitals` | create_visit |
| `upsert_provider_note` (NEW) | `rpc_upsert_provider_note` | insert_patient_vitals (or create_visit) |
| `upsert_patient_note_summary` (NEW) | `rpc_upsert_patient_note_summary` | upsert_provider_note |
| `mark_documentation_complete` (NEW) | `rpc_mark_documentation_complete` | upsert_patient_note_summary |
| `queue_op` (existing) | existing RPCs | — |

## Direct-write-first pattern

In repositories (`PatientRepository`, `VisitRepository`, `NoteRepository`, `VitalsRepository`):

```kotlin
suspend fun saveNote(visitId: String, transcript: String, predecessorSyncId: String?): SaveResult {
    val note = buildLocalNote(visitId, transcript)
    providerNoteDao.upsert(note.toEntity(isSynced = false))

    if (networkMonitor.isOnline()) {
        try {
            supabaseApi.rpcUpsertProviderNote(note.toRpcParams())
            providerNoteDao.markSynced(note.id)
            return SaveResult(note, syncEntryId = null)
        } catch (e: Exception) {
            // Fall through to queueing
        }
    }

    val entry = SyncQueueEntry(
        operationType = "upsert_provider_note",
        entityId = note.id,
        payload = json.encodeToString(note.toRpcParams()),
        dependsOn = predecessorSyncId,
        // ...
    )
    syncQueueDao.insert(entry)
    return SaveResult(note, syncEntryId = entry.id)
}
```

Each repository returns the local entity **plus** an optional `syncEntryId` for callers to thread into the next link of the chain. RPCs are idempotent (`ON CONFLICT DO NOTHING / DO UPDATE`) — direct-write success and a later queued retry of the same op produce identical Supabase state.

## `dependsOn` chain — fixing the latent bug

Today, [NewVisitViewModel.kt:197](../apps/android/app/src/main/java/com/karibuhealth/app/ui/newvisit/NewVisitViewModel.kt:197) creates the patient and visit but never threads the patient's sync entry ID into the visit's `dependsOn`, even though `VisitRepository.createVisit` already accepts the parameter ([VisitRepository.kt:101](../apps/android/app/src/main/java/com/karibuhealth/app/data/repository/VisitRepository.kt:101)). This refactor fixes that and extends the chain to vitals/note/summary/complete.

Pattern:

```kotlin
val (patient, patientSyncId) = patientRepository.createPatient(...)
val (visit, visitSyncId) = visitRepository.createVisit(
    clinicId = clinicId,
    patientId = patient.id,
    doctorId = staffId,
    chiefComplaint = state.chiefComplaint,
    patientSyncEntryId = patientSyncId,
)
val (vitals, vitalsSyncId) = vitalsRepository.recordVitals(
    patientId = patient.id, visitId = visit.id, ...,
    visitSyncEntryId = visitSyncId,
)
val (note, noteSyncId) = noteRepository.saveNote(
    visitId = visit.id, transcript = transcript,
    predecessorSyncId = vitalsSyncId ?: visitSyncId,
)
val (summary, summarySyncId) = noteRepository.saveSummaryFallback(
    visitId = visit.id, content = transcript,   // raw clinician transcript as fallback
    predecessorSyncId = noteSyncId,
)
visitRepository.markDocumentationComplete(
    visitId = visit.id, predecessorSyncId = summarySyncId,
)
```

Each `predecessorSyncId` is null when the prior step direct-wrote successfully, set when it queued. Topological sort orders the queue accordingly.

## Android Room migration

App is on Room **schema version 3** today ([KaribuDatabase.kt:19](../apps/android/app/src/main/java/com/karibuhealth/app/data/local/db/KaribuDatabase.kt:19)) with only `MIGRATION_2_3` registered ([Migrations.kt:27](../apps/android/app/src/main/java/com/karibuhealth/app/data/local/db/migrations/Migrations.kt:27), wired in [DatabaseModule.kt:32](../apps/android/app/src/main/java/com/karibuhealth/app/di/DatabaseModule.kt:32)).

Bump to v4. New `MIGRATION_3_4`:

```kotlin
val MIGRATION_3_4 = object : Migration(3, 4) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("""
            CREATE TABLE IF NOT EXISTS patient_vitals (
                id TEXT PRIMARY KEY NOT NULL,
                patient_id TEXT NOT NULL,
                visit_id TEXT,
                recorded_at INTEGER NOT NULL,
                recorded_by TEXT,
                weight_kg REAL,
                height_cm REAL,
                temp_c REAL,
                bp_systolic INTEGER,
                bp_diastolic INTEGER,
                pulse_bpm INTEGER,
                resp_rate INTEGER,
                spo2_pct INTEGER,
                muac_cm REAL,
                notes TEXT,
                is_synced INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
                FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE SET NULL
            )
        """.trimIndent())
        db.execSQL("CREATE INDEX idx_patient_vitals_patient ON patient_vitals(patient_id, recorded_at DESC)")
        db.execSQL("CREATE INDEX idx_patient_vitals_visit ON patient_vitals(visit_id)")
        db.execSQL("ALTER TABLE visits ADD COLUMN documentation_complete INTEGER NOT NULL DEFAULT 0")
        db.execSQL("ALTER TABLE visits ADD COLUMN documentation_completed_at INTEGER")
        // department: server-side since migration 024, mirror locally so VisitEntity round-trips.
        db.execSQL("ALTER TABLE visits ADD COLUMN department TEXT NOT NULL DEFAULT 'opd'")
    }
}
```

Register in `DatabaseModule.kt`. Bump `KaribuDatabase` `version = 3` → `version = 4` and add `PatientVitalsEntity::class` to `entities = [...]`.

## DTO / domain / mapper updates

The new server fields must reach the client model:

- **`apps/android/app/src/main/java/com/karibuhealth/app/data/remote/dto/Dtos.kt`** — add `documentationComplete: Boolean = false`, `documentationCompletedAt: String? = null`, and `department: String = "opd"` to `VisitDto` (`department` already exists server-side from migration 024 but isn't in the DTO yet). Add new `PatientVitalsDto`. Add `department: String? = null` to `VisitCreateDto` so `rpc_create_visit` can accept it.
- **`apps/android/app/src/main/java/com/karibuhealth/app/domain/model/Models.kt`** — add `documentationComplete: Boolean`, `documentationCompletedAt: String?`, and `department: String` to `Visit`. Add `PatientVitals` domain model.
- **`apps/android/app/src/main/java/com/karibuhealth/app/data/local/db/entity/Entities.kt`** — add fields to `VisitEntity` (including `department: String NOT NULL DEFAULT 'opd'`). Add `PatientVitalsEntity`.
- **`apps/android/app/src/main/java/com/karibuhealth/app/data/local/db/converter/Mappers.kt`** — extend the four `Visit` converters (entity↔domain, dto→entity) to round-trip the new fields. Add converters for `PatientVitals`.
- **`packages/shared/src/types.ts`** — add `documentation_complete: boolean`, `documentation_completed_at: string | null`, and `department` (typed enum: `'opd' | 'anc' | 'maternity' | 'family_planning' | 'immunization'`) to the `Visit` shared type. Add `PatientVitals`. Web app, edge functions, and Inngest all read from here.

## Same-phase consumer updates (the real work behind the status semantic change)

Because `documentation_complete=true` advances `status: pending → sent`, every consumer that conditions on `status='pending'` must be updated in the same phase. Checked exhaustively:

### Android

- **[VisitDao.kt:52-62](../apps/android/app/src/main/java/com/karibuhealth/app/data/local/db/dao/VisitDao.kt:52)** `getMyPendingDictations` — change predicate from `status='pending' AND queue_status='with_doctor'` to `documentation_complete = 0 AND queue_status='with_doctor'`. Same intent ("clinician hasn't finished writing"), correct under the new semantics.
- **[VisitDao.kt:64+](../apps/android/app/src/main/java/com/karibuhealth/app/data/local/db/dao/VisitDao.kt:64)** `getMyVisitsToReview` — semantically these are AI-structured visits awaiting review approval. Stays `status='review'`. No change.
- **[VisitDetailsScreen.kt + ViewModel](../apps/android/app/src/main/java/com/karibuhealth/app/ui/visitdetails/)** — gating logic for "show dictation card" vs "show AI structuring spinner" vs "show approve buttons" needs to consider `documentation_complete` not just `status`.
- **Navigation**: [KaribuNavHost.kt:112](../apps/android/app/src/main/java/com/karibuhealth/app/ui/navigation/KaribuNavHost.kt:112) currently routes to payment only after `ReviewScreen` approval. Add a path: when `status='sent' AND documentation_complete=true AND no AI run pending`, show "Proceed to payment" button on `VisitDetailsScreen` that navigates straight to the payment screen, bypassing `ReviewScreen` entirely.

### Web

- **[VisitDetailClient.tsx](../apps/web/src/app/dashboard/visits/[id]/VisitDetailClient.tsx)** — top-of-file lifecycle comment is the source of truth for the dashboard; update to describe the new "skip review on direct save" path. The conditional that renders `PendingDictationCard` when `status='pending'` needs a sub-clause: only render it when `!documentation_complete`. After save (status='sent', documentation_complete=true) the page should show the print/payment surface even if AI hasn't run.
- **[PendingDictationCard.tsx:10](../apps/web/src/app/dashboard/visits/[id]/PendingDictationCard.tsx:10)** — the "AI is structuring..." copy assumes `pending + transcript = AI in flight`. With direct save, that combination becomes momentary (transcript is written, status flips to 'sent' in the same RPC). For visits that genuinely have AI in flight (clinician tapped Structure with AI), `status` stays `pending` and `submit-dictation` workflow runs through the existing pipeline — its terminal state is `status='review'`. So the card is still correct *for AI flows*; it just shouldn't render when `documentation_complete=true && status='sent'`.
- **Review queue** ([apps/web/src/app/dashboard/review/](../apps/web/src/app/dashboard/review/)) — already filters on `status='review'`, so direct-saved visits never appear there. No change.
- **HMIS reports** ([013_hmis_reporting.sql:157](../packages/supabase/migrations/013_hmis_reporting.sql:157)) — already filter on `status IN ('sent','completed')`. Direct-saved visits land in `sent` and are correctly counted. No change.
- **Print page** ([apps/web/src/app/dashboard/visits/[id]/print/](../apps/web/src/app/dashboard/visits/[id]/print/)) — gated on `patient_notes.content` being non-null. Clinician fallback `rpc_upsert_patient_note_summary` populates this with the raw transcript at save time. No change to the print page itself.

## Android client changes — file inventory

### New files
- `data/local/db/entity/PatientVitalsEntity.kt`
- `data/local/db/dao/PatientVitalsDao.kt`
- `data/local/db/migrations/Migrations.kt` — append `MIGRATION_3_4`
- `data/remote/dto/Dtos.kt` — append `PatientVitalsDto`
- `data/repository/VitalsRepository.kt`
- `ui/vitals/VitalsScreen.kt`, `ui/vitals/VitalsViewModel.kt`

### Edited files
- `data/local/db/KaribuDatabase.kt` — version 3→4, register `PatientVitalsEntity` in `entities = [...]`
- `data/local/db/entity/Entities.kt` — add `documentationComplete: Boolean`, `documentationCompletedAt: Long?` to `VisitEntity`
- `data/local/db/dao/VisitDao.kt` — adjust `getMyPendingDictations` predicate; add vitals-aware joins where useful
- `di/DatabaseModule.kt` — add `MIGRATION_3_4` to `addMigrations(...)`
- `data/remote/api/SupabaseApi.kt` — add RPC method declarations (`rpcCreateVisit`, `rpcUpsertProviderNote`, `rpcUpsertPatientNoteSummary`, `rpcInsertPatientVitals`, `rpcMarkDocumentationComplete`)
- `data/remote/dto/Dtos.kt` — add `documentation_complete` / `documentation_completed_at` to `VisitDto`
- `data/repository/PatientRepository.kt` — return `(Patient, syncEntryId)` from `createPatient`
- `data/repository/VisitRepository.kt` — accept `chiefComplaint`; switch to `rpc_create_visit`; thread sync entry IDs; new `markDocumentationComplete`
- `data/repository/NoteRepository.kt` — replace `saveDraftTranscript` with `saveNoteAndQueue` (provider_note) + `saveSummaryFallback` (patient_note); accept `predecessorSyncId`
- `data/sync/SyncEngine.kt` — handle new operation types
- `domain/model/Models.kt` — add `documentationComplete` etc. to `Visit`; add `PatientVitals`
- `data/local/db/converter/Mappers.kt` — extend converters
- `ui/newvisit/NewVisitViewModel.kt` — capture `chiefComplaint`, thread `patientSyncEntryId`, navigate to VitalsScreen on submit
- `ui/newvisit/NewVisitScreen.kt` — add chief-complaint input
- `ui/dictation/DictationViewModel.kt` — rewrite Save flow; drop AI-mode toggle; chain through provider_note + patient_note + mark_complete
- `ui/dictation/DictationScreen.kt` — single Save button; small "Structure with AI" bottom-right button
- `ui/visitdetails/VisitDetailsScreen.kt` — vitals + AI display; "Proceed to payment" CTA when `status='sent' && documentation_complete=true`
- `ui/visitdetails/VisitDetailsViewModel.kt` — same
- `ui/navigation/NavRoutes.kt`, `ui/navigation/KaribuNavHost.kt` — add Vitals route; allow VisitDetails → Payment

### Not deleted
- `submit-dictation`, `approve-dictation`, `reject-dictation` edge functions
- `DictationApiClient.submitDictation/approveDictation/rejectDictation`
- `provider_notes.note_content`, `structured_data` columns
- `ReviewScreen` — used by AI-augmented review path
- `DictationRecorder` — used by `dictate` voice opt-in

## Phasing

### Phase 0 — Server-side foundation (~30 min)
Migration `030_offline_first_foundation.sql`:
- `patient_vitals` table + RLS + select policy
- `visits.documentation_complete` + `documentation_completed_at` columns
- `patient_notes.source` column
- All five SECURITY DEFINER RPCs with GRANT EXECUTE TO anon, authenticated
- One Inngest tweak: set `source='ai_generated'` when writing `patient_notes`

Verification:
```bash
# Each RPC, with a real Clerk JWT
curl -X POST "$SUPABASE_URL/rest/v1/rpc/rpc_create_visit" \
  -H "Authorization: Bearer $JWT" -H "apikey: $ANON_KEY" \
  -d '{"p_id":"...","p_clinic_id":"...","p_patient_id":"...","p_visit_date":"2026-05-07"}'
# expect 204 No Content
```

### Phase 1 — Android offline-first end-to-end + same-phase consumer updates (~1 day)
- Local Room migration 3→4
- New entities/DAOs/DTOs/domain models/mappers
- Sync queue extensions, real `dependsOn` linearization
- Repositories return `(entity, syncEntryId)` tuples
- VitalsScreen + chief-complaint capture in NewVisit
- Simplified DictationScreen (single Save)
- VisitDao "needs dictation" predicate updated to use `documentation_complete`
- VisitDetailsScreen "Proceed to payment" CTA path
- **Web consumer updates in the same PR**: VisitDetailClient + PendingDictationCard guards on `documentation_complete`

Verification (Android):
- Airplane mode → patient → vitals → note → save. All rows in local Room. Sync queue holds 6 dependent entries in order.
- Re-enable Wi-Fi → sync runs → all rows in Supabase. Visit ends in `status='sent'`, `documentation_complete=true`.
- On Wi-Fi → all 6 RPC calls succeed direct-write within ~2s of each tap.
- Receipt prints from `patient_notes.content` (clinician fallback row).

Verification (web):
- Visit detail of direct-saved visit no longer shows "AI is structuring..."; shows print/payment surface.
- Review queue is empty for direct-saved visits.
- HMIS report counts the visit (filters on `status IN ('sent','completed')`).

### Phase 2 — AI as opt-in UX polish (~half day)
- Small "Structure with AI" button bottom-right under saved note on `VisitDetailsScreen`
- Tap → existing `submit-dictation` edge function → existing Inngest workflow
- Visit details polls `provider_notes.note_content` for ~60s after firing
- AI-completed `patient_notes` row overwrites the clinician fallback (already handled by upsert WHERE clause)

### Post-Phase-2 roadmap (clinical branches > AI polish)

The Susunga HC III patient-flow diagram (`docs/susunga-hc3-patient-flow.md`) makes clear that **lab, pharmacy, admission, and reception are first-class operational branches**, not edge cases. The next clinical phases are these — not more AI work. AI structuring is already adequate for the volume it serves; lab/pharmacy/admission don't exist in the app at all.

#### Phase 3a — Reception screen + records_officer routing
Reception screen for `records_officer` role: register patient + choose `department` (OPD / ANC / maternity / family planning / immunization) + route. Today the clinician registers their own patients in `NewVisitViewModel`; this phase splits front-desk vs clinical responsibilities.

#### Phase 3b — Lab orders + lab results
New `lab_orders` and `lab_results` tables. Lab tech UI (writeable by `lab_tech` role). OPD/Maternity "lab pending" state on the visit details screen — clinician orders lab → blocks for result → resumes encounter. This is the bidirectional workflow the diagram makes explicit.

#### Phase 3c — Prescriptions + dispensing
New `prescriptions` and `dispense_records` tables (replacing the flattened `visits.medications` text field once safe to do so). Pharmacy UI for `dispenser` role. Clinician writes prescription → pharmacy dispenses → dispense record closes the loop.

#### Phase 3d — Admission / inpatient + maternity sub-encounters
Begins the migration toward `care_episode + encounter`. Admission decision creates an inpatient record that can span multiple days with longitudinal vitals (already handled by `patient_vitals` table-keyed-on-patient design). Maternity branches into ANC / prenatal / postnatal / immunization sub-records.

#### Phase 3e — Webapp central-reviewer (non-blocking, can run in parallel with 3a–3d)
Extends [coding-actions.ts:27](../apps/web/src/app/dashboard/admin/reports/coding-actions.ts:27). Lower priority than the clinical branches.

### Phase 4+ — Cleanup, only when every consumer has migrated
None of this is committed:
- Maybe rename `submit-dictation` → `structure-note`
- Maybe split AI output into separate table for run history
- Maybe retire flattened `visits.diagnosis` etc.
- Eventually consolidate `visits` into `care_episode + encounter` — gated on lab/pharmacy/admission consumers having moved to the encounter model

## Verification matrix

| Capability | Online direct-write | Offline queued | Notes |
|---|---|---|---|
| Create patient | ✓ | ✓ | Existing path |
| Create visit (chief complaint) | ✓ | ✓ | Now via `rpc_create_visit` (fixes 404) |
| Capture vitals | ✓ | ✓ | New `rpc_insert_patient_vitals` |
| Save clinician note | ✓ | ✓ | New `rpc_upsert_provider_note`, role-aware |
| Save patient receipt summary (fallback) | ✓ | ✓ | `source='clinician_fallback'` |
| Mark documentation complete | ✓ | ✓ | Advances status pending→sent atomically |
| Reach payment | ✓ | n/a | Via VisitDetailsScreen → Payment route |
| Print receipt | ✓ | n/a | Falls back to clinician transcript when no AI |
| Trigger AI structuring | ✓ | n/a | Existing `submit-dictation` edge function |
| AI overwrites patient_notes | server-side | server-side | WHERE source='clinician_fallback' clause |
| HMIS reports include visit | server-side | server-side | Filter on status IN ('sent','completed') |

## Risks

1. **Direct-write race vs queue.** RPCs are `ON CONFLICT DO NOTHING / DO UPDATE`. Idempotent. Local entity `is_synced` may briefly disagree with server state.
2. **`patient_notes` source clobber.** AI overwrites only `source='clinician_fallback'` rows. Clinician edits to receipts (out-of-scope feature) would need re-thinking.
3. **Role allowlist drift.** Hardcoded role list in RPCs (`'admin','doctor','nurse','clinical_officer','midwife','nursing_assistant'`) must stay in sync with `staff_role_check` constraint in [024_hc3_roles_and_departments.sql:40](../packages/supabase/migrations/024_hc3_roles_and_departments.sql:40). Comment in migration 030 calls this out.
4. **Status transition is the one semantic change.** Every consumer of `status='pending'` must be reviewed. Checklist above is exhaustive based on grep — but full QA on the web app's review queue is essential before shipping Phase 1.
5. **Sync queue depth on a fully offline day.** 40 patients × ~6 entries = 240 queue entries. Topological sort O(N log N), DAO ops indexed. Worth eyeballing under simulated load before a high-volume clinic deployment.
6. **Linear vs DAG dependencies.** Sync queue can only express linear chains. If we ever need real DAG (e.g., note depends on vitals AND visit, where vitals doesn't depend on visit) we'd extend the schema. Today linear is sufficient.

## Decisions locked across this conversation + Codex rounds

- **Strictly additive through Phase 1**: no schema drops, no new edge functions, no enum collapses.
- **`visits` is a compatibility container.** Eventual target = `care_episode + encounter`. Everything added now is forward-compatible (vitals on patient_id, clinician fallback, documentation_complete flag).
- **Reuse `visits.department`** ([024_hc3_roles_and_departments.sql:47](../packages/supabase/migrations/024_hc3_roles_and_departments.sql:47)) for OPD vs ANC vs maternity routing. Don't invent a parallel `encounter_type` axis. `rpc_create_visit` accepts `p_department TEXT DEFAULT 'opd'`.
- **Post-Phase-2 priorities are clinical branches, not AI polish**: reception routing, lab orders/results, prescriptions/dispensing, admission/inpatient. Webapp central-reviewer can run in parallel with these.
- **One coordinated semantic change**: `documentation_complete=true` advances `status: pending → sent`. Same-phase consumer updates in Android `VisitDao`, web `VisitDetailClient` / `PendingDictationCard`. HMIS reports + payment unchanged.
- **`patient_vitals`** keyed on `patient_id` with nullable `visit_id` for inpatient longitudinal pattern.
- **Three-layer note model uses existing tables** (`provider_notes.transcript` + `provider_notes.note_content`/`structured_data` + `patient_notes.content`); `patient_notes.source` discriminator added to allow clinician fallback alongside AI overwrite.
- **No new `ai_notes` or `diagnosis_codes` tables.** Existing `hmis_diagnosis_codes` + `visit_diagnosis_codes` reused.
- **Patient-summary fallback content = clinician's raw transcript.** No prettifying. AI later overwrites with polished version.
- **SECURITY DEFINER RPCs** for all new write paths; role allowlist `'admin','doctor','nurse','clinical_officer','midwife','nursing_assistant'` matches actual `staff_role_check`. `GRANT EXECUTE TO anon, authenticated` on every RPC.
- **`uuid_generate_v4()`** matches repo convention.
- **Sync queue dependencies linearized** (single `depends_on` per entry). Document chain explicitly.
- **DTO + domain + mapper updates** in same phase as Room migration.
- **Android Room version 3 → 4** with `MIGRATION_3_4`.
- **Direct-write first, queue on failure** with idempotent RPCs.
- **AI button**: small, bottom-right under the note. Secondary affordance.
- **No manual HMIS picker on Android.** Codes are AI-suggested + central-reviewer-confirmed in webapp.
- **Edge functions**: keep all four (`dictate`, `submit-dictation`, `approve-dictation`, `reject-dictation`). No new edge functions in Phase 0–2.
- **Inngest**: one-line change to set `patient_notes.source = 'ai_generated'`.
- **Real `dependsOn` chain** through repositories — fixes the latent bug Codex flagged.
- **Chief-complaint capture** added to `NewVisitViewModel` — closes existing gap.
- **Payment reachable from `VisitDetailsScreen`** when `status='sent' && documentation_complete=true`, bypassing `ReviewScreen` for the non-AI path.
