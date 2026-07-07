# WP1 — Close the loops (pharmacy send-back, lab results, care tasks)

**Priority:** P0 · **Platforms:** web + Android (tier A-OFF for clinical actions)
**Theme:** Every async handoff gets a return path. No notifications inbox — loops close
through worklists, visit state, and `care_tasks`.

---

## Part A — Pharmacy send-back round trip

### Problem (verified)

`rpc_send_pharmacy_line_back_to_clinician` (migration 089) sets the line to
`needs_clarification` and writes the reason to `visits.dispense_notes` — then the loop
dead-ends. Three compounding defects:

1. **No clinician surface.** Only the dispenser's worksheet renders
   `needs_clarification` ("Sent to clinician", `PrescriptionWorksheet.tsx` ~L94, L438).
   The clinician's visit page still shows "Sent to pharmacy" because send-back never
   clears/annotates `pharmacy_order_submitted_at`. `dispense_notes` shows only as passive
   text on visit detail (`VisitDetailClient.tsx` ~L287–290; Android
   `VisitDetailsScreen.kt` ~L733–738).
2. **Clinician cannot act.** `rpc_submit_pharmacy_order` (091) fully supports resubmit —
   it deletes `ordered`/`needs_clarification`/`dispensing` lines (091 ~L116–118) — but
   all three clinician composers hide themselves permanently once
   `pharmacy_order_submitted_at` is set: `VisitPharmacyPanel.tsx` ~L32–41,
   `PendingDictationCard.tsx` ~L369–375, Android `VisitDetailsScreen.kt`
   `VisitPharmacySubmitSection` ~L1299.
3. **Wrong queue.** When ALL lines are sent back, `aggregate_visit_dispensing_status`
   returns `'not_started'` (089 L38–40), so the visit REMAINS in the pharmacy queue
   (worklist predicate 045 ~L497–502 includes `not_started`) — parked with the actor who
   already acted.

Also: visit-level send-back (064 ~L608–618) forces `dispensing_status='not_started'`,
inconsistent with the per-line aggregate; Android has whole-visit send-back only
(`PrescriptionWorksheetSheet.kt` ~L171–197) — no per-line RPC in its API layer.

### Deliverables

1. **Migration:** introduce derived/explicit `pharmacy_returned` visit state.
   Recommended: add `'returned'` to the `dispensing_status` values;
   `aggregate_visit_dispensing_status` returns `'returned'` when ≥1 non-cancelled line is
   `needs_clarification` and no line is `dispensing` (decide precedence: any
   needs_clarification + nothing in-flight ⇒ returned). Update BOTH send-back RPCs (per
   line 089, whole visit 064) to use the aggregate consistently.
2. **Pharmacy queue excludes returned visits.** Update `rpc_worklist_needs_pharmacy`
   (045) and web `pharmacyTabFilter` (`pharmacy-data.ts` ~L52–60) so `returned` is not in
   the to-dispense statuses. Add a small "Returned to clinician" count/tab on the
   pharmacy station so dispensers can see what they bounced.
3. **Clinician surfaces:**
   - Amber banner on visit detail (web + Android) when returned: dispenser's reason +
     per-line statuses. Web: `VisitDetailClient.tsx`; Android: `VisitDetailsScreen.kt`.
   - OPD filter + worklist card `pharmacy_returned` (extend `rpc_get_opd_patients_today`
     filter keys in 048/062 lineage + `apps/web/src/app/dashboard/worklists/`).
   - `PendingDictationCard` gets a returned-script banner analogous to its existing
     lab-results banner (~L396–411).
4. **Resubmit UI:** when returned, re-enable the prescription composer prefilled with
   current lines (including the `needs_clarification` ones for editing) on
   `VisitPharmacyPanel`, `PendingDictationCard`, and Android
   `VisitPharmacySubmitSection`. Submission goes through existing
   `rpc_submit_pharmacy_order` — no RPC change needed for resubmit itself.
5. **Android per-line send-back parity:** add
   `rpc_send_pharmacy_line_back_to_clinician` to `SupabaseApi`/`VisitRepository`/
   `SyncEngine` + per-line UI in `PrescriptionWorksheetSheet.kt` (platform contract
   rule 2).

### Acceptance

- Dispenser sends one line back → visit leaves to-dispense queue → clinician sees banner
  + worklist entry → edits → resubmits → visit reappears in pharmacy queue with fresh
  lines → dispenser completes. Works offline on Android (queue + sync).
- Whole-order and per-line send-back produce the same aggregate semantics.
- "Sent to pharmacy" label never shows on a returned visit.

## Part B — Lab results-ready loop

### Problem (verified)

When a result lands (`rpc_record_lab_test_result`, 075 ~L186–258), the patient FALLS OFF
the `awaiting_labs` OPD filter (`lab_status IN ('pending','running')` only — 048 ~L682)
and appears nowhere else. No clinician-side "results ready" surface. Web lab actions do
NOT call `broadcastClinicRefresh` (`lab/actions.ts` ~L87–91) unlike pharmacy actions.
`lab_abnormal` is display-only; `visit_critical_alerts` covers vitals rules only.

### Deliverables

1. **`results_ready` OPD filter + worklist card:** predicate ≈ `lab_status IN
   ('done','abnormal') AND documentation_complete = FALSE` (i.e. results in, encounter
   still clinically open). Add to `rpc_get_opd_patients_today` filter keys and a
   clinician worklist RPC/card. Surface on Android OPD buckets too
   (`OpdPatientFilter`).
2. **Broadcast on lab writes:** add `broadcastClinicRefresh` to web lab actions
   (mirroring `revalidatePharmacyPaths` pattern in `pharmacy/actions.ts` ~L293–301) and
   ensure Android lab result sync path triggers the same channel server-side (it goes
   through shared RPCs — the web broadcast helper is server-action-side, so consider
   moving the broadcast into a shared post-write hook or accept the 60s poll for
   Android-origin writes; document the choice).
3. **Abnormal result → care task:** on `rpc_record_lab_test_result` with
   `p_abnormal = true`, auto-create a `care_tasks` row (`task_type='lab_followup'`,
   assignee = ordering clinician's role or specific staff, title includes test name).
   Respect idempotency (`p_client_op_id`).

### Acceptance

- Lab tech records a result on Android → within one refresh cycle the clinician's web
  worklist/OPD shows the patient under "Results ready"; abnormal results additionally
  appear as an open care task. Patient never silently disappears from all filters while
  the note is unsigned.

## Part C — Care tasks UI (the loop-closing primitive)

### Problem (verified)

`care_tasks` + `rpc_create_care_task` + `rpc_complete_care_task` +
`rpc_worklist_care_tasks` (041) are fully implemented in SQL with **zero UI callers**
(only protocol activation auto-creates tasks, 048 ~L457–470). Worklists render tasks
read-only; timeline renders them read-only.

### Deliverables

1. "Add task" from patient chart and visit detail (web + Android): title, type (enum in
   041 ~L26–39), assignee role, due date.
2. "Mark done" on worklist cards and timeline entries (calls `rpc_complete_care_task`).
3. Care task counts included in role home badges.
4. Android: outbox operations for create/complete (A-OFF).

### Acceptance

- A clinician can create a follow-up task offline on Android, it syncs, appears on the
  web worklist, and can be completed from either platform.

## Out of scope for WP1

- Referral return loop and appointment day-of flow (deferred; noted in session as P2 —
  fold into a future WP alongside WP7 if capacity allows).
- Notifications table / push. Do not build.
