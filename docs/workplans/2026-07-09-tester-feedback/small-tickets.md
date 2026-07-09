# Tester feedback 2026-07-09 — small tickets

Source: lead tester's email of 2026-07-09, triaged against code the same day. These are the items that are **real and small**. Not included here: the sync items (covered by `docs/workplans/2026-07-09-sync-drain/`), the printer issue (environment — run `docs/workplans/2026-07-06-beta-gaps/printer-remote-diagnostic.md`), and the inpatient asks (see `inpatient-buildout.md` in this directory).

Each ticket is self-contained and agent-runnable. Android tests: `:app:testDebugUnitTest` (Android Studio JBR as JAVA_HOME). SQL tests: house style in `packages/supabase/tests/` (`BEGIN; … ROLLBACK;`, DO-block assertions).

---

## T1 — Queue status auto-completes when the clinical work is done

**Priority:** P1 · **Surface:** Supabase migration + tests
**Tester report:** "The patient queue still shows a patient as Waiting even after I complete the consultation, sign the note, and both the laboratory and pharmacy have completed their work."

**Today:** Queue completion is a **manual, online-only** action — `checkOutVisit` (`apps/android/.../VisitRepository.kt:1160`, `rpc_check_out_visit`, migration 068). Nothing flips `queue_status` when note + lab + pharmacy all finish. Staff don't know/use the manual checkout, so the day line reads "12 waiting" at 18:29.

**Design decision (locked here):** auto-complete **server-side** so every surface (Android home day line, web OPD) agrees, and keep the manual checkout as an early-exit escape hatch. The pivot doc (§6.5) deprecates queue-as-spine — this ticket makes the queue honest until that deprecation completes; do not build any new queue UX.

**Change:** new migration (next free number). A single function `maybe_complete_visit_queue(p_visit_id uuid)`:

- Completes the queue (`queue_status = 'completed'`, reuse the exact state semantics of `rpc_check_out_visit` from migration 068) when ALL hold:
  - `documentation_complete = true`
  - `lab_status` is NULL or terminal (`completed` — check the enum in migration 075; visits with no tests ordered count as done)
  - `dispensing_status` is NULL or terminal (`dispensed` / line-level equivalent per migration 098; no pharmacy order counts as done)
- Call it at the end of the write paths that can be "the last one done": `rpc_mark_documentation_complete`, `rpc_record_lab_test_result` / `rpc_record_lab_result`, `rpc_complete_pharmacy_dispense`, `rpc_set_dispensing_status`, `rpc_finalize_clinical_encounter`. (Explicit calls, not a table trigger — matches the codebase's RPC-centric style and keeps SECURITY DEFINER surface auditable.)
- Payment stays decoupled (locked decision) — payment is NOT a condition.

**Tests** (`packages/supabase/tests/queue_autocomplete.sql`): (1) doc-complete + no lab + no pharmacy → completed; (2) doc-complete + lab pending → still waiting, then last result lands → completed; (3) pharmacy last → completed; (4) manual `rpc_check_out_visit` still works and is idempotent against an auto-completed visit; (5) already-completed visit is not re-touched (updated_at unchanged).

**Acceptance:** re-run the tester's scenario (consult → sign → lab done → pharmacy done) and the day line shows the patient out of Waiting on both web and Android (after pull) with no manual step.

---

## T2 — Lab test checklist inside the consultation editor

**Priority:** P1 · **Surface:** apps/web
**Tester report:** "The checklist of available tests only appears after requesting one test, saving as a draft, and then reopening the draft."

**Today:** the catalog checklist exists — `VisitLabPanel` (`apps/web/src/components/lab/VisitLabPanel.tsx`, deterministic catalog picks per F2, role-gated at `:25-26`) — but it renders only on the **visit chart** (`VisitDetailClient.tsx:368`). The consultation editor (`PendingDictationCard.tsx`) has no catalog picker, so the checklist "appears" only after he saves and reopens onto the chart.

**Change:** render `VisitLabPanel` (same component, same role gate, same submit action) inside `PendingDictationCard` in the orders area, alongside the existing prescription composer. No new catalog code — reuse. Collapse it behind an "Order lab tests" disclosure if vertical space is a concern.

**Tests:** component test (or E2E under `apps/web/src/app/e2e` conventions) asserting the catalog list renders in the editor for a clinical role before any test has been ordered, and that a submitted order writes catalog names into `visits.tests_ordered` (existing behavior, regression-guard it).

**Acceptance:** from a fresh consultation (no draft saved), the clinician can pick tests from the checklist without leaving the editor.

---

## T3 — "Waiting to sync" instead of "AI checking…" when the op hasn't left the device

**Priority:** P1 · **Surface:** apps/android
**Tester report:** "After signing a note, it sometimes remains on 'AI Checking' instead of completing."

**Today:** `VisitDetailsScreen.kt:1055-1061` shows the disabled "AI checking…" action whenever `status == pending && documentationComplete`. The label is honest only if the doc-complete/sign RPCs actually reached the server — if they're sitting in the outbox, the AI never started and the label lies indefinitely.

**Change:** `SyncQueueDao.getPendingCountForVisit(visitId)` already exists (`SyncQueueDao.kt:126-137`). Expose it in `VisitDetailsViewModel`; in `VisitDetailsBottomAction`, when the pending-for-visit count > 0 and the visit is in the `pending + docComplete` state, render the label as **"Waiting to sync…"** (same disabled state). When the count is 0, keep "AI checking…". One string, one flow, one conditional.

**Tests:** ViewModel unit test — pending-count flow > 0 → UI state exposes waiting-to-sync; = 0 → ai-checking. (Match the MockK fixture style in `ui/` tests if present, else test the ViewModel state mapping directly.)

**Acceptance:** airplane-mode sign → label reads "Waiting to sync…"; reconnect and drain → label transitions to "AI checking…" and then to Review when the server advances the visit.

---

## T4 — Invitation password errors: say why, up front

**Priority:** P2 · **Surface:** apps/web
**Tester report:** "The account creation process wasn't accepting the passwords during setup" (new staff member, pharmacy nurse).

**Today:** `accept-invitation/AcceptInvitationClient.tsx` surfaces Clerk's raw error (`:13-14`) and enforces only a local min-length (`:96`). Clerk also rejects passwords found in breach corpora — its message ("Password has been found in an online data breach…") reads like the form "not accepting passwords," especially for simple passwords like name+year.

**Change:**
1. Show the password rules **before** first failure: helper text under the field — minimum length and "avoid common or previously leaked passwords; a short phrase works well."
2. Map the two known Clerk error codes to plain language: `form_password_pwned` → "This password appears in a public data breach — pick a different one (a short phrase works well)."; `form_password_length_too_short` → the min-length line. Fall through to the raw message otherwise (keep `:13-14` as the fallback).
3. Log the Clerk error code (not the password) to console/PostHog so the next "wasn't accepting" report is diagnosable remotely.

**Tests:** unit test the error-code → message mapping; keep the fallback path covered.

**Acceptance:** entering `password123` on the invitation form yields a self-explanatory message and the field hints exist before any attempt. Then re-run the real onboarding for the blocked staff member.

---

## T5 — Web draft consultation loses entered data on reopen (investigate → fix)

**Priority:** P1 (investigate first) · **Surface:** apps/web
**Tester report:** "When saving a consultation as a draft, the patient history, vitals and entered information disappear when reopening the draft."

**Known so far:** draft rehydration IS wired — `PendingDictationCard` accepts `initialSections`/`initialNoteId` (`PendingDictationCard.tsx:45-98`) and `VisitDetailClient.tsx:317/:550` passes them; autosave persists via `rpc_upsert_provider_note` with `p_status:'draft'` (`note-actions.ts:105-133`). So this is not "unimplemented" — it's a conditional failure. Candidate causes to check, in order:

1. The server component fetching `initialNoteSections` — does it fetch the draft note for the reopened visit in all entry paths (OPD list vs chart vs worklist), or only some?
2. `noteIdRef` fallback to `crypto.randomUUID()` (`:95`) when `initialNoteId` is null — a reopen that fails to pass the note id would fork a NEW empty note while the draft still exists (matches "everything disappears").
3. Vitals/history panels — do they render from visit data independently of the note (if so, "vitals disappear" implicates the fetch/entry path, not the note component)?

**Required first:** get exact repro steps from the tester (entry screen, before/after sign, same browser?). Then reproduce with the e2e fixtures (`apps/web/src/app/e2e/`), fix at the identified layer, and add a regression test: save draft with sections + vitals visible → navigate away → reopen from the OPD list → all sections present, same `noteId` reused (no orphan draft rows).

**Acceptance:** repro documented, fix landed with the regression test, and `provider_notes` shows a single draft row per visit through the save/reopen cycle.

---

## T6 — Billing mismatch: verify the shipped fix against his cases

**Priority:** P2 (verification, not build) · **Surface:** apps/web + Supabase
**Tester report:** "The billing calculations still don't appear to match consistently."

**Context:** the billing-integrity work merged very recently — PR #26 (`fix/billing-balance-integrity`), single `computeBalance` util for all surfaces (`88a85d5`), per-line charge identity + sticky manual edits + dispense guard (`6b27616`, migration 092) — likely **after** the observations in his email.

**Task:** (1) confirm the Vercel deployment includes `805edd9`+; (2) get one concrete example from the tester (patient, expected vs displayed amounts); (3) trace it through `computeBalance` and the `billing_lines` rows; (4) if it reproduces, fix with a regression test in the computeBalance suite; if it doesn't, close with the example documented as verified-fixed.

**Acceptance:** either a verified "fixed by WP3, re-tested on visit X" note back to the tester, or a failing-then-passing regression test.

---

## Explicitly not tickets

- **Sync items** (clinical details not syncing, lab/pharmacy not receiving orders, pending count) → `2026-07-09-sync-drain/` (WP-A/WP-B gate the next APK).
- **Print destinations reduced to "Save as PDF"** → Windows lost the thermal printer; run the existing remote diagnostic runbook with the clinic. Not an app change.
- **Age entry + Village fields** → already shipped (in every build ≥ 1.0.27); resolved by updating the tester's phone.
- **Mobile-friendly web** → defer to the EHR UI rework plan (`docs/ehr-ui-rework-plan.md`); revisit after the pilot month.
