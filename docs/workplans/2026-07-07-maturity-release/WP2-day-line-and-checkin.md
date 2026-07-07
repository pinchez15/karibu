# WP2 — Day line & check-in (register-without-visit, today's number, queue UX)

**Priority:** P0 · **Platforms:** web + Android (registration/check-in are tier A-OFF)
**Theme:** Almost all patients are walk-ins who "work the line" that day; nearly none
have timed appointments. The chart-first pivot stays — but the day line must become an
honest operational view with a real ordering, and registration must decouple from
check-in.

---

## Problem (verified)

1. **Patient-without-visit is schema-supported and UI-impossible.** Every registration
   path force-creates a visit: web `createPatientWithVisit`
   (`apps/web/src/app/dashboard/visits/actions.ts` ~L179–356) always calls
   `check_in_patient`; Android `NewVisitViewModel.createPatientAndStartVisit`
   (~L413–442) and `CheckInViewModel.checkIn` (~L81–97) always create a visit. The
   catchment-registration case (e.g. mother of a sick child) has no path.
2. **Two queue spines, one broken.** `check_in_patient` (024 ~L188–217) assigns
   `queue_position` + `checked_in_at`; `rpc_create_visit` (062 ~L487–493) sets NEITHER —
   so Android "Start Visit"-originated visits have no arrival order or wait time.
3. **"Who's next" data doesn't exist on the patient-first list.**
   `rpc_get_opd_patients_today` (062 ~L698–740) has NO final ORDER BY and does not
   return `checked_in_at`; Android sorts bucket-then-checkedInAt but RPC rows carry
   null `checkedInAt` (`OpdPatientRow.from(dto)` ~L46) → ordering degrades to
   bucket-only.
4. **Scroll pain.** No search input on `PharmacyStationClient.tsx` or
   `LabQueueClient.tsx`; web queues render up to 100 rows flat; `get_clinic_queue`
   keeps completed patients in the list all day (022 ~L100–102 excludes only
   `cancelled`).

## Deliverables

### A. Decouple registration from check-in

1. Web registration form: two actions — **"Register + check in"** (default, current
   behavior) and **"Register only"** (creates patient, no visit). Refactor
   `createPatientWithVisit` accordingly.
2. Existing-patient search results (web `/dashboard/visits`, Android patient search):
   one-tap **"Check in for today"**.
3. Android `NewVisitScreen`: same two-action split; register-only works offline
   (patient row + outbox, no visit).

### B. One check-in spine, every visit numbered

4. **Migration:** make `rpc_create_visit` set `checked_in_at = NOW()` and assign
   `queue_position` the same way `check_in_patient` does (or refactor both to share one
   internal function). Every visit today has an arrival number and timestamp. Decide and
   document: `queue_position` is renamed conceptually to **"today's number"** — per
   clinic, per day, monotonically increasing, assigned at check-in.
5. **Migration:** `rpc_get_opd_patients_today` gains `ORDER BY priority
   (urgent→normal), checked_in_at ASC` and returns `checked_in_at` + `queue_position`
   in its row type. Update `@karibu/shared` types + Android DTO/`OpdPatientRow` so
   client-side ordering and wait display work from RPC data.

### C. Surface the number and the order

6. Today's number rendered prominently on: OPD cards (web + Android), pharmacy queue
   cards, lab queue cards, and the printed patient slip/receipt (web print surfaces).
   Staff and patients both reason in numbers ("you are #23"), matching paper OPD
   register practice.
7. "Up next" = top of the waiting bucket after priority+arrival sort. Urgent triage
   flag visibly jumps the line (amber, already partially styled on web).
8. Wait time ("34m") shown from `checked_in_at` on all queue cards.

### D. Kill the scroll

9. **Type-ahead filter box** (name or today's number) on: `PharmacyStationClient`,
   `LabQueueClient`, web OPD list, Android `PharmacyHomeScreen` + `LabHomeScreen` +
   OPD pane. Client-side filtering — rows are already in memory (≤100).
10. **Purge done items from active views:** `get_clinic_queue` (or its web consumer)
    excludes `completed` from the default view (keep a "Done today N" collapsed
    section/tab, mirroring the pharmacy pattern). Android legacy `QueueScreen` same.
11. **Default each role's view to its actionable bucket** with counts for the rest
    ("Waiting 12 · In progress 3 · Done 25"), collapsed not concatenated.

## Locked decisions

- Do NOT resurrect queue-as-lifecycle. Worklists/OPD remain derived views; the chart
  remains clinical truth (ehr-pivot §3.1). This WP only fixes ordering + entry points.
- Appointments remain out of scope here (very few timed appointments in practice).
  Follow-up scheduling loop is a separate future piece.

## Acceptance

- Register a patient with no visit (web + Android offline); they appear in patient
  search but on no queue.
- Check in an existing patient in ≤2 taps from search; they receive today's number N+1.
- Every visit created today — regardless of entry path — has a number, a wait time, and
  sorts identically on web and Android: urgent first, then arrival order.
- A dispenser can find patient #23 in a 50-row day by typing "23" or a name fragment in
  under 2 seconds. Completed patients are not in the default scroll anywhere.
