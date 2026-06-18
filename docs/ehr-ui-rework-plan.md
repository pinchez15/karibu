# KaribuEHR UI Rework — Implementation Plan

> **Status:** Build-ready plan, awaiting final go-ahead per workstream.
> **Author:** Captured from 16 annotated mockups (2026-06-18) + codebase grounding.
> **Scope:** KaribuEHR **web app** (`apps/web`) primarily; one workstream (F2) also touches `apps/android`.
> **Not in scope:** Karibu Learn (separate app). All "Karibu" branding → **KaribuEHR**.
>
> **Authoritative companions (read before touching F1/F2/AI):**
> `docs/ehr-pivot-implementation.md`, `docs/patient-centered-architecture-plan.md`, `docs/ai-clinical-assist.md`.
> Where this plan conflicts with those, **those win** unless the product owner (Nate) overrides — several
> overrides are recorded in §2.

---

## 1. Decisions locked in this round (2026-06-18)

| # | Decision | Choice |
|---|----------|--------|
| 1 | How to proceed | Ground against docs/code, then this doc. Build per-workstream after sign-off. |
| 2 | Build sequencing | **Foundation-first** (F1–F5 before per-screen work). Fits pre-launch big-bang. |
| 3 | "Yesterday / rounds review" location | **Today page** (Worklists stays purely actionable "Pending X"). |
| 4 | Deterministic list-pick orders (F2) | **Include Android now**, not web-only fast-follow. |

---

## 2. What already exists (do NOT rebuild) + doc conflicts to resolve

Grounding showed most "foundation" is already shipped by the EHR pivot. This shrinks the work to **UI alignment, finishing partial work, and targeted bug fixes**.

**Already built:**

- **Pharmacy-on-submit:** `visits.pharmacy_order_submitted_at` / `_by`; `rpc_submit_pharmacy_order` (migration 064). Pharmacy queue no longer gates on `documentation_complete`.
- **Structured per-line prescriptions:** `prescription_orders` (status: ordered/dispensing/dispensed/partially_dispensed/out_of_stock/cancelled/needs_clarification; `source`: manual/manual_confirmed/ai_suggested/legacy_text) + `dispense_records` + `rpc_start_pharmacy_dispense` / `rpc_complete_pharmacy_dispense` / `rpc_send_pharmacy_back_to_clinician` (migration 064, commit `dc43d27`). **Web `PrescriptionWorksheet.tsx` and Android `PharmacyPickerSheet` / `PrescriptionWorksheetSheet` exist.**
- **Drug catalog:** `medication_catalog` (code/generic_name/strength/formulation/unit/category/active/default_price_ugx) + `rpc_get_clinic_catalog`.
- **Patient-first OPD list:** `rpc_get_opd_patients_today(clinic_id, filter)` with workflow keys `waiting | needs_vitals | with_clinician | awaiting_labs | at_pharmacy | done_today` (migration 048).
- **Patient identity:** `dob_precision` (exact/year_only/age_estimate/unknown), `birth_year`, `approximate_age`, geography (village/parish/subcounty/district), guardian, national_id, `patient_age_years()` helper, trigram fuzzy indexes (migration 038).
- **Vitals:** `patient_vitals` (patient-first, visit optional) + `rpc_insert_patient_vitals` (migration 029).
- **Payments:** `payments` already allows **multiple rows per visit** (partial payments supported at data layer); receipt sequence keyed to Kampala date (migrations 016, 062).
- **AI notes:** `ai_review_suggestions` + `ai_review_status`; web autosave **does** fire `queueDraftAiAssist` → `rpc_request_draft_ai_assist` → Inngest `note.draft-ai-assist` → `review-clinician-note.ts`.
- **HMIS 105:** `generate_hmis_105`; finalized = `status IN ('sent','completed')` + `department='opd'` + diagnosis code `source IN ('manual','ai_confirmed')` (migrations 013/014/038/062). **Keep intact** — Ministry subsidy dependency.

**Genuinely greenfield (new data models needed):**

- **Appointments / scheduling** — no table; follow-ups are free text in `visits.follow_up_instructions`. (Drives Today calendar + user request A.)
- **Billing charges / amount-owed ledger** — `payments` exists but there is no "what is owed" concept for partial-payment balances or profitability/cashflow. (User request B.)
- **Lab catalog** — labs are free-text `visits.tests_ordered`; no orderable-test master table (pharmacy has one, lab does not).

**Doc conflicts to reconcile (flag, then get Nate's ruling):**

- **C-CONFLICT-1 — lifecycle columns.** `ehr-pivot-implementation.md` §4.1 forbids adding a new `clinical_status` axis. Change #6 must therefore be implemented as *registration/check-in/check-out decoupling + queue-as-derived-view*, **not** a new status column. Resolved below in **F1**.
- **C-CONFLICT-2 — locked nav.** `ai-clinical-assist.md` §5 locks EHR nav to **Patients | Consult** for clinical roles. Change #2 introduces a top-header unit model (OPD/Inpatient/Lab/Pharmacy/Billing/Data). These are reconcilable (Patients + Consult live *under* OPD), but §5 of that doc will need updating once F4 lands. **Needs Nate's explicit OK to supersede the "locked" nav.**

---

## 3. The 16 mockups → change map

| C# | Mockup | Workstream |
|----|--------|-----------|
| C1 | Rebrand Karibu → **KaribuEHR** | F4 (ships alongside nav shell) |
| C2 | Today page = calendar + alerts + scheduling; top-header units; logo→Today | **F4** (nav) + **S-TODAY** + **F-SCHED** |
| C3 | Patients page = patient finder (drop status tabs, fix columns + age bug, add geography) | **S-PATIENTS** |
| C4 | Add vitals capture (web) | **S-VITALS** |
| C5 | Tighten dedupe match (name ≤2 chars AND same birth year) | **S-DEDUPE** |
| C6 | Split registration / queue / note lifecycles; check-out without note done | **F1** |
| C7 | Clinician note: unified dictation, floating dictate btn, AI review fires, AI→deterministic orders, auto follow-up tasks | **F2** + **S-NOTE** + bug #7b |
| C8 | Orders page: compact layout + data completeness | **S-ORDERS** (+ F5) |
| C9 | Worklists = clinician "Pending X" buckets, scrollable; rounds review → Today | **S-WORKLISTS** (+ S-TODAY) |
| C10 | Data unit: sidebar of reports, build out reports, draft vs finalized | **F3** + **S-REPORTS** |
| C11 | HMIS 105: finalize-by-clinician list + landscape single-page print | **F3** + **S-HMIS** |
| C12 | Data Quality layout (don't bury sections) | **S-REPORTS** |
| C13 | Pharmacy dispensing: close panel, per-med scripts, inline dispense, sticky actions, bilingual receipt | **S-PHARMACY** (+ F2, F5) |
| C14 | Stock page: layout, sentence case, drop dead ×, out-of-stock list; **realtime** | **S-STOCK** + **F5** |
| C15 | Pharmacy history: per-med status; canonical order flow | **S-PHARMACY** (+ F2) |
| C16 | Admin dashboard: staff/invites/permissions, profitability, cases-by-clinician, to-finalize count, role-gated | **S-ADMIN** (+ Billing, F3) |

---

## 4. Foundation workstreams (build first)

### F1 — Finish queue-as-spine → derived-view; decouple registration / check-in / check-out  *(C6)*

**Problem (C6):** A patient's chart shows `Queue Status: Waiting` while the clinician is writing the note, because `visits.queue_status` and `visits.status` live on the same row and `queue_status` is surfaced as the patient's state. Also: creating a patient force-creates a queued visit, but front desk enrolls the whole family — only the person seeking care should queue; and check-out must be possible without a finished note.

**Approach (respects §4.1 — no new status column):**

1. **Decouple "register patient" from "check in for care."** Patient creation must be able to create a `patients` row **without** calling `check_in_patient`. Add a registration path that does not auto-queue. **Relax `provider_notes.visit_id NOT NULL` this round** (visit_id nullable, patient_id required) per decision §7.3 — this is the known blocker for patient-only records (Patient-centered plan Phase 2).
2. **Stop surfacing raw `queue_status` as the patient's clinical state.** The chart should show note/encounter state, not the operational queue bucket. Queue presence becomes a *derived* attribute (is this patient in today's OPD list and in which workflow bucket).
3. **Drive operational lists from `rpc_get_opd_patients_today`** (workflow keys), not from `queue_status` transitions — per §6.5 (queue UI deprecated).
4. **Add an explicit "Check out" action** that closes the operational encounter for the day **independent of note signing** (note may stay draft). Reuse existing `complete_visit_queue` / a thin RPC; do not gate on `documentation_complete`.
5. **Three conceptual states, existing columns:** registration = `patients`; operational/queue = derived OPD bucket + check-in/out timestamps; documentation = `provider_notes` + `visits.status`/`documentation_complete`. No new axis.

**Touches:** `check_in_patient`, `get_clinic_queue`, `complete_visit_queue` (migrations 008/062), `rpc_get_opd_patients_today` (048), `visits/PatientsToolbar.tsx` create flow, chart `VisitDetailClient.tsx`.
**Risk:** High (backbone). Trace every consumer of `queue_status`/`status` (web, Android, HMIS) before changing display.

### F2 — Deterministic order pipeline: dictate → AI pre-select → catalog-backed order  *(C7c, C13b, C15c — canonical spec)*

**Canonical requirement (C15c):** "Dictate the order → AI pre-selects what you dictated → what *sends* to pharmacy is a deterministic, dropdown/catalog-backed order." No free text reaches pharmacy/lab.

**State today:** Pharmacy side is largely built — `medication_catalog`, `prescription_orders` (incl. `source='ai_suggested'`), web `PrescriptionWorksheet`, Android `PharmacyPickerSheet`. Gaps:

1. **Web clinician note still has a free-text "Pharmacy" textarea** (`PendingDictationCard.tsx`). Replace with the **catalog picker** that creates `prescription_orders` lines (mirror Android). This is the core of C13b on web.
2. **AI extraction from dictation → pre-selected catalog lines.** When the clinician dictates meds in the note, AI maps free text to `medication_catalog` entries as `source='ai_suggested'`, which the clinician confirms (→ `manual_confirmed`). Never submit `legacy_text`/free text. (Note: `ehr-pivot-implementation.md` §5.2 says *don't* parse free-text transcript to derive meds — so AI-suggest must be a **clinician-confirmed picker pre-fill**, not an auto-submit. Honor that.)
3. **Lab catalog (new):** create a `lab_test_catalog` table (mirror `medication_catalog`) + extend `rpc_get_clinic_catalog`, so lab orders are list-pick too. Today labs are free-text `tests_ordered` — this is why lab orders are unstructured.
4. **Android:** confirm `PharmacyPickerSheet` covers list-pick fully; add lab picker parity. (Per decision #4, Android is in-scope this round.)

**Touches:** `medication_catalog`, new `lab_test_catalog`, `rpc_get_clinic_catalog`, `prescription_orders`, web `PendingDictationCard.tsx` + pharmacy actions, Android dictation/picker, AI extraction (Inngest `review-clinician-note` or a dedicated extract step).
**Risk:** Medium-high; spans web + Android + AI + new lab table.

### F3 — Draft vs. finalized data model  *(C10, C11)*

**Rule:** reports run **only on finalized data**. "Finalized" for clinical fields = **note signed** (`documentation_complete=true` / `status IN ('sent','completed')`) AND, for diagnosis, code `source IN ('manual','ai_confirmed')`. Demographics (sex, geography, age) are **finalized without confirmation**. Diagnosis, medication, clinical plan require signing.

- This is **already how `generate_hmis_105` filters** (migration 062). Generalize the same predicate into a reusable definition all reports + the Data overview "unfinalized count" use.
- Surface **one** "to finalize" concept in three places: Worklists "My drafts / Pending" (S-WORKLISTS), Data overview unfinalized count (S-REPORTS), HMIS finalize-by-clinician list (S-HMIS).
- No conflict with AI doc: AI suggestions never auto-finalize; clinician confirmation = sign.

**Touches:** a shared SQL predicate/RPC for "finalized visits," consumed by reports + worklists. **Risk:** Low-medium.

### F4 — Navigation shell + rebrand  *(C1, C2)*

- **Top sticky header** = units **OPD · Inpatient · Lab · Pharmacy · Billing · Data**, reachable from any page.
- **Sidebar** = sub-nav within the selected unit.
- **Logo always → Today.**
- **Rebrand** all user-facing "Karibu" → **KaribuEHR** (wordmark, `<title>`, metadata, auth screens, receipts). Internal package names unchanged.
- **Role-gating:** Admin/Data/Billing visibility by role (C16 admin-only; AI-doc role rules: clinical roles see Patients+Consult; records/lab/pharmacy don't see Consult).
- **Map every current page into the two-level model.** Current shell: `dashboard-shell.tsx` / `web-shell.tsx` with `NAV_BY_ROLE`. **Approved mapping (decision §7.2) — Today is global (logo returns there), above the units:**

| Unit | Sidebar (sub-nav) |
|------|-------------------|
| **(global)** | **Today** — always reachable via the logo, above the unit header |
| OPD | Patients, Worklists, Orders, Consult |
| Inpatient | Admissions (ward list) |
| Lab | Lab desk (queue), Lab stock |
| Pharmacy | Dispensing (Today), Stock, History |
| Billing | Payments/charges, partial payments, cashflow |
| Data | Overview, HMIS 105, Data Quality, Profitability, Disease Burden, Demographics, Care Delivered, Readmission, Outbreak, Workbench |

**Risk:** Medium (every page re-homes); do early so screen work lands in the right place.

### F5 — Cross-cutting infra: realtime + stock server error  *(C13f, C14b, partial C8)*

- **Realtime (C14b):** no Supabase Realtime on web today (only a queue broadcast channel). Add `postgres_changes` subscriptions for the pages that must live-update: Stock, Pharmacy dispensing queue, Orders, Worklists, Today alerts. Decide pattern (per-page channel vs. shared hook).
- **Stock list server error (C13f):** "Stock list unavailable: Server Components render" — `listClinicPharmacyStock()` server action (`pharmacy/actions.ts`) is throwing; the prod error message is masked. **Investigate root cause** (run /investigate) before patching.
- **Orders completeness (C8):** pharmacy/lab orders not all appearing may share a root cause with the orders query keying off `visits.medications`/`tests_ordered` instead of `prescription_orders`. Verify during S-ORDERS.

**Risk:** Medium; realtime is broad. **Do `/investigate` for C13f first.**

---

## 5. Per-screen workstreams (after foundation)

- **S-TODAY (C2, C9-rounds):** Today = morning stand-up. Calendar (appointments, drives, admin, external lab/agency — needs **F-SCHED**), out-of-stock alerts (pharmacy/lab stock), **yesterday/rounds review** (recently-seen patients w/ one-line clinical summary, for learning + follow-up). Uses `rpc_get_opd_patients_today`.
- **F-SCHED (new data model, C2 / request A):** `appointments` table (patient_id, clinic_id, scheduled_at/window, type [follow_up/drive/admin/external], reason, unit, created_by) + RPCs + "Book follow-up" from chart + calendar read on Today.
- **S-PATIENTS (C3):** convert `/dashboard/visits` from visit-rows to **patient finder** (one row per patient via `rpc_search_patients`/OPD list). Drop status tabs + Status column (moves to Worklists). Phone → own column; age → own column (fix the **age display bug** — values exist in `patients` via `patient_age_years()` but aren't rendering); add geography. Tighten name↔next-column spacing; no row-height growth.
- **S-VITALS (C4):** web vitals capture UI on the chart/visit using existing `rpc_insert_patient_vitals` (nurse step, attachable to visit — not crammed into create-patient form). Match Android fields (temp, BP, pulse, resp, SpO₂, weight, height, MUAC).
- **S-DEDUPE (C5):** tighten `rpc_find_duplicate_candidates` (migration 038): require **name edit-distance ≤2 AND same birth year**; village becomes a *displayed badge*, not a match trigger. Define behavior when birth year unknown (approx/unknown precision) — likely suppress match. Drop the ±3-yr band + village-bonus scoring that currently over-matches.
- **S-NOTE (C7a/d/e):** unified single dictation area (match Android feel) feeding structured output; **floating dictate button** (not pinned bottom); **auto-derive follow-up tasks** from orders (order labs → "labs to be drawn" care_task flows to worklists — kills redundant manual task buttons). Pair with F2 (orders) + #7b bug.
- **#7b (bug):** AI review fires but silently fails on web — `/investigate` whether RPC gate (once-per-visit), Inngest env, or swallowed error. Add visible "AI reviewing" feedback.
- **S-ORDERS (C8):** compact layout (kill right-side wasted space; tighten name/action/status). Verify Orders reads from `prescription_orders` (+ lab) so all pharmacy/lab requests appear. Live-update via F5.
- **S-WORKLISTS (C9):** rename **Needs X → Pending X**; **scrollable** cards; clinician-scoped (pharmacy/lab use their own desks). Move rounds review to Today. Buckets map to F1 derived states + F3 finalized/draft + F2 order tasks. Current source: 7 RPCs in `worklists/actions.ts`.
- **S-REPORTS (C10, C12):** Data unit sidebar = Overview + each report. Build out: Data Quality, **Clinic Profitability** (needs Billing), Disease Burden, Demographics, Care Delivered, 30-day Readmission, Outbreak Watch, Workbench. All gated on F3 finalized data. Data Quality layout: don't bury "Missing Age Data" below long "Code Now" list (columns/tabs/collapsible w/ counts). Current location `/dashboard/admin/reports/*`.
- **S-HMIS (C11):** per-clinician **to-finalize list** (route unfinalized visits to the clinician who saw them → review → sign → counted). **Landscape single-page print** view of the HMIS 105 grid for the data tech to hand-enter 1:1. Keep CSV. Reuse F3 finalized predicate.
- **S-PHARMACY (C13, C15):** close-panel control (C13a); per-med scripts already in data (`prescription_orders`) — make UI **compact + linear** with **per-line dispense buttons** (C13c/d) + **sticky action bar** (C13h); **bilingual EN/Luganda receipt** (C13e); per-med status in **History** (C15a). Research dispensing UX (C13g).
- **S-STOCK (C14):** tighten name↔column gap + row padding; **sentence case** (drop ALL CAPS), remove repeated code line; **remove dead "×"**; add **out-of-stock list** driven by an **explicit "unavailable" supply flag** on stock items (decision §7.4 — distinct from `quantity_on_hand`). Live updates via F5.
- **S-ADMIN (C16):** role-gated Admin dashboard: staff add/remove, invites, permissions; clinic profitability; total cases; cases by clinician; **count of cases needing finalization** (F3). Space-efficient (laptop). Current `/dashboard/admin/page.tsx`.
- **Billing module (request B, C2/C16):** new **charges/ledger** concept on top of existing `payments` (which already supports partial rows). Billing unit UI: take partial payments, show balance owed, profitability + cashflow. Feeds Clinic Profitability report + Admin dashboard.

---

## 6. Suggested sequencing (foundation-first)

1. **F5 investigations first** (C13f stock error, #7b AI review, C8 orders completeness) — cheap, de-risks, may share root causes.
2. **F4 nav shell + rebrand** — re-homes every page; do before screen polish.
3. **F1 lifecycle decoupling** — backbone for Today/Patients/Worklists/check-out.
4. **F2 order pipeline** (incl. lab catalog + Android) — backbone for note/pharmacy/orders/worklists.
5. **F3 finalized-data predicate** — backbone for reports/HMIS/admin.
6. **New data models:** F-SCHED (appointments), Billing charges/ledger.
7. **Per-screen** S-* in any order, grouped by unit; pure-layout fixes (S-STOCK, S-ORDERS layout, S-PATIENTS columns) can parallelize as quick wins.

---

## 7. Resolved decisions (2026-06-18)

1. **C-CONFLICT-2 — nav:** **Supersede** the "locked" Patients|Consult nav with the unit header. **Action item:** update `ai-clinical-assist.md §5` (and §8 nav row) once F4 lands so docs stay consistent.
2. **F4 unit→page mapping:** Approved with **Today as a global destination** (above the units; logo always returns there) — not inside OPD. See revised table in F4.
3. **Patient-only notes:** **Relax `provider_notes.visit_id NOT NULL` now** (visit_id nullable, patient_id required) as part of F1. Enables true register-without-visit + clean check-in/out decoupling. Aligns with patient-centered plan Phase 2.
4. **Out-of-stock (C14):** **Explicit "unavailable" supply flag** on stock items (distinct from quantity). Small schema add.
5. **Billing depth:** **Full charges/ledger + partial payments + Clinic Profitability + cashflow this round.** Biggest new data model; fully satisfies request B.
6. **Calendar scope (C2 / F-SCHED):** **One calendar, both patient-linked and clinic-level events.** `appointments` table with **nullable `patient_id`** + `event_type` (follow_up | drive | admin | external_lab_agency).
7. **Wordmark:** **`KaribuEHR`** — one word, as written.

---

## 8. Build status — 2026-06-18 session (branch `fix/pharmacy-stock-load`, uncommitted)

`tsc` clean, 21/21 web tests pass. 7 new migrations (065–071). NOT YET prod-verified (no local DB).

**Complete + verified:**
- #7b AI review (env contract in `.env.example` + loud failure logging; enablement = Inngest/OpenAI deploy env)
- #8 Orders completeness (clinic-wide) + #8 layout
- #14b Realtime (broadcast + poll fallback, 6 pages)
- #1/#2 Nav shell (unit header, per-unit sidebar, logo→Today) + KaribuEHR rebrand
- #6(F1) lifecycle decouple — migration `068` (relax `provider_notes.visit_id`, `rpc_check_out_visit`), check-out button, queue display reframed
- #10/#11(F3) finalized predicate — migration `065` (`is_visit_finalized`, `rpc_unfinalized_visits`)
- #5 dedupe — migration `066` (Levenshtein ≤2 AND same age)
- #9 Worklists (Pending rename, scrollable, depth)
- #14 Stock polish + out-of-stock list — migration `067` (`is_unavailable`)
- #3 Patients finder (age bug fixed, patient-centric, columns, dropped status)
- #4 Vitals capture (web) — `recordVitals` + `VitalsCard`
- Billing v1 — migration `071` (charges/ledger, `rpc_patient_balance`, `rpc_clinic_cashflow`) + cashflow UI
- #16 Admin: cases-by-clinician + awaiting-finalization count
- #13a pharmacy close button (per-line dispense + sticky footer already shipped in dc43d27)

**Foundation laid, UI/remainder pending (migrations written, wiring remains):**
- F2 (#7c/#13b/#15c): lab catalog migration `069` done. REMAINING: web note catalog picker (replace free-text Pharmacy field), AI pre-select extraction, Android lab picker parity.
- F-SCHED (#2): appointments migration `070` (+ create/list RPCs) done. REMAINING: Today calendar UI.

**Not started:**
- S-TODAY (#2/#9): calendar render + out-of-stock alerts + yesterday/rounds review (RPCs `rpc_list_appointments` + stock `is_unavailable` ready to consume).
- S-NOTE (#7a/d/e): floating dictate button, unified dictation area, auto follow-up tasks.
- S-REPORTS (#10/#12): build out the report set + Data Quality non-buried layout.
- S-HMIS (#11): finalize-by-clinician list (consume `rpc_unfinalized_visits`) + landscape single-page print.
- #13e bilingual EN/Luganda dispense receipt.
