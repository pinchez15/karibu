# 2026-07-07 Maturity release — post-MVP feature program

> **Source:** Full-day product/codebase review session (2026-07-07) with deep exploration
> of pharmacy flow, roles/permissions, loop-gap audit, Android sync, registration/queue
> flow, stock model, AI review parity, and web performance. Findings below are verified
> against code with file/line evidence inside each workplan.
> **Companion decision doc:** `docs/platform-contract.md` (Android vs web platform
> contract — READ IT before implementing anything here).

## Context

One pilot clinic, ~40 patients/day, growing to 20 diocese clinics within 6 months, then
~2,000 Ugandan HC IIIs at ~60 patients/day. Happy paths work on both platforms. The
release theme: **close the loops, mature the primitives, keep the six-second chart.**

Diagnosis from the audit: every asynchronous handoff has a forward path but no return
path (pharmacy send-back, lab results, follow-ups, referrals). The fix is NOT a
notifications inbox — at HC III scale the "notification" is the worklist someone already
stares at plus the patient physically present. Loops close through worklists, visit
state, and the existing (unused) `care_tasks` infrastructure.

## Workplans

| WP | Title | Priority | Depends on |
|----|-------|----------|------------|
| [WP1](WP1-close-the-loops.md) | Close the loops (pharmacy send-back, lab results, care tasks) | **P0** | — |
| [WP2](WP2-day-line-and-checkin.md) | Day line & check-in (register-without-visit, today's number, queue UX) | **P0** | — |
| [WP3](WP3-pharmacy-stock-maturation.md) | Pharmacy stock maturation (batches, packs, stock-take, requisitions) | P1 | — |
| [WP4](WP4-access-model.md) | Access model (audit log, restricted records, program sensitivity, capabilities) | P1 | — |
| [WP5](WP5-ai-review-parity-and-hardening.md) | AI review web parity + hardening | P1 | — |
| [WP6](WP6-web-performance.md) | Web performance to sub-2s | P1 (instrumentation first) | — |
| [WP7](WP7-outreach-mode.md) | Outreach mode (field enrollment) | P2 | WP2, WP4 |

**Recommended sequencing:** WP6 step 0 (instrumentation) immediately; then WP1 and WP2 in
parallel (different surfaces, both P0); WP5 and WP6 next (small, high-visibility); WP3
and WP4 as the larger structural tracks; WP7 last.

## Cross-cutting instructions for implementation agents

1. **Read first:** `CLAUDE.md`, `docs/ehr-pivot-implementation.md` (all), and
   `docs/ai-clinical-assist.md` (before WP5). `docs/platform-contract.md` before all.
2. **Migrations are serialized.** Latest on main is `092`. Next is `093`. Only ONE
   workplan may hold a migration number at a time — coordinate via PR order, renumber on
   rebase. ⚠️ An unmerged branch `fix/web-calendar-timezone` contains a
   `093_pharmacy_dispense_clinical_officer.sql` (hardcodes `clinical_officer` into the
   dispense allowlist). **Do NOT merge that branch's migration** — it is superseded by
   WP4's capability config. Salvage its web nav/page-guard changes only if useful.
3. **Locked architecture rules** (from ehr-pivot doc, still binding):
   - All writes via SECURITY DEFINER RPCs; every RPC starts with
     `assert_staff_in_clinic(...)`; accept `p_client_op_id` for idempotency.
   - Never reintroduce `documentation_complete` as a pharmacy gate.
   - No second Android app. No direct PostgREST writes from Android.
   - Android: Room write first, outbox one-row-per-intent, sync in background.
4. **Platform tiers:** every new clinical action ships on both platforms or documents
   why not (platform contract rule 2 & 7).
5. **After each WP ships:** update the relevant docs (`ehr-pivot-implementation.md`
   checkboxes, this README's status column) and run the manual QA scripts in
   `docs/ehr-pivot-qa.md` where they apply.
6. **Deferred but scheduled (not in this release, do not build ahead):** multi-clinic
   auth refactor and diocese tier per `TODOS.md`. ⚠️ Escalation from this session: the
   multi-clinic auth refactor becomes MANDATORY before diocese clinic #2 onboards — the
   `staff.clerk_user_id UNIQUE` constraint 500s the membership webhook on the first
   staff member shared between two clinics. With 20 diocese clinics in 6 months, shared
   staff are a certainty. Schedule it deliberately; do not let the field trigger it.
7. **Explicitly out of scope for this release:** notifications inbox / push (FCM),
   web offline/PWA, thermal-printer AI calibration loop (parked), Karibu Learn (separate
   product), model-provider migration (OpenAI is the platform — see contract §6).
