# EHR pivot — manual QA scripts

Run after applying migration `045_ehr_pivot.sql` and deploying Android + web.

## Prerequisites

- Staff accounts: records/nurse, clinician, lab_tech, dispenser (optional cashier)
- Device with airplane mode for offline sections
- **Do not wipe the database** — existing test patients should remain

## 1. Pharmacy before note close

1. Clinician opens visit dictation, enters medications, taps **Send to pharmacy**
2. Confirm note stays draft / visit not forced to completed
3. Dispenser opens **Pharmacy queue** (web or Android) — order appears without `documentation_complete`
4. Dispense (or mark in progress)
5. Clinician later signs note — pharmacy already handled

## 2. Multi-role offline same patient

1. Airplane mode on
2. Records: register patient + create visit
3. Nurse: record vitals on same patient
4. Clinician: draft note (no vitals visible yet — expected)
5. Airplane mode off — sync completes
6. Patient timeline shows registration, vitals, and note events

## 3. Lab tech (Android)

1. Log in as `lab_tech` — lands on **Lab queue**
2. Start run on pending test
3. Record result (mark abnormal optional)
4. Clinician chart shows lab status after refresh

## 4. Dispenser (Android)

1. Log in as `dispenser` — lands on **Pharmacy queue**
2. Start → dispense (partial/dispensed)
3. Confirm visit `dispensing_status` updates on web after sync

## 5. Payment decoupled

1. Complete clinical documentation / sign note
2. Confirm app does **not** auto-navigate to payment
3. Record payment from billing/worklist when ready
4. Confirm payment does not block note or pharmacy queue

## 6. Sync health

1. Record payment offline — single outbox row, no `complete_visit_queue` chain
2. Autosave note — one `upsert_provider_note` row (watch pending sync count)
3. Force 401 (expired token) — sync retries after refresh

## Pass criteria

- No direct `POST /payments` from Android
- Pharmacy queue uses `pharmacy_order_submitted_at`, not `documentation_complete`
- Visits in `pending` with AI complete move to `review` (web Inngest)
