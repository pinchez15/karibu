# HC III Rollout Plan — Karibu Health Mobile-first

**Audience:** internal eng + product. Single HC III diocesan facility, ~40 visits/day, expanding from one CO beta to full multi-role staffing. Android is the primary operational client, but the webapp must mirror the same workflows for clinics that prefer a laptop at reception, lab, pharmacy, or cashier.

**Constraints anchoring this plan:**

- Dictation-only product. No ambient recording, no patient consent flow (per migration 023).
- Offline-first Android client. SQLite (Room) cache + a `sync_queue` write log + `SyncWorker` push + `PullSyncManager` pull. Realtime is best-effort only.
- Android-first in the field, web-parity by contract. No core workflow should exist only on web if the clinic needs it to run care; web is the alternate surface for the same tables/RPCs, not a separate product. In practice, stationary desks like lab, pharmacy, and cashier will often default to web/laptop, while mobile clinicians default to Android.
- Migration 024 is assumed in place: roles expanded, `visits.department` added with `'opd'` default, `generate_hmis_105` filters to OPD only, `start_visit_self_triage(visit_id)` RPC exists.
- The CO home shipping this week is the reference shell. Each role-specific home reuses its scaffold (clinic header, sign-out, FAB, pull-to-refresh, status chips) and overrides the queue filter + quick actions.

---

## 1. Records Officer home

### 1a. Target user and primary tasks

The **Records Officer** is the first staff member every patient meets. They run the front desk: lookup or register the patient, take payment for OPD card / consultation fee where applicable, and check the patient into the right department. At HC III they do this from a single Android phone (often shared with the dispenser between busy windows).

Primary on-screen tasks, ordered by frequency:

1. Find an existing patient by name OR phone OR national ID (~80% of arrivals are returning).
2. Register a new patient (~20% on a busy day, more during outreach weeks).
3. Pick the destination department and check in.
4. See "Today's check-ins" — what they have already processed today, in case the patient comes back to the desk asking about their card.

### 1b. Wireframe (ASCII)

```
+-----------------------------------------------+
| Kapeeka HC III           Records — Mary N.  ⏻ |
+-----------------------------------------------+
| [ Search: name / phone / ID ............🔍 ] |
|                                               |
| [ + Register new patient ]   [ Today: 27 ]    |
+-----------------------------------------------+
| TODAY'S CHECK-INS              filter: [All▾] |
|                                               |
| #028  Akello Grace      ANC      Waiting  ⏱5m |
|       0772 123 456 · F · 24                   |
| #027  Mukasa David      OPD      With CO ⏱32m |
|       0701 987 654 · M · 41                   |
| #026  Nansubuga Jane    OPD      Done    ⏱1h  |
|       — · F · 6                               |
| #025  Lubega Peter      ANC      With Mid⏱18m |
|       0782 333 222 · F · 28                   |
+-----------------------------------------------+
| Search results appear in a sheet over the     |
| list when search field is active. Hit + on a  |
| match → "Check in to..." picker. Hit + with   |
| no match → registration form pre-filled with  |
| the search query (phone or name).             |
+-----------------------------------------------+
```

Search results sheet (overlay):

```
+-----------------------------------------------+
| 3 matches for "akello"                  Close |
+-----------------------------------------------+
| Akello Grace            #100847    F · 24     |
|   0772 123 456                                |
| Akello Mary             #100612    F · 39     |
|   0700 555 121                                |
| Akello Peter            #100401    M · 7      |
|   —                                           |
+-----------------------------------------------+
| No match? [ + Register "akello" as new ]      |
+-----------------------------------------------+
```

Registration form (full screen, replaces today's `NewVisitScreen` for records officer):

```
+-----------------------------------------------+
| ← Register patient                            |
+-----------------------------------------------+
| First name *  [ Grace ............. ]         |
| Last name  *  [ Akello ............ ]         |
| Sex        *  ( ) M  (•) F                    |
| Date of birth (or age)  [ 24 yrs ▾]           |
| Phone (optional)  [ 0772 123 456 ]            |
| National ID (optional) [ CM87... ]            |
| Village / Parish (optional) [ Bukomero ]      |
+-----------------------------------------------+
| Check in to *                                  |
| ( ) OPD   (•) ANC   ( ) Maternity             |
| ( ) Family planning   ( ) Immunization        |
+-----------------------------------------------+
| Chief complaint / reason (optional)           |
| [ ........................................ ] |
+-----------------------------------------------+
| Priority   [Normal▾]   (Urgent flips banner)  |
+-----------------------------------------------+
|         [ Save & Check in ]                    |
+-----------------------------------------------+
```

### 1c. Data model changes

The records flow needs three things the schema doesn't have yet.

**(i) Search by national ID.** Add `national_id TEXT` to `patients` (nullable). Migration:

- `ALTER TABLE patients ADD COLUMN national_id TEXT;`
- Partial unique index per clinic, only when not null:
  - `CREATE UNIQUE INDEX idx_patients_clinic_national_id ON patients(clinic_id, national_id) WHERE national_id IS NOT NULL;`
- Trigram index for fuzzy name search:
  - `CREATE EXTENSION IF NOT EXISTS pg_trgm;`
  - `CREATE INDEX idx_patients_first_name_trgm ON patients USING gin (first_name gin_trgm_ops);`
  - `CREATE INDEX idx_patients_last_name_trgm  ON patients USING gin (last_name  gin_trgm_ops);`

Rationale: phone is already partial-unique (017). National ID adoption in rural Uganda is patchy but the records officers frequently key on the NIN card, so we should index it. Trigram beats `LIKE '%foo%'` once the patient roster crosses ~5K rows (HC III hits 5K patients in ~1 year of operation).

**(ii) Records officer → visit linkage.** The current schema has `nurse_id` and `doctor_id` on `visits` but no `records_officer_id`. Without it we can't filter "Today's check-ins by me" cleanly, and we can't audit who registered which patient. Two options:

- **Option A (recommended):** add `created_by UUID REFERENCES staff(id) ON DELETE SET NULL` to `visits`. Generic, future-proof, also covers self-triage CO and midwife-walks-up cases. The records officer is just whoever set `created_by`.
- Option B: dedicated `records_officer_id`. Rejected — too narrow, doesn't model midwife/CO direct creation.

**(iii) Department check-in RPC.** Today there is `check_in_patient(p_clinic_id, p_patient_id, p_chief_complaint, p_priority, p_staff_id)`. After 024 we need a new wrapper that also takes `p_department` and writes `created_by`:

```
check_in_patient_v2(
  p_clinic_id UUID,
  p_patient_id UUID,
  p_department TEXT,
  p_chief_complaint TEXT,
  p_priority TEXT,
  p_created_by UUID
) RETURNS UUID
```

Rationale for a new RPC vs adding params: existing CO beta callers already use the v1 signature; bumping the version keeps them working while we migrate the Android side. Keep v1 as a thin shim that calls v2 with `p_department='opd'` and `p_created_by=p_staff_id`.

**(iv) RLS.** Records officers need:

- `SELECT` on patients in their clinic (already covered by patients_select_policy in 009).
- `INSERT` on patients in their clinic (covered).
- `UPDATE` on patients (currently doctor/admin only). **Change required:** add records_officer to the role list in `patients_update_policy` so they can fix typos in the name/DOB they just typed. Window: only their own creations within 24h, or just allow it broadly — propose broadly, since records correction is their job.
- `EXECUTE` on `check_in_patient_v2` — already public-execute pattern.

### 1d. Network payload shape and size

At HC III scale, 40 patients/day, ~30 unique returning per day plus ~10 new registrations.

**On-focus pull (Today's check-ins):** RPC call to `get_clinic_queue(clinic_id)` filtered client-side by `visit_date = today`. Existing function. Returns ~40 rows × ~250 bytes JSON each = **~10 KB per refresh**. Acceptable.

**Search:** call `GET /patients?clinic_id=eq.<id>&or=(first_name.ilike.%foo%,last_name.ilike.%foo%,whatsapp_number.ilike.%foo%,national_id.ilike.%foo%)` with `limit=20`. Worst case 20 × ~300 bytes = **~6 KB per search**. Debounced 250 ms. Initial page-load also pulls the patient roster into the local Room cache; from then on, search runs against SQLite.

**Patient roster pre-cache:** existing `patientRepository.refreshPatients(clinicId)`. 5K patients × ~300 bytes = **~1.5 MB**. Done once at login, refreshed lazily. This is the single biggest payload — gate it behind WiFi-preferred sync, and stream it in pages of 500.

**Check-in:** RPC call `check_in_patient_v2`. Request ~250 bytes, response is the new visit row ~600 bytes. Negligible.

**Daily total for one Records Officer device:** ~50 search hits × 6 KB + ~40 check-ins × 1 KB + ~20 queue refreshes × 10 KB + 1.5 MB initial sync ≈ **~2 MB/day after initial sync**, roughly UGX 100 of mobile data on MTN.

### 1e. Sync strategy

| Data | Strategy | Why |
|---|---|---|
| Patient roster | Pull on login + WiFi-preferred refresh every 24h | Big payload, low churn |
| Patient search | Local SQLite (room) | Sub-100ms even on cheap phones; survives offline |
| Today's check-ins list | Pull-on-focus + realtime queue-updates broadcast | Records officer needs to see it move, but cheaply |
| New patient registration | Local insert + sync_queue (offline-first) | Already implemented in PatientRepository |
| Department check-in | Local visit insert + sync_queue with RPC payload | Same pattern as existing queue ops in SyncEngine |

The realtime client (`RealtimeClient.kt`) already subscribes to `realtime:queue-updates`. No change needed — Records Officer joins same channel and the existing message handler upserts visit rows into Room. Departments are just a `department` column on the same `visits` row, so no extra subscription.

### 1f. Accessibility / error / offline

- **Offline registration:** must work. Patient gets a local UUID, `patient_id` (the BIGINT human-readable one) is null until sync. Show "ID pending sync" in the receipt area. Already supported by `assign_patient_id` trigger server-side and `is_synced=false` in PatientEntity.
- **Phone number collision:** a returning patient with the same phone is the one case where the offline path can produce a duplicate. The sync engine already handles 409 by fetching existing and remapping `dependsOn` (see `syncCreatePatient`). Surface a non-blocking "merged with existing #100847" toast once sync resolves.
- **Search latency on older Android:** debounce 250 ms, limit 20, render ListItems with skeleton.
- **Error state for required fields:** "Sex" is required for HMIS 105. If not selected, block submit and inline-error with copy: "Sex is required for HMIS reporting."
- **Accessibility:** every chip / radio is a `Modifier.semantics` target. Records officers are often older — bump default font scale handling.

### 1g. HMIS / audit

- Every check-in becomes a visit. A visit needs to land in `status IN ('sent', 'completed')` to be counted in HMIS 105 (per 013), and the `generate_hmis_105` function (after 024) filters to `department = 'opd'`. So records-checked-in-but-never-finalized visits do **not** silently inflate the OPD report. Good.
- ANC / Maternity / FP / Immunization visits are recorded in the same `visits` table but excluded from HMIS 105 by department filter. They need separate aggregation functions (`generate_hmis_105_anc`, etc.) — out of scope for this workstream, flag as future.
- Visit creation already triggers `audit_visit_status_changes` on every status update (009). Adding `created_by` gives us the "who registered this patient" trail for free via `visits.updated_at` + `audit_logs`.

### 1h. Open questions

1. Is OPD-card payment a separate transaction from consultation payment, or one combined? If separate, Records collects the OPD card fee at check-in. (Need to confirm with the diocese — affects whether the records home shows a payment widget.)
2. National ID: should we validate format (Ugandan NIN is 14 chars, alphanumeric) or accept whatever the officer types?
3. Print paper queue ticket — out of scope but: what's the device? A Bluetooth thermal printer? The CO home payment receipt flow already prints — does that hardware exist at this clinic, or is it laptop-attached only?

---

## 2. Midwife / ANC home

### 2a. Target user and primary tasks

The **Enrolled Midwife** runs ANC, Maternity (deliveries + postnatal), and Family Planning. At HC III she has 2 colleagues but they often split (1 in delivery room, 2 in ANC clinic). The app needs to support both ANC outpatient flow and acute Maternity/PNC follow-ups. We are scoping ANC first; Maternity is a stub.

Primary tasks, ordered by frequency:

1. See today's ANC queue, sorted by gestational age trend or arrival time.
2. Open a returning ANC patient, see her **pregnancy episode** (visit 1/8 → visit 8/8, BP trend, weight trend, fundal height, hemoglobin from lab).
3. Take vitals + record ANC-specific observations (gestational age this visit, fundal height, fetal heart rate, presentation).
4. Dictate her note (same dictation flow as CO — the AI prompt should be ANC-aware).
5. Register a new pregnancy episode if first ANC visit.
6. Postnatal care follow-up list (separate sub-tab).

### 2b. Wireframe

```
+-----------------------------------------------+
| Kapeeka HC III      Midwife — Sarah K.      ⏻ |
+-----------------------------------------------+
| Tabs:  [ ANC (4) ] [ Maternity ] [ PNC (2) ]  |
+-----------------------------------------------+
| ANC QUEUE — TODAY                             |
|                                               |
| #028  Akello Grace      Visit 4 of 8          |
|       GA 28w · LMP 14-Oct  · BP 132/85 ⚠      |
|       [ Open ]    [ Take vitals ]             |
|                                               |
| #015  Namutebi Joyce    Visit 2 of 8          |
|       GA 16w · BP 110/70 · Hb 9.1             |
|       [ Open ]    [ Take vitals ]             |
|                                               |
| #003  Achieng Faith     Visit 7 of 8          |
|       GA 36w · BP 118/74 · breech?            |
|       [ Open ]    [ Take vitals ]             |
+-----------------------------------------------+
| FAB: [ + New ANC patient ]                     |
+-----------------------------------------------+
```

Pregnancy-episode detail (open patient):

```
+-----------------------------------------------+
| ← Akello Grace · #100847 · 24F                |
+-----------------------------------------------+
| Pregnancy episode #2     EDD 21 Jul 2026      |
| LMP 14 Oct · GA 28w · Gravida 2 · Para 1      |
+-----------------------------------------------+
| BP TREND                                       |
| 110/70  118/74  124/80  132/85⚠                |
|  V1      V2      V3      V4                    |
|                                               |
| WEIGHT  58 → 60 → 61.5 → 62.5 kg               |
| FUNDAL  —    —   24cm   28cm                   |
| Hb      —    9.1   —     —                     |
+-----------------------------------------------+
| LAB results from this episode                  |
|   • Urinalysis V1 (clean)                     |
|   • Hb V2 (9.1 g/dL — mild anaemia)            |
|   • RPR V1 (negative)                         |
|   • HIV V1 (negative)                         |
+-----------------------------------------------+
| Visits in this episode                         |
|  V1 03-Nov · normal     [ View note ]          |
|  V2 21-Dec · iron given [ View note ]          |
|  V3 18-Feb · normal     [ View note ]          |
|  V4 Today (in progress)                        |
+-----------------------------------------------+
| [ Take vitals ]   [ Dictate ANC note ]         |
+-----------------------------------------------+
```

### 2c. Data model changes (the big one)

**Pregnancy episode is the right abstraction.** ANC, delivery, and postnatal care are all keyed off the same pregnancy. A patient can have many pregnancies in her lifetime (Gravida 2, 3, 4...). So we need:

```
CREATE TABLE pregnancy_episodes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  lmp DATE,                              -- last menstrual period
  edd DATE,                              -- estimated date of delivery
  gravida INTEGER,                        -- total pregnancies including current
  parity INTEGER,                         -- prior live births
  blood_group TEXT,                       -- A+, O-, etc; nullable until tested
  rh_factor TEXT,                         -- pos/neg
  hiv_status_at_booking TEXT,             -- pos/neg/unknown
  status TEXT NOT NULL DEFAULT 'antenatal'
    CHECK (status IN ('antenatal','intrapartum','postnatal','closed','lost')),
  outcome TEXT
    CHECK (outcome IN ('live_birth','stillbirth','miscarriage','abortion','maternal_death','other')),
  delivery_date DATE,
  delivery_facility TEXT,
  notes TEXT,
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_preg_patient_active
  ON pregnancy_episodes(patient_id)
  WHERE status IN ('antenatal','intrapartum','postnatal');
```

Then on `visits`:

```
ALTER TABLE visits ADD COLUMN pregnancy_episode_id UUID
  REFERENCES pregnancy_episodes(id) ON DELETE SET NULL;
ALTER TABLE visits ADD COLUMN anc_visit_number INTEGER; -- 1..8 per WHO 2016
```

And a per-visit observations table for the structured ANC fields:

```
CREATE TABLE anc_observations (
  visit_id UUID PRIMARY KEY REFERENCES visits(id) ON DELETE CASCADE,
  gestational_age_weeks INTEGER,
  fundal_height_cm NUMERIC,
  fetal_heart_rate INTEGER,
  presentation TEXT,           -- cephalic/breech/transverse/unknown
  systolic_bp INTEGER,
  diastolic_bp INTEGER,
  pulse INTEGER,
  weight_kg NUMERIC,
  edema_grade INTEGER,         -- 0-3
  iron_dispensed BOOLEAN,
  iptp_doses_given INTEGER,    -- intermittent preventive treatment for malaria
  td_doses_given INTEGER,      -- tetanus vaccine
  notes TEXT,
  recorded_by UUID REFERENCES staff(id),
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Why this design over alternatives:**

- **Argued against:** dumping ANC data into a JSONB column on `visits`. Reason: the BP trend chart needs to query historical observations. JSONB makes "all systolic_bp for pregnancy_episode_id X" a full table scan. A relational shape lets us index on `(pregnancy_episode_id, recorded_at)` via the visit join.
- **Argued against:** modeling ANC visit number client-side from `COUNT(visits where pregnancy_episode_id=X)`. Reason: a missed visit shouldn't shift the numbering — visit 5 is visit 5 even if visit 4 was skipped. WHO's 8-contact ANC schedule has fixed gestational-age targets, so the visit number means something more than just "fifth row in the table."
- **Confirm Uganda standard:** Uganda MOH adopted WHO 2016's 8-contact ANC model in the *Reproductive Health Service Standards* (2017 edition) and the IRMNCAH-N strategy. So `anc_visit_number INTEGER` ranges 1..8. Future-proofing a 9th contact (high-risk add) is fine — we don't constrain.

**RPCs needed:**

- `start_anc_episode(p_patient_id, p_clinic_id, p_lmp, p_gravida, p_parity, p_created_by)` returns `pregnancy_episode_id`. EDD computed server-side as `lmp + INTERVAL '280 days'`.
- `start_anc_visit(p_patient_id, p_episode_id, p_clinic_id, p_chief_complaint, p_priority, p_created_by)` returns `visit_id`. Wraps `check_in_patient_v2` with `p_department='anc'` and links to episode. Computes `anc_visit_number = COUNT(visits where episode_id=X and visit_date <= today) + 1`. Returns the new visit row.
- `record_anc_observations(p_visit_id, p_obs JSONB)` upsert into `anc_observations`. Single row per visit.

**RLS:**

- `pregnancy_episodes`: SELECT for any clinic staff in the same clinic; INSERT/UPDATE for midwife or admin (and CO, since the CO might handle an ANC patient if the midwife is in the delivery room). Mirror the visit policy.
- `anc_observations`: same as above.

### 2d. Network payload size

**ANC queue pull on focus:** filter existing `get_clinic_queue` by `department='anc'` (need to add the column to the function output — see 4c). ~5 rows × ~400 bytes (extra fields: `anc_visit_number`, current `gestational_age_weeks`, last `systolic/diastolic_bp`) = **~2 KB**.

**Open patient → episode detail:** need (i) the active `pregnancy_episodes` row, (ii) all `visits` for that episode (typically 4-8 rows), (iii) all `anc_observations` for those visits, (iv) a few lab results (see workstream 3). Total: ~10 KB single-shot. Lazy-load — only on patient-tap.

**Vitals form save:** ~600 bytes JSONB → `record_anc_observations`. Negligible.

**ANC dictation:** identical to CO dictation — short audio direct to OpenAI Whisper via the dictate edge function, transcript text into provider_notes via Inngest. No new payload.

**Daily total:** ~10 ANC visits × (2 KB queue + 10 KB detail + 1 KB save + 2 KB note pull) = **~150 KB/day** for the midwife. Fine on 3G.

### 2e. Sync strategy

| Data | Strategy |
|---|---|
| ANC queue today | Pull-on-focus + realtime broadcast (same channel) |
| Pregnancy episode + history | Lazy-loaded on patient open, cached in Room |
| anc_observations | Local insert + sync_queue offline-first |
| Episode list per patient | Cached in Room, refreshed on focus |

New Room entities: `PregnancyEpisodeEntity`, `AncObservationEntity`. New DAOs. The pull triggered by `PullSyncManager.pullAll()` should fan out to also fetch active episodes for any patient currently in today's queue (~5 patients × 1 episode each = 5 rows; trivial).

For the BP-trend chart we render from cached `anc_observations` joined to `visits` ordered by `visit_date` — purely local query.

### 2f. Accessibility / error / offline

- **GA calculation:** if LMP is known, GA in weeks at this visit is computed `(visit_date - lmp) / 7`. If LMP unknown (~30% in rural Uganda — women don't always remember), midwife can override with palpation-based estimate. Mark `gestational_age_weeks` source as `ga_source TEXT CHECK (ga_source IN ('lmp','palpation','ultrasound'))`.
- **Red-flag visual cues:** BP > 140/90 → red badge "PRE-ECLAMPSIA?", show on queue card. Hb < 10 → orange "Anaemia." These are derived rules — render client-side from cached observations, no new column.
- **Offline:** start_anc_episode and start_anc_visit must enqueue to sync_queue. Episode gets a local UUID; ANC observations FK to that UUID; on sync, server-assigned UUIDs replace local ones via the existing `dependsOn` chain.
- **Multi-midwife conflict:** two midwives could open the same ANC patient and start a visit. Server-side: enforce that only one open (queue_status not in completed/cancelled) ANC visit per patient per day. Add a partial unique index:
  - `CREATE UNIQUE INDEX idx_visits_one_open_anc_per_day ON visits(patient_id, visit_date) WHERE department='anc' AND queue_status IN ('waiting','with_nurse','ready_for_doctor','with_doctor');`
- **Accessibility:** BP entry uses two number fields; consider a "Take vitals" wizard with one field per screen for older midwives.

### 2g. HMIS / audit

- ANC visits roll up to **HMIS 105 Section 1.3 (ANC)** and **HMIS 105A** maternal indicators, separate from OPD. We need a future migration `025_hmis_anc_reporting` that generates ANC completeness (1st/4th/8th visit before week 36) by patient cohort. Out of scope for this rollout — record the data correctly so the report is mechanical when we get there.
- Maternal death (`pregnancy_episodes.outcome='maternal_death'`) is a notifiable event and should auto-generate an HMIS 105 OPD death entry too. Add a trigger.
- Audit: every `pregnancy_episodes` write goes through `audit_logs` via a new trigger mirroring `log_visit_status_changes`.

### 2h. Open questions

1. Are postnatal visits (PNC) modeled as visits with `department='maternity'` linked to the pregnancy episode in `postnatal` status, or do we need `department='pnc'` as a separate enum value? Currently 024 lists `('opd','anc','maternity','family_planning','immunization')` — I'd argue PNC should join the list explicitly, since it's reported separately on HMIS 105.
2. Family planning: does the midwife use the same dashboard or a separate `/fp` tab? FP has its own register (HMIS form 080) with method-mix counts. Probably out of scope week 2-3, but flag.
3. Twin pregnancy / triplet: the `pregnancy_episodes` schema as drafted assumes singleton. Adding `expected_fetuses INTEGER DEFAULT 1` is cheap insurance.
4. Linked-newborn record: when delivery happens, the newborn needs a `patients` row. Auto-generate from the episode? Manual? (Affects records officer flow too.)

---

## 3. Lab tech home

### 3a. Target user and primary tasks

The **Lab Assistant** (HC III has one) runs basic point-of-care + microscopy. The lab runs 7am–4pm; in a busy morning he'll churn through ~15-25 tests across the catchment. This is a **desk workflow first**: a laptop on the bench or desk is the primary surface, with Android as a fallback / offline continuation path if the laptop is unavailable.

Primary tasks:

1. See pending lab orders ("CO ordered Hb + RDT for #100847").
2. Mark a sample as collected.
3. Enter results.
4. (Future) Print a lab slip the patient hands back to the CO.

### 3b. Wireframe

```
+-----------------------------------------------+
| Kapeeka HC III           Lab — Patrick O.   ⏻ |
+-----------------------------------------------+
| Tabs:  [ Pending (8) ] [ In progress (2) ]    |
|        [ Done today (15) ]                    |
+-----------------------------------------------+
| PENDING ORDERS                                |
|                                               |
| #028  Akello Grace · ANC                       |
|   • Hb (haemoglobin)         [ Collect ]       |
|   • RPR (syphilis)           [ Collect ]       |
|   • HIV rapid                [ Collect ]       |
|   ordered by Dr. Mary · 8m ago                |
|                                               |
| #027  Mukasa David · OPD                       |
|   • Malaria RDT              [ Collect ]       |
|   ordered by Dr. Mary · 2m ago                |
+-----------------------------------------------+
```

In-progress (sample collected, awaiting result):

```
+-----------------------------------------------+
| #028 Akello Grace                             |
|   Hb       [ ___ ] g/dL          [ Save ]      |
|   RPR      ( ) Reactive (•) NR   [ Save ]      |
|   HIV      ( ) Pos (•) Neg ( ) Indet [ Save ]  |
+-----------------------------------------------+
```

### 3c. Data model: structured lab orders, manual first

The offline-first shift changes the producer rule here: **lab orders cannot depend on AI**. A clinician or midwife must be able to place a structured lab order from Android or web even if no dictation or AI ever runs. AI extraction from the transcript is still useful, but only as a suggestion source that creates draft orders for confirmation.

Canonical creation paths, in priority order:

1. **Manual order composer on Android / web clinician screens** — the primary path.
2. **Manual order creation by lab tech** for walk-ins, paper referrals, or back-fill.
3. **Inngest backfill / AI extraction** into draft rows with `source='ai_extracted'` — optional, never the only path.

The structured lab-orders table is still the right foundation because it lets us route to the lab queue, attach results, and bill tests cleanly. Paper remains an operational fallback, not the system of record.

```
CREATE TABLE lab_test_codes (
  code TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  sample_type TEXT NOT NULL,         -- blood, urine, stool, swab
  result_type TEXT NOT NULL CHECK (result_type IN ('numeric','categorical','text')),
  unit TEXT,                          -- 'g/dL' for Hb, NULL for categorical
  reference_range TEXT,               -- '12-16 g/dL (F adult)' as text
  hc_iii_capable BOOLEAN DEFAULT FALSE,
  sort_order INTEGER
);

INSERT INTO lab_test_codes VALUES
 ('hb','Haemoglobin','blood','numeric','g/dL','12-16 (F), 13.5-17.5 (M)', TRUE, 1),
 ('blood_smear','Blood smear (malaria parasites)','blood','categorical',NULL,'+ / ++ / +++ / no parasites', TRUE, 2),
 ('urine_micro','Urinalysis (microscopy)','urine','text',NULL,NULL, TRUE, 3),
 ('rdt_malaria','Malaria RDT','blood','categorical',NULL,'positive / negative', TRUE, 4),
 ('hiv_rapid','HIV rapid test','blood','categorical',NULL,'positive / negative / indeterminate', TRUE, 5),
 ('rpr','Syphilis RPR','blood','categorical',NULL,'reactive / non-reactive', TRUE, 6),
 ('hbsag_rapid','Hepatitis B rapid (HBsAg)','blood','categorical',NULL,'positive / negative', TRUE, 7),
 ('preg_test','Pregnancy test (urine HCG)','urine','categorical',NULL,'positive / negative', TRUE, 8);

CREATE TABLE lab_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  test_code TEXT NOT NULL REFERENCES lab_test_codes(code),
  status TEXT NOT NULL DEFAULT 'ordered'
    CHECK (status IN ('ordered','collected','resulted','cancelled','rejected_sample')),
  ordered_by UUID REFERENCES staff(id),
  ordered_at TIMESTAMPTZ DEFAULT NOW(),
  collected_by UUID REFERENCES staff(id),
  collected_at TIMESTAMPTZ,
  resulted_by UUID REFERENCES staff(id),
  resulted_at TIMESTAMPTZ,
  result_value TEXT,                   -- "9.1" for numeric, "positive" for cat
  result_flag TEXT
    CHECK (result_flag IN ('normal','low','high','critical','positive','negative')),
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('ai_extracted','manual','ai_confirmed')),
  confidence NUMERIC,
  notes TEXT
);
CREATE INDEX idx_lab_orders_visit ON lab_orders(visit_id);
CREATE INDEX idx_lab_orders_status_date ON lab_orders(clinic_id, status, ordered_at);
```

**Optional AI assist:** add an Inngest step that returns `lab_orders: [{test_code, confidence}]` and writes them as `source='ai_extracted'`. The clinician or lab tech can confirm or reject them. If they're nonsense ("rabies titer" — not in our HC III code list), the row is rejected or normalized into a free-text `other` request.

**RLS:** lab_orders SELECT visible to all clinic staff (CO needs to see results, lab tech needs to see orders). INSERT/UPDATE for lab_tech, CO, midwife, admin.

**Result-entry RPC:**

```
record_lab_result(
  p_order_id UUID,
  p_result_value TEXT,
  p_result_flag TEXT,
  p_resulted_by UUID
) RETURNS VOID
```

Sets status='resulted', stamps timestamps, writes audit log entry.

### 3d. Network payload size

**Lab pending pull on focus:** filter `lab_orders` where `clinic_id=X AND status IN ('ordered','collected') AND ordered_at::date = today`. ~10-15 rows × ~250 bytes = **~3 KB**.

**Result entry:** ~300 bytes per RPC call.

**Daily total:** ~25 results × 300 bytes + 30 refreshes × 3 KB = **~100 KB/day**. Trivial.

### 3e. Sync strategy

| Data | Strategy |
|---|---|
| Pending orders | Pull-on-focus + realtime (subscribe to lab-orders broadcast) |
| Test code lookup | Pull once on login, cache in Room (~12 rows, <1 KB) |
| Result entry | Local insert + sync_queue → `record_lab_result` RPC |
| Done today | Pull-on-focus only |

Realtime: extend the existing `realtime:queue-updates` channel to also broadcast `lab_orders` changes, OR add a second channel `realtime:lab-updates` for the lab tech. Simpler: one channel, payload includes table name. The Android RealtimeClient needs to dispatch on `payload.table`.

### 3f. Result-entry workflow choice

**Recommendation:** lab tech enters results in the app **for tests on the structured code list**, paper slip for anything else. Reasons:

- Paper for a malaria RDT result that the CO already saw (one room over) is silly.
- For Hb, the numeric trend joins to the ANC pregnancy episode — only useful structured.
- Lab tech device adoption is the biggest risk here; design should let them ignore the app for a chaotic morning and back-fill in the afternoon. Hence the offline-first sync_queue is critical.

If the lab phone dies mid-day, paper lab slips remain the fallback. The records officer reception desk has a paper-form pad for that.

### 3g. HMIS / audit

- Lab volume rolls up to HMIS 105 Section 5 (laboratory). Out of scope to auto-generate that report this rollout, but the `lab_orders` table gives us the raw data.
- HIV positivity, malaria positivity rates feed HMIS 105 Section 1.1 (Malaria - Confirmed). The `result_flag='positive'` rows on `test_code='rdt_malaria'` are exactly what we need to cross-tabulate against the existing `visit_diagnosis_codes`. Confirmed-malaria diagnoses can be auto-linked via a future Inngest step.
- Audit: `record_lab_result` writes an audit_logs entry per call. Critical-flag results (Hb < 7) should also fire a notification to the CO (workstream 4).

### 3h. Open questions

1. Do we want a "rejected sample" path? (E.g. clotted blood — repeat draw needed.) The status enum includes it; UX-wise, does it kick the visit back into the CO's queue or just notify?
2. Pricing of lab tests (the diocese charges UGX 1500 for an RDT). If yes, lab orders feed the payment workstream — `payments` table needs a `service_type` of `'lab_<code>'`.
3. Should the lab tech ever **create** a lab order without a CO request? (Walk-in: pregnancy test, HIV test for an unsupervised teen.) Probably yes for HC III pragmatism. Implies a lab-tech-initiated `start_visit` flow with `department='opd'`, lab tech as `created_by`. Confirm scope.
4. Image attach (microscopy photo of slide for QA) — out of scope for this rollout.

---

## 4. Cross-tech visit handoff

### 4a. The state-machine problem

The current `queue_status` enum encodes one path:

```
waiting → with_nurse → ready_for_doctor → with_doctor → completed
                                              ↓
                                         cancelled
```

This breaks for:

- **Self-triage CO** (this week's beta): no nurse step. The CO claims the patient directly. Migration 024's `start_visit_self_triage(visit_id)` is exactly this — moves `waiting → with_doctor` skipping the middle. Good.
- **ANC**: midwife is both nurse and clinician. `with_doctor` doesn't fit semantically (she's not a doctor). UX-wise it's fine; the chip reads "With midwife" because we render based on role of `doctor_id`.
- **Lab loop**: CO orders labs, patient leaves consult room, walks to lab, returns to CO, CO finalizes. Today this collapses to "CO holds the patient as `with_doctor` the entire time" or "CO marks `completed` then the patient is invisible while waiting for lab." Both are wrong.

### 4b. State machine: option A (per-department) vs option B (unified with branches)

**Recommended: Option B — unified state machine with department-aware branches.** Rationale: per-department state machines proliferate enums, complicate the queue card (you can't show all departments in one list with a single chip), and force the audit log to know about department-specific states.

Proposed expanded enum (extends current):

```
queue_status:
  waiting              -- registered, in front-desk queue
  with_nurse           -- triage in progress (skipped for ANC, self-triage)
  ready_for_clinician  -- (rename ready_for_doctor; midwife is also a clinician)
  with_clinician       -- (rename with_doctor; same reason)
  awaiting_lab         -- NEW: clinician sent patient to lab; visit paused
  with_lab             -- NEW: lab tech has the sample
  awaiting_clinician   -- NEW: lab done, CO needs to re-claim
  awaiting_pharmacy    -- NEW: clinician finalized SOAP, patient walks to dispenser
  completed
  cancelled
```

This adds 4 states, all optional. A simple OPD visit goes `waiting → with_nurse → ready_for_clinician → with_clinician → awaiting_pharmacy → completed`. A self-triage CO with no labs goes `waiting → with_clinician → completed`. ANC is `waiting → with_clinician → completed` (or `awaiting_lab → with_lab → awaiting_clinician → with_clinician → completed` if labs ordered).

**Renaming `with_doctor` → `with_clinician`:** the CO shell already uses the literal string "with_doctor" in `QueueScreen.QueueStatusChip` (label "With Doctor"). If we rename:

- DB enum gets new values via a transitional CHECK constraint: `CHECK (queue_status IN ('waiting','with_nurse','ready_for_doctor','with_doctor','ready_for_clinician','with_clinician','awaiting_lab','with_lab','awaiting_clinician','awaiting_pharmacy','completed','cancelled'))`.
- Backfill: `UPDATE visits SET queue_status='with_clinician' WHERE queue_status='with_doctor'; UPDATE visits SET queue_status='ready_for_clinician' WHERE queue_status='ready_for_doctor';`
- Then drop legacy values once all clients are migrated. (Phase across two migrations: introduce → backfill clients → drop. Keeps the CO beta working while we ship multi-role.)

**RPCs needed for the new transitions:**

- `send_to_lab(p_visit_id, p_clinician_id)` — `with_clinician → awaiting_lab`. Emits realtime to lab channel.
- `lab_collect(p_order_id, p_lab_tech_id)` — moves the visit to `with_lab` if no other lab orders are still in `ordered`.
- `lab_complete(p_visit_id, p_lab_tech_id)` — when all `lab_orders` for the visit are `resulted`, moves visit to `awaiting_clinician`. Auto-fires from the `record_lab_result` trigger when last order resolves.
- `claim_after_lab(p_visit_id, p_clinician_id)` — `awaiting_clinician → with_clinician`.
- `send_to_pharmacy(p_visit_id, p_clinician_id)` — `with_clinician → awaiting_pharmacy`. Done at the moment of "approve SOAP + print".
- `pharmacy_complete(p_visit_id, p_dispenser_id)` — `awaiting_pharmacy → completed`. Records who dispensed.

### 4c. Multi-clinician visit and `doctor_id` shape

Today: `visits.doctor_id UUID` — single. A patient touched by two COs in one visit (handover during the lunch shift) overwrites. For HC III with one CO this is rare. For a multi-CO clinic in 2026 it's a real problem.

**Recommendation: introduce `visit_assignments` but don't drop `doctor_id` yet.**

```
CREATE TABLE visit_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  role_at_assignment TEXT NOT NULL,       -- snapshot of role; staff might change later
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  unassigned_at TIMESTAMPTZ,
  reason TEXT                              -- handover, lab, pharmacy, etc.
);
CREATE INDEX idx_visit_assignments_visit ON visit_assignments(visit_id, assigned_at DESC);
CREATE INDEX idx_visit_assignments_active
  ON visit_assignments(staff_id)
  WHERE unassigned_at IS NULL;
```

`visits.doctor_id` becomes "current primary clinician" — derived from the most recent active row in `visit_assignments` where `role_at_assignment='clinician'`. Maintained by triggers on `visit_assignments`. This gives us a full handover trail for free, and the existing CO home logic (`getRecentByDoctor(doctorId)`) keeps working.

### 4d. Handoff notifications

Three options:

1. **Push notifications (FCM).** Battery cost, requires Google Play Services (HC III phones likely have it but not guaranteed), requires a server-side trigger. Most "professional" feel.
2. **In-app badge on home + realtime broadcast.** Free, works as long as the app is foreground or recently backgrounded. **Recommended for week 2-3.**
3. **Audible chime when realtime delivers a new ready item.** Cheap accessibility; nurses already work with their phone audible.

**Recommendation:** Start with (2) + (3). Add FCM push only if onboarding feedback says staff are missing handoffs because they have the phone in pocket. Push adds ops surface (FCM token table, server-side function to fan out, certificate management).

### 4e. Visual indication of where the patient is

Each queue card already has a status chip. Extend to show two pieces of info on multi-step flows:

```
| #028 Akello Grace                              |
|       ANC · V4 of 8                            |
|       [ With midwife ] [ → Lab ordered ]       |
```

Render rules:

- Primary chip: maps from `queue_status`.
- Secondary chip (lab/pharmacy state): rendered only if `EXISTS lab_orders WHERE visit_id=X AND status IN ('ordered','collected')`, or if `awaiting_pharmacy`.
- Department prefix on the second line.

This is purely client-side derived from the existing `visits + lab_orders` joined view. No new schema.

### 4f. Audit / traceability

- Migration 011 added `audit_visit_status_changes` on every visit status change. New states fire too — no change needed.
- Add equivalent triggers on `visit_assignments` (assignments are status changes too) and `lab_orders` (every collect/result is auditable).
- HMIS doesn't care about transition timing for 105, but **timing data is the most actionable internal metric** — average wait at each stage, identifying bottleneck stations. Surface as an internal ops dashboard later (out of scope for week 2-3).

### 4g. Network payloads

Realtime broadcasts for state transitions are tiny (~400 bytes per event). At HC III with 40 visits/day and ~5 transitions per visit avg, that's 200 events/day across all subscribed clients. Each subscribed device pulls all of them but ignores most after Room upsert. Fine.

### 4h. Open questions

1. Does the same staff member act as both dispenser and cashier at this clinic, or are those separate people / desks? The answer affects whether Pharmacy and Payments share one home or two adjacent surfaces.
2. Should `awaiting_lab → with_lab` be automatic (on first sample collected) or explicit (lab tech taps "Start"))? Automatic is cleaner; explicit gives the lab tech control over what shows on his "in progress" tab.
3. State-machine enforcement: do we want a `visit_state_transitions` table that lists legal transitions, or hardcode them in the RPCs? RPCs are simpler, so hardcode. Revisit if we need a per-clinic config.
4. Patient leaves the clinic mid-flow ("I'll come back tomorrow"). Today there's no `paused` state. Treat as `cancelled` and have records officer create a new visit tomorrow? Or add `paused`? Probably `cancelled` for now — simpler.

---

## 5. Department picker on visit creation

### 5a. Where it appears

Two entry points:

1. **Records officer registration / check-in form** — full department picker, no default.
2. **Records officer existing-patient check-in** (after search match) — department picker required, no default.
3. **CO new visit (current beta)** — department defaults to `OPD`, hidden behind a "Change department" link. CO almost always self-triages OPD.
4. **Midwife new ANC visit** — department defaults to `ANC`, hidden behind a "Change department" link.
5. **Lab tech / dispenser** — never create visits (they consume them), so the picker doesn't appear.

### 5b. Default rules table

| Operator role | Default department | Mutable? |
|---|---|---|
| `records_officer` | none (must pick) | yes, free choice |
| `clinical_officer` | `opd` | yes, can switch to anc/maternity for cross-coverage |
| `midwife` | `anc` | yes, can switch to maternity/fp |
| `nurse`, `nursing_assistant` | `opd` | yes |
| `lab_tech`, `dispenser` | n/a — no create flow | n/a |
| `admin` | none (must pick) | yes |

This is computed in the ViewModel for `NewVisitScreen` from the cached staff role. No new endpoint.

### 5c. Data implications

- 024 already adds `visits.department` defaulting to `'opd'`. Existing CO-beta visits keep their OPD value.
- All new check-ins must set `department` explicitly via `check_in_patient_v2`. Migration enforces this for new rows by making the column NOT NULL: `ALTER TABLE visits ALTER COLUMN department SET NOT NULL;` (after 024 backfills the column). Schedule this as a follow-up migration once all callers are updated.
- Department feeds: HMIS 105 (OPD only), ANC reporting (future), per-department queue filters in workstream 4.

### 5d. Validation

- Cannot change department after `queue_status` has progressed past `waiting`. Enforce server-side with a trigger (see plan body in original agent output).
- Client-side: hide the picker in VisitDetails once `queue_status != 'waiting'`. Show it as a read-only chip.

### 5e. Wireframe (records officer registration form)

(See full wireframe in section 1b.)

For the CO (who sees a hidden picker):

```
+-----------------------------------------------+
| New visit                                     |
+-----------------------------------------------+
| Patient: Akello Grace, #100847                 |
| Department: OPD     [ change ]                 |
+-----------------------------------------------+
| Chief complaint                                |
| [ ........................................ ]  |
+-----------------------------------------------+
|         [ Start visit ]                        |
+-----------------------------------------------+
```

Tapping "change" expands to the radio list.

### 5f. Sync / payload

- The picker value is a single field on the existing `check_in_patient_v2` RPC payload. ~10 bytes overhead.
- Department is replicated to Room as part of the visits row. No new table.

### 5g. HMIS / audit

- HMIS 105 only counts OPD (per 024's filter on `generate_hmis_105`). ANC, FP, Maternity flow into separate forms.
- Audit: department is logged on every visit insert via the existing visit-status-change trigger metadata if we extend it to capture more columns. Or add a dedicated trigger. Not high priority.

### 5h. Open questions

1. Should "Immunization" walk-ins create a `visits` row, or are they tracked in a separate `immunizations` table (since most are vaccine-only events with no SOAP note)? Probably both — a thin visit + an immunization-specific child table later. Out of scope for this rollout but the picker entry already accommodates it.
2. "FP" (Family Planning) initial visit vs follow-up: do we show both as one department, or split into "FP — initial" / "FP — follow-up" picker options? Recommend one option, distinguish by a sub-field on the visit. Confirm.
3. Department permissions: should records officer be allowed to check a patient into Maternity? In practice the labor ward bypasses records (the woman walks straight in). Recommend: records can check in, midwife can also check in via her own home, no permission distinction.

---

## 6. Pharmacy / dispenser home

### 6a. Target user and primary tasks

The **Dispenser** is the last clinical handoff before the patient leaves. In the real HC III flow they do more than hand over tablets: they read what the clinician intended, confirm stock, partially fill when the store is short, counsel the patient, and sometimes collect or confirm payment. Like lab, this is usually a **stationary desk workflow**, so web/laptop should be treated as the primary surface and Android as the fallback / offline path.

Primary tasks:

1. See patients waiting for medication (`queue_status='awaiting_pharmacy'`).
2. Read the structured prescription list for the visit.
3. Mark each item as dispensed, partially dispensed, out of stock, or substituted.
4. Add brief dispensing notes ("amoxicillin syrup unavailable; tablets crushed and explained to mother").
5. Complete the visit once medication is handed over and any required payment is resolved.

### 6b. Wireframe

```
+-----------------------------------------------+
| Kapeeka HC III      Pharmacy — Ruth N.      ⏻ |
+-----------------------------------------------+
| Tabs: [ Waiting (6) ] [ In progress (2) ]      |
|       [ Done today (19) ]                      |
+-----------------------------------------------+
| WAITING FOR DISPENSE                           |
|                                               |
| #028  Akello Grace · OPD                      |
|   1. Amoxicillin 500mg  TDS x5 days          |
|   2. Paracetamol 500mg PRN                   |
|   Billing: UGX 4,500 outstanding             |
|   [ Open ]                                    |
|                                               |
| #015  Namutebi Joyce · ANC                    |
|   1. Iron + folate daily                     |
|   2. Fansidar DOT given in clinic            |
|   Billing: waived                             |
|   [ Open ]                                    |
+-----------------------------------------------+
```

Dispense detail:

```
+-----------------------------------------------+
| ← Akello Grace · #100847                      |
+-----------------------------------------------+
| PRESCRIPTIONS                                 |
| Amoxicillin 500mg                             |
| Prescribed: 15 caps                           |
| Dispense:   [ 15 ] caps                       |
| Status: (•) Dispensed  ( ) Partial  ( ) OOS   |
|                                               |
| Paracetamol 500mg                             |
| Prescribed: 10 tabs                           |
| Dispense:   [ 10 ] tabs                       |
| Status: (•) Dispensed                         |
+-----------------------------------------------+
| Notes                                         |
| [ Counselled to finish antibiotics ....... ]  |
+-----------------------------------------------+
| [ Save & complete ]   [ Save, send back ]     |
+-----------------------------------------------+
```

### 6c. Data model: structured prescriptions and dispense records

The current `visits.medications TEXT` field is enough for printing an AI summary, but not enough for a real pharmacy workflow. The dispenser needs discrete medication rows, quantities, and dispense outcomes. As with lab orders, **manual structured entry is mandatory**; AI suggestions are additive only.

Add a simple medication catalog first:

```
CREATE TABLE medication_catalog (
  code TEXT PRIMARY KEY,
  generic_name TEXT NOT NULL,
  strength TEXT,
  formulation TEXT,        -- tablet, capsule, syrup, injection, etc.
  unit TEXT,               -- tab, cap, bottle, vial
  active BOOLEAN NOT NULL DEFAULT TRUE,
  default_price_ugx INTEGER
);
```

Then the structured order table:

```
CREATE TABLE prescription_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  medication_code TEXT REFERENCES medication_catalog(code),
  free_text_name TEXT,  -- for temporary/local medicines not yet in catalog
  dose_text TEXT,
  route_text TEXT,
  frequency_text TEXT,
  duration_text TEXT,
  quantity_prescribed NUMERIC(10,2),
  quantity_unit TEXT,
  status TEXT NOT NULL DEFAULT 'ordered'
    CHECK (status IN ('ordered','dispensing','dispensed','partially_dispensed','out_of_stock','cancelled','needs_clarification')),
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual','manual_confirmed','ai_suggested')),
  ordered_by UUID REFERENCES staff(id),
  ordered_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);

CREATE TABLE dispense_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prescription_order_id UUID NOT NULL REFERENCES prescription_orders(id) ON DELETE CASCADE,
  dispensed_by UUID REFERENCES staff(id) NOT NULL,
  quantity_dispensed NUMERIC(10,2),
  quantity_unit TEXT,
  substitute_medication_code TEXT REFERENCES medication_catalog(code),
  notes TEXT,
  dispensed_at TIMESTAMPTZ DEFAULT NOW()
);
```

Design rules:

- **Clinician or midwife creates the prescription rows** from Android or web before sending to pharmacy.
- **AI may propose structured prescriptions later** from the transcript (`source='ai_suggested'`), but the dispenser never depends on that proposal existing.
- **Inventory is not Phase 1 of pharmacy.** We track what was dispensed, not full stock-on-hand. If stock control comes later, `dispense_records` becomes the fact table it builds on.

### 6d. Workflow

1. Clinician saves note.
2. Clinician opens a structured medication composer and adds 0..N prescription rows.
3. Visit transitions `with_clinician -> awaiting_pharmacy`.
4. Dispenser opens the visit, records what was actually dispensed.
5. If everything is clear, dispenser completes the pharmacy step and the visit can move to payment-complete / closed.
6. If something is ambiguous or unavailable, dispenser can send the visit back to `awaiting_clinician` with a reason (`needs_clarification`, `out_of_stock`).

The important operational point: **pharmacy is not reading free-text transcript as its source of truth**. It reads structured orders that can be authored without AI.

### 6e. Sync strategy

| Data | Strategy |
|---|---|
| Medication catalog | Pull once on login, cache in Room / browser |
| Prescription orders | Local insert + sync_queue on Android; direct-write on web |
| Dispense records | Local insert + sync_queue on Android; direct-write on web |
| Awaiting-pharmacy queue | Pull-on-focus + realtime |

Android remains the full offline-first implementation. Web pharmacy is online-preferred, but writes through the same RPCs so semantics stay aligned.

### 6f. Payment interaction

Pharmacy and payment should compose, not fight:

- If the clinic charges for medicines, the **billing item is created from the prescription / dispense workflow**, not from a free-text manual payment note.
- If the clinic waives medicines, the dispenser can mark the relevant billing item waived.
- The dispenser should be able to see "billing still outstanding" without having to leave the pharmacy screen.

The detailed billing model lives in section 7 below.

### 6g. HMIS / audit

- Pharmacy dispensing itself is not the main HMIS output here; the important part is traceability of what medication was actually handed over.
- `prescription_orders` plus `dispense_records` give us the base for future essential-medicines reporting and stock analytics.
- Every dispense / partial / out-of-stock action should write `audit_logs` via triggers.

### 6h. Open questions

1. Is the dispenser also the cashier in practice at Susunga, or does the patient pay at a different desk?
2. Do some medicines get dispensed directly in clinic (e.g. ANC IPTp observed dose), bypassing the dispenser queue? If yes, allow the clinician to mark a prescription as `dispensed_in_clinic`.
3. Are substitutions common enough that we should require a structured substitute reason code, or is free text enough for v1?

---

## 7. Payments / billing orchestration

### 7a. Why the current payment model is not enough

Today the system records a single flat `payments` row per visit with a free-text `service_type`. That works for one review-approved OPD encounter, but it breaks down once we have:

- consultation fees from records or clinician intake
- multiple lab tests per visit
- medicines dispensed in pharmacy
- maternity / admission charges that accrue over time
- waived items mixed with paid items

We need a **charge-item ledger** underneath the existing `payments` table. The existing table can stay as the receipt header; the new tables tell us what the patient is actually paying for.

### 7b. Data model: charge catalog, billing items, payment allocations

```
CREATE TABLE charge_catalog (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  service_line TEXT NOT NULL
    CHECK (service_line IN ('registration','consultation','lab','pharmacy','maternity','admission','procedure','other')),
  description TEXT NOT NULL,
  default_price_ugx INTEGER NOT NULL CHECK (default_price_ugx >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (clinic_id, code)
);

CREATE TABLE billing_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visit_id UUID REFERENCES visits(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  charge_catalog_id UUID REFERENCES charge_catalog(id),
  source_table TEXT NOT NULL,     -- visit, lab_order, prescription_order, admission, manual
  source_id UUID,
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price_ugx INTEGER NOT NULL CHECK (unit_price_ugx >= 0),
  total_price_ugx INTEGER NOT NULL CHECK (total_price_ugx >= 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','waived','cancelled')),
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payment_allocations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  billing_item_id UUID NOT NULL REFERENCES billing_items(id) ON DELETE CASCADE,
  amount_ugx INTEGER NOT NULL CHECK (amount_ugx >= 0),
  UNIQUE (payment_id, billing_item_id)
);

ALTER TABLE visits ADD COLUMN billing_status TEXT NOT NULL DEFAULT 'open'
  CHECK (billing_status IN ('none','open','partially_paid','paid','waived'));
ALTER TABLE payments ADD COLUMN client_receipt_ref TEXT;
```

Design intent:

- `payments` remains the **receipt header / collection event**.
- `billing_items` are the **actual things being charged**.
- `payment_allocations` lets one receipt settle multiple items.
- `client_receipt_ref` is the offline-safe provisional identifier before the server assigns the final `receipt_number`.

### 7c. Billing creation rules

The system should auto-create billing items from operational events:

- **Records / registration:** optional OPD card or consultation charge.
- **Lab:** when a billable lab order is placed, create a pending lab billing item.
- **Pharmacy:** when medication is dispensed, create or finalize a pharmacy billing item based on actual quantity dispensed.
- **Maternity / admission:** add admission, bed, or procedure charges from the admission workflow.
- **Manual adjustments:** cashier / admin can add a one-off item when the clinic has an exceptional charge.

This is the right level of automation. Staff should not have to remember to create billing rows by hand for routine clinical events.

### 7d. Payment workflow

1. Visit / admission accumulates `billing_items`.
2. Cashier, records officer, or dispenser opens an **Outstanding Charges** workbench.
3. They select one or more pending items and collect payment.
4. System creates one `payments` row, one or more `payment_allocations`, and marks affected `billing_items` as `paid` or `waived`.
5. `visits.billing_status` updates to `paid`, `partially_paid`, or `waived`.
6. `visits.status='completed'` is reserved for "clinical workflow finished and billing resolved or explicitly waived."

This decouples the clinical path from the financial one without losing the current "completed means closed" semantics.

### 7e. Android and web surfaces

**Android**

- records officer can collect front-desk fees
- dispenser can settle pharmacy-linked items
- clinician can see billing status but should not be forced into the cashier role

**Web**

- larger-table cashier workbench
- day-end receipt reconciliation
- ability to search by receipt number, patient, or outstanding balance
- easier exception handling for waived / cancelled items

The key parity rule: both clients use the same `billing_items` and `payments` model. Web should not keep the current bespoke path where payment logic lives only inside the review queue.

### 7f. Offline policy

Android must support offline cash collection. That means:

- create local `payments` rows and queue them
- generate a provisional `client_receipt_ref`
- replace it with the authoritative `receipt_number` after sync

If the clinic wants a paper receipt while offline, the provisional reference can be written on it and reconciled later.

### 7g. Open questions

1. Does the clinic want one receipt covering all charges for a visit, or separate receipts per service line? The ledger supports either; we should choose one default.
2. Are lab charges paid before result entry, after result entry, or either depending on staff workflow?
3. Are maternity / admission charges usually waived under church support, or should we expect real billing there?

---

## 8. Maternity / maternal high-risk (MFM) service line

### 8a. Scope clarification

In this clinic context, "MFM" is not tertiary-hospital subspecialist fetal medicine. The practical need is a **maternal high-risk pathway**: ANC patients who become urgent, labor and delivery monitoring, prenatal/postnatal ward stays, and structured referral upward when the clinic cannot safely continue care.

This is where the `visit` mental model finally breaks. Maternity needs an admission/episode shape with many repeated notes, vitals, and handoffs.

### 8b. Target user and primary tasks

The **Midwife / maternity nurse** needs to:

1. admit a pregnant mother from ANC, reception, or direct walk-in
2. track her on a ward board for hours or days
3. record repeated vitals and bedside notes
4. record labor / delivery / postnatal events
5. refer to a higher-level facility when risk exceeds HC III capability
6. register the newborn outcome and start the next downstream workflow

### 8c. Data model: admissions, delivery events, referrals

The earlier `pregnancy_episodes` model remains the right maternal parent record. We now add the inpatient / ward layer:

```
CREATE TABLE admissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  pregnancy_episode_id UUID REFERENCES pregnancy_episodes(id) ON DELETE SET NULL,
  originating_visit_id UUID REFERENCES visits(id) ON DELETE SET NULL,
  ward TEXT NOT NULL
    CHECK (ward IN ('prenatal','maternity','postnatal','general_inpatient')),
  status TEXT NOT NULL
    CHECK (status IN ('admitted','active','transferred','discharged','referred','deceased')),
  bed_label TEXT,
  admitted_by UUID REFERENCES staff(id),
  admitted_at TIMESTAMPTZ DEFAULT NOW(),
  discharged_at TIMESTAMPTZ,
  discharge_summary TEXT,
  notes TEXT
);

ALTER TABLE visits ADD COLUMN admission_id UUID REFERENCES admissions(id) ON DELETE SET NULL;

CREATE TABLE delivery_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pregnancy_episode_id UUID NOT NULL REFERENCES pregnancy_episodes(id) ON DELETE CASCADE,
  admission_id UUID REFERENCES admissions(id) ON DELETE SET NULL,
  delivery_visit_id UUID REFERENCES visits(id) ON DELETE SET NULL,
  delivered_at TIMESTAMPTZ,
  delivery_mode TEXT
    CHECK (delivery_mode IN ('svd','assisted_vaginal','c_section_elsewhere','other')),
  maternal_outcome TEXT
    CHECK (maternal_outcome IN ('stable','referred','deceased','other')),
  estimated_blood_loss_ml INTEGER,
  notes TEXT
);

CREATE TABLE referrals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  visit_id UUID REFERENCES visits(id) ON DELETE SET NULL,
  admission_id UUID REFERENCES admissions(id) ON DELETE SET NULL,
  pregnancy_episode_id UUID REFERENCES pregnancy_episodes(id) ON DELETE SET NULL,
  from_department TEXT NOT NULL,
  to_facility TEXT NOT NULL,
  urgency TEXT NOT NULL CHECK (urgency IN ('routine','urgent','emergency')),
  reason TEXT NOT NULL,
  transport_mode TEXT,
  referred_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

Optional but likely needed soon after:

- `newborn_records` linked to `delivery_events`
- service-specific maternal observations (labor stage, fetal heart rate, cervical dilation) if the paper partograph needs structured capture

### 8d. Workflow

1. Patient arrives to ANC or maternity.
2. If admission is needed, create `admissions` row and place the patient on the ward board.
3. Repeated `patient_vitals` rows attach to `patient_id`, optionally to the active `visit_id`, and eventually to `admission_id` when we extend the vitals model.
4. Bedside notes continue as repeated encounters against the same pregnancy episode / admission.
5. Delivery is recorded as a `delivery_event`.
6. If risk escalates, create a structured `referrals` row and close or transfer the admission.

This is the first real bridge toward the future `care_episode + encounter` model. `visits` survives as the compatibility container for now, but the admission becomes the operational parent for longer maternal stays.

### 8e. Queue and board surfaces

**Android**

- bedside-friendly patient card
- latest vitals and overdue-vitals indicator
- quick action: add note, add vitals, refer, discharge

**Web**

- ward board with larger rows and better simultaneous visibility
- useful when a laptop is stationed at the maternity desk or nurse station

For maternity, web parity can start read-heavy: board + detail view + referral printout. Android still carries the bedside write path first.

### 8f. Billing and pharmacy interaction

- maternity admissions may create admission or procedure billing items
- postnatal medicines still flow through structured prescriptions / dispenser workflow
- referrals should freeze or waive incomplete billing items according to clinic policy

### 8g. Open questions

1. Do prenatal and postnatal wards need their own separate department enum values, or is `admission.ward` enough while `visits.department='maternity'` remains stable?
2. Does the clinic need newborn registration in the same sprint as delivery capture, or can that land one phase later?
3. Which maternal emergencies always require referral so we can pre-build quick templates (eclampsia, obstructed labor, PPH, severe anemia)?

---

## 9. Webapp parity / laptop mode

### 9a. Product principle

Very few staff will use computers for bedside clinical work, but some desks absolutely will. The right model is:

- **Android is the operational default**
- **web is the alternate surface for the same workflows, and the primary surface for stationary desks**
- **web remains strongest at print, tables, admin, and reconciliation**

What we should avoid is letting the webapp drift into a separate business process, as happened with review-and-payment.

### 9b. Minimum parity matrix

| Workflow | Android | Web |
|---|---|---|
| Records search / register / check-in | primary | parity needed |
| Clinician queue / note / orders | primary | parity needed |
| ANC / maternity bedside work | primary | read-heavy parity first |
| Lab pending / result entry | fallback / offline-capable | primary |
| Pharmacy dispense | fallback / offline-capable | primary |
| Cashier / payment reconciliation | useful | primary |
| AI review / HMIS reporting / admin | secondary | primary |

This matrix reflects how the clinic will actually operate: phones in pockets for roaming staff, laptops on desks for lab, pharmacy, and billing.

### 9c. Shared technical contract

To keep parity real:

1. **All mutations go through the same RPCs / tables.** Web server actions should be thin wrappers over the same Supabase RPC surface Android uses.
2. **Shared types live in `packages/shared`.** Status enums, departments, billing status, queue status, and DTOs should not fork.
3. **No web-only critical state transitions.** If the clinic needs it to move a patient through care, Android must also be able to do it.
4. **Web can be online-preferred.** Full offline-first remains an Android responsibility unless we explicitly invest in a web PWA queue.

### 9d. What changes immediately because of this rule

- The current payment form inside the web review queue becomes a compatibility stopgap, not the final home.
- Records, lab, pharmacy, and cashier all need explicit web surfaces as the corresponding Android roles ship.
- Lab, pharmacy, and cashier should be designed web-first from the start, with Android preserving operational continuity during outages or device shortages.
- New status semantics (`queue_status`, `billing_status`, `documentation_complete`) must be reflected in both clients in the same phase.

### 9e. Open questions

1. Which desks at Susunga are most likely to use a laptop first: reception, cashier, lab, or admin?
2. Is printing always web-based, or will some Android devices eventually print by Bluetooth? That affects where receipt / referral print actions should live.

---

## Cross-cutting risks

### Migration order

Do not use hard-coded migration numbers in planning from this point forward; the repo has moved beyond the original 024/025 assumptions. Ship these as named bundles, in order:

1. **records officer flow:** `national_id`, search indexes, `created_by` on visits, `check_in_patient_v2`, RLS adjustment
2. **pregnancy episode + ANC observations:** `pregnancy_episodes`, `anc_observations`, visit linkage
3. **lab orders + results:** `lab_test_codes`, `lab_orders`, result RPCs
4. **queue state machine + assignments:** expanded `queue_status`, `visit_assignments`, lab/pharmacy transitions
5. **prescriptions + dispense records:** `medication_catalog`, `prescription_orders`, `dispense_records`
6. **billing ledger:** `charge_catalog`, `billing_items`, `payment_allocations`, `billing_status`, offline receipt ref
7. **admissions + referrals + delivery events:** maternal / inpatient service-line foundation
8. **department hardening:** `department NOT NULL` and any enum cleanup after clients are updated
9. **legacy queue cleanup:** drop deprecated queue values after both Android and web are migrated

Each bundle is independently deployable. Android and web surfaces can ship incrementally on top of the same server bundle.

### Role/permission RLS

Migration 024 expands `staff.role` to 8 values. The existing RLS in `009_role_based_rls.sql` only knows `admin`, `doctor`, `nurse`. After 024 every helper that branches on role (`get_current_staff_role()`, `is_admin()`) keeps working but every policy that reads `get_current_staff_role() = 'doctor'` is wrong for COs. **Required follow-up in migration 024 itself or an immediate 024.1:** add a helper `is_clinician()` that returns true for `doctor`, `clinical_officer`, `midwife`, and use that instead of `role = 'doctor'` checks. Otherwise the entire CO-beta provider_notes flow breaks the moment we re-seat people as `clinical_officer`.

### Android / web contract drift

The biggest product risk after schema drift is **client drift**:

- Android adds `billing_status`, web forgets to render it
- web creates payments directly, Android uses a different allocation flow
- Android supports manual prescriptions, web still assumes AI-generated medication text

Mitigation:

- every new server bundle ships with `packages/shared` updates first
- every state enum change gets both Android and web acceptance criteria in the same PR plan
- prefer RPCs over duplicated client-side business logic

### Manual-first downstream artifacts

Lab orders, prescriptions, billing items, and referrals are operational artifacts. They must all have a non-AI authoring path. If any of them only appear when Inngest or an edge function succeeds, the clinic will fall back to paper and the product will silently lose the workflow.

### Offline conflict resolution across roles

The existing sync engine handles offline patient/visit creation well. New conflict surfaces:

- Two records officers on two phones register the same returning patient (offline-then-sync). Existing 409 handler in `syncCreatePatient` deduplicates by phone — this works only when phone is set. If both phones see no phone, two patient rows are created. Mitigation: server-side `find_or_create_patient(first_name, last_name, dob, phone, national_id)` RPC that does a lookup on (national_id) OR (phone) OR (first_name + last_name + dob within 90d) and returns the existing UUID if found. Adopt for records flow.
- Two midwives both start an ANC visit for the same patient on the same day. Partial unique index on open ANC per day (in 5f) catches this. Sync engine must catch the constraint violation and merge the local visit into the existing one.
- Lab tech enters a result while offline; CO meanwhile cancels the visit. On sync the result write succeeds against a cancelled visit. Allow it — historical data is fine to record even if the visit was cancelled. The visit cancellation just means the patient walked.

### Payload budget

Aggregate per-device daily payloads at HC III (40 visits/day):

| Role | Daily KB (steady state) | Daily KB (initial sync day 1) |
|---|---|---|
| Records officer | ~2 MB | ~3 MB (incl. roster) |
| CO (already in beta) | ~1.5 MB | ~3 MB |
| Midwife | ~150 KB | ~2 MB |
| Lab tech | ~100 KB | ~1.5 MB |
| Dispenser | ~150 KB | ~1.5 MB |

Total clinic data remains comfortably low after warm cache, roughly ~5-6 MB/day across the main Android devices before audio / app-update overhead. UGX ~250 of mobile data on MTN per device per day is still a reasonable planning number. Diocese should budget MTN data bundles at ~10 GB/month per device. That's well within reach.

Realtime: WebSocket idle keep-alive ~1 KB/min. Over a 9-hour clinic day, ~500 KB just for keep-alives. Same budget.

---

## Suggested phased build order after the offline-first foundation

This sequence assumes the current `offline-first-refactor.md` lands first: clinician note save, vitals, patient note fallback, and payment reachability without AI.

### Phase 2 — Records + manual lab ordering + web parity at the desks

- Ship the records-officer flow, patient search improvements, and department-aware check-in.
- Ship **manual-first lab orders** plus lab result entry.
- Add the first web parity surfaces for reception and lab, because those are the most likely laptop desks.
- Keep the current queue state mostly intact while introducing structured lab artifacts.

### Phase 3 — ANC + queue-state expansion

- Ship `pregnancy_episodes`, `anc_observations`, and the midwife ANC home.
- Introduce the expanded queue state machine (`awaiting_lab`, `with_lab`, `awaiting_clinician`, `awaiting_pharmacy`) and `visit_assignments`.
- Update both Android and web to understand the new queue semantics in the same release window.

### Phase 4 — Pharmacy / structured prescriptions

- Ship the structured prescription composer for clinicians and midwives.
- Ship the dispenser workflow on both clients, but treat **web pharmacy** as the primary desk surface and Android as the offline fallback.
- Do not wait for inventory; dispense confirmation is the first milestone.

### Phase 5 — Billing ledger + cashier workbench

- Introduce `charge_catalog`, `billing_items`, `payment_allocations`, and `billing_status`.
- Rework Android payment from a single amount box into an outstanding-charges settlement flow.
- Move web payment out of the review queue into a dedicated cashier / billing surface and treat that as the primary billing desk.
- Preserve the existing `payments` table as the receipt header so existing receipt-number logic survives.

### Phase 6 — Maternity admissions / maternal high-risk / referrals

- Add `admissions`, `delivery_events`, and `referrals`.
- Ship Android ward-board and bedside write path for maternity.
- Ship web ward board / desk view for read-heavy maternity oversight.
- Connect admission/procedure charges into the billing ledger.

### Phase 7 — Hardening, reporting, and parity gap fill

- Reconcile any remaining web-only or Android-only operational gaps.
- Add reporting surfaces for lab volume, pharmacy throughput, outstanding billing, and maternity census.
- Clean up deprecated queue states and any temporary compatibility shims.
- Run full-clinic simulation: reception -> clinician -> lab -> clinician -> pharmacy -> payment -> discharge / referral.

### Phase 8 — Diocese rollout hardening

- lock the schema for the HC III workflow set
- finalize RLS for expanded roles and new service lines
- produce onboarding playbooks for records, midwives, lab techs, dispensers, and cashiers
- decide which clinics get laptop desks and which are phone-only

The sequencing principle is simple: **build the operational branches before polishing more AI**. Reception, lab, pharmacy, maternity, and payment are the clinic. AI is still augmentation layered on top.
