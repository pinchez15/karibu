# Inpatient module — feature update (tester asks, 2026-07-09)

**Source:** lead tester's email, "Inpatient module ideas." His five asks, verified against the codebase the same day. The headline: **three of the five substantially exist already** — the gap is discoverability and print/reporting surfaces, not the clinical spine. Do the walkthrough before building anything.

## What already exists (show him, don't build)

The HC III ward spine shipped as migrations 053–058 + 074 and is live on **both** surfaces (in 1.0.31 on Android, deployed on web):

| Capability | Web | Android |
|---|---|---|
| Ward census (active admissions, rounds view) | `dashboard/inpatient` → `WardCensusClient.tsx` | `ui/inpatient/WardCensusScreen.kt` |
| Admit patient | `AdmitPatientForm.tsx` | `AdmitPatientScreen.kt` |
| **Admission chart** — obs (with overdue alerts), treatment chart with dose slots + not-given-stockout, IV infusions, quick vitals, due-now panel, progress notes, maternity (delivery record, newborn, postnatal) | `AdmissionChartClient.tsx` (+ `DueNowPanel`, `IvDripPanel`, `MaternityPanel`, `QuickVitalsBar`) | `AdmissionChartScreen.kt` + `ui/inpatient/chart/` |
| Ward handover | `WardHandoverClient.tsx` | `WardHandoverScreen.kt` |
| Discharge / outcome close-out — outcome (recovered / improved / unchanged / referred / absconded / died), disposition (home / referred / other), discharge notes, timestamps; referred → `transferred` | `rpc_discharge_admission` (migration `055_inpatient_discharge.sql:18`) wired in both UIs | same |
| Lab orders from the admission chart | `AdmissionChartClient.tsx:377` embeds `VisitLabPanel` | — |

So ask #1 (**"an inpatient record sheet or admission chart… so documentation can be done electronically"**) is **built**. That the ward's most engaged tester hasn't seen it is the finding: it's reachable from the Inpatient section, not from the OPD flow he lives in.

**Action A0 — Walkthrough + discoverability (do first, costs nothing):**
- Walk the tester through admit → chart → obs/treatment → discharge on the tablet and web (fits his proposed Monday Lunch & Learn).
- Small nav ticket if the walkthrough confirms it's hard to find: surface an "Admit" action from the patient chart / OPD visit for clinical roles, and make the Inpatient entry visible in the Android home for nurse/clinical-officer roles at clinics with `workflow_config` inpatient enabled.

## What's genuinely missing (the buildout)

Four items, ordered so each ships independently. All web-first (ward reporting and printing are desk activities); Android parity only where noted.

### B1 — Discharged patients list

**Gap confirmed:** the census reads `rpc_active_admissions` only (`dashboard/inpatient/actions.ts:53`); once discharged, a patient disappears from every inpatient view even though the data (outcome, disposition, notes, `discharged_at`) is fully captured.

**Build:** new RPC `rpc_discharged_admissions(p_clinic_id, p_from, p_to, p_outcome default null)` (SECURITY DEFINER, staff-in-clinic assertion, follows the `rpc_active_admissions` shape) + a "Discharged" tab on `dashboard/inpatient` with date-range + outcome filters, linking each row to the (read-only) admission chart. Default range: last 30 days.

**Tests:** SQL test seeding active + discharged + transferred admissions → list returns only closed ones in range, ordered by `discharged_at` desc; clinic-scoping asserted (other clinic's rows never returned).

### B2 — Monthly admission & discharge summary (HMIS-aligned)

**Gap confirmed:** no inpatient monthly report exists; migration 055's tallies feed HMIS 105 fields only.

**Build:** a monthly report page under `dashboard/admin/reports` (the HMIS 105/106a pages are the pattern to copy): admissions, discharges by outcome, deaths, absconded, referrals-out, deliveries/maternity counts, mean length-of-stay, bed-days — per month, per clinic. **Align the row structure with the MoH inpatient monthly report (HMIS 108) rather than inventing our own** — verify the current 108 form with the diocese HMIS focal person before locking columns; the diocese files these to unlock subsidies, same as 105.

**Tests:** SQL test for the aggregation RPC — seeded month with known admissions/outcomes returns exact counts; month boundaries (admitted in June, discharged in July) land in the right buckets (count admission in admission-month, discharge in discharge-month — state this rule in the RPC comment).

### B3 — Printable discharge summary

**Gap confirmed:** no print views exist anywhere in the inpatient module.

**Build:** `dashboard/inpatient/[id]/print` following the existing print precedent (`dashboard/visits/[id]/print/PrintView.tsx` + `PrintBlocker.tsx`). Content: facility header, patient identifiers, admission + discharge dates, ward diagnosis, outcome/disposition, discharge notes, medications on discharge (from the treatment chart's active orders at close-out), follow-up instructions, clinician name + signature line. **A4, not 58mm** — this is a document the patient carries to the next facility, not a receipt. Add a "Print discharge summary" button on the closed admission chart and on each B1 row.

**Tests:** e2e/fixture render test (match `apps/web/src/app/e2e/receipt-fixture` conventions): the print view renders every section for a seeded discharged admission and shows a clear "not discharged yet" state for an active one.

### B4 — Printable admission chart

**Build:** print stylesheet/view for the full admission chart (obs table, treatment chart grid, IV record, progress notes, maternity section when present) so a paper copy can go in the physical file or accompany a referral. Same print-view pattern as B3; paginated A4; charts render as tables (no interactive components). Lower priority than B3 — B3 is the document with a real-world recipient.

**Tests:** render test with a dense seeded admission (multi-day obs + treatment rows) — no clipped columns, page breaks between sections.

**Sequencing:** A0 now (no code) → B1 → B2 → B3 → B4. B1 and B3 share the closed-admission read path; build B1's RPC first and reuse it.

## The register integration (his "future ideas" question)

His ask: "how feasible would it be for Karibu to automatically feed data into the electronic register?"

**Answer for him: the feasibility work is already done.** The reports page already produces a DHIS2-shaped export — the quarterly HIV/TB program report "for DHIS2 (HTS, ART, VL)" (`dashboard/admin/reports/page.tsx:148`) — and DHIS2 alignment is an explicit design goal in the compliance review (`docs/KARIBU_LEGAL_COMPLIANCE_REPORT.md`, which also recommends engaging the MoH HIIRE TWG before wiring a live integration). What remains for true auto-feed is the productionization: DHIS2 Web API push (dataValueSets) with facility org-unit mapping and period alignment, credentials management, and MoH engagement. That's a scoped project for after the pilot month — and B2's HMIS-108-aligned monthly summary is deliberately the dataset that integration would push, so B2 is the stepping stone, not throwaway work.

## Suggested reply framing for the tester

1. The admission chart, ward census, treatment chart, and discharge close-out already exist on both web and tablet — let's walk through them Monday alongside the CME session.
2. A discharged-patients list, monthly admission/discharge summaries (HMIS-aligned), and a printable discharge summary are agreed and queued — in that order.
3. The register integration groundwork exists (we already export DHIS2-format reports); live auto-feed comes after the final pilot month, and the monthly summary we're building is step one of it.
