# Pharmacy Rework Spec — Structured Prescribing, Computed Quantity, Partial-Dispense Fix

**Date:** 2026-07-16
**Status:** Draft — pending Fable review, then agent implementation
**Scope:** PHARM-3 (sidebar), PHARM-4 (structured course-of-treatment prescribing + computed quantity + AI gate), PHARM-5 (partial-dispense fix + partials queue)
**Driver:** Beta feedback from SSUNGA HC III (Javis, weekly reports 2026-07-10 → 2026-07-15). Partial-dispense is the single most-reported issue (3 separate messages).

---

## 0. Invariant (safety-critical, applies across the whole spec)

**The AI has recording power, not prescribing power.** The AI may surface what was said during an encounter (a note, or a question in `ai_review_suggestions`), but a prescription becomes real **only** when a physician/nurse actively enters every structured field through deterministic controls. No AI-authored line ever reaches the pharmacy queue.

### Current state (grounded)
- `dictate` edge function = speech-to-text only; touches no meds.
- `reviewClinicianNote` (`apps/web/src/inngest/functions/review-clinician-note.ts`) emits **only questions** (`ask_med` etc.) into `ai_review_suggestions`. It never produces dose/frequency/duration and never writes `prescription_orders`.
- `incorporationFor` (`apps/web/src/lib/ai-review-helpers.ts:58`) only prefills note text (`"Consider: <question>"`) and opens the Rx picker. The clinician fills every field.
- `PrescriptionComposer` (web) and `PharmacyPickerSheet` (Android) both hard-stamp `source:'manual'`.
- `ai_suggested` / `manual_confirmed` are reserved-but-unused enum values (declared in `packages/shared/src/types.ts:883`, `apps/web/src/lib/validators/prescription.ts:15`, migration `064:80`). **No code ever writes them.**

### The gap to close
The invariant is currently enforced by convention, not by a barrier:
- `rpc_submit_pharmacy_order` (live def: `packages/supabase/migrations/101_replay_tolerance.sql:149`, insert at `:226`/`:261`) reads `source` verbatim from client `p_lines`, defaulting to `'manual'`. **No gate on `source`.** An `ai_suggested` line would pass the `CHECK` and reach the dispenser.
- `submitPharmacyOrder` server action (`apps/web/src/app/dashboard/visits/actions.ts:483`) types line `source?: string`, passes `input.lines` untouched (`:555`), and does not `.parse()` the zod schema.

### Fix (PHARM-4a — AI gate)
1. **Server-side gate in the RPC:** `rpc_submit_pharmacy_order` must reject any line whose `source` is not in an allowlist of human-entered sources (`'manual'`, `'legacy_text'`). Raise a clear error (`P0001`, message e.g. `"AI-suggested lines cannot be submitted to pharmacy"`). This is the true barrier — it protects against any client (present or future) that tries to submit an AI-authored line.
2. **Retire `ai_suggested` and `manual_confirmed` from the writable set.** Keep them out of `PrescriptionSource` input types; the DB `CHECK` may retain them for historical rows but the RPC gate forbids writing them. Update `PrescriptionLineInputSchema` (`validators/prescription.ts:14-16`) to a human-source enum, and actually call `.parse()` in `submitPharmacyOrder`.
3. **Type tightening:** `submitPharmacyOrder`'s line type must use the validated `PrescriptionLineInput`, not `source?: string`.

**Test:** RPC-level test that a line with `source:'ai_suggested'` is rejected; unit test that the server action `.parse()` throws on it; type test that the composer/picker cannot emit it.

---

## PHARM-3 — Collapse the pharmacy left rail to icons + tooltips

**Problem:** On an 8×11 tablet the left section nav (Dispensing / Stock / History under the clinic name) steals horizontal width from the master/detail dispense worksheet.

**Fix:** Collapsed-by-default icon rail with accessible tooltips (hover + long-press for touch); expandable on demand. Persist the expand/collapse preference. Ensure the worksheet reclaims the freed width.

**Files (to confirm at implementation):** pharmacy section layout under `apps/web/src/app/dashboard/pharmacy/` (locate the nav/sidebar component rendering Dispensing/Stock/History) and any shared dashboard `Sidebar`. Implementation agent must first locate the exact component — not mapped in this pass.

**Constraints:** touch targets ≥ 44px; tooltip must be reachable without hover on touch devices; must not regress the top app nav (Home/OPD/Inpatient/…).

**Tests:** component test for collapsed/expanded states + tooltip content; visual check at tablet width (~1024px). Independent of PHARM-4/5.

---

## PHARM-5 — Partial-dispense fix + partials queue

**Problem (most-reported):** A partially-dispensed line never leaves the queue, shows "already dispensed 2 of 2" yet stays `Partial`, and there is no way to dispense the remaining balance.

### Root cause (three compounding bugs, grounded)
1. **Completion is driven by the operator's Outcome dropdown, not by math.** `rpc_complete_pharmacy_dispense` (live def `packages/supabase/migrations/102_queue_autocomplete.sql:481-651`, status set at `:613-619`) writes `prescription_orders.status` **verbatim** from the client `line_status`. Nothing promotes a line to `dispensed` when cumulative dispensed reaches prescribed.
2. **Over-dispense guard uses strict `>`** (`102:554-568`, `:562`): `v_already + v_qty > v_prescribed`. A full-quantity dispense recorded as "Part" passes, because `0 + 2 > 2` is false.
3. **`'partial'` is in BOTH queue sets.** `pharmacy-data.ts:32-64`: `ACTIVE = ['not_started','in_progress','partial','out_of_stock']` (To-dispense) and `TERMINAL = ['dispensed','partial','out_of_stock']` (Done-today). A partial visit appears in both tabs.

Supporting facts: "remaining" is not stored — recomputed on read in `pharmacy-data.ts:144-169` by summing `dispense_records.quantity_dispensed` for `line_status IN ('dispensed','partially_dispensed')` into `quantity_dispensed_so_far`. `aggregate_visit_dispensing_status` (`094_wp1_close_the_loops.sql:16-65`) returns `'dispensed'` only if all lines are `dispensed`. UI already computes `remainingToDispense(line)` and defaults QTY to it (`PrescriptionWorksheet.tsx:62-80`).

### Fix
1. **Derive line completion in the RPC.** After inserting the `dispense_record`, recompute `v_already = SUM(dispense_records.quantity_dispensed WHERE line_status IN ('dispensed','partially_dispensed'))`. Set `prescription_orders.status`:
   - `>= quantity_prescribed` → `dispensed` (regardless of the dropdown),
   - `> 0` and `< prescribed` → `partially_dispensed`,
   - `out_of_stock` outcome with 0 dispensed → `out_of_stock`.
   The Outcome dropdown's meaning changes to "did the patient get everything now, or is a balance owed?" — it no longer *sets* terminal status; the math does.
2. **Fix the guard to `>=`-safe accounting.** Reject only genuine over-dispense (`v_already + v_qty > v_prescribed`), but ensure a full remaining dispense marks the line `dispensed` (bug #1 fix makes this automatic).
3. **De-dup queue membership.** Remove `'partial'` from one of the two sets. Decision: partials get their **own tab** (see #5), so `TERMINAL`/Done-today should include only fully `dispensed` (+ terminal `out_of_stock`/returned as today), and `ACTIVE`/To-dispense should exclude `partial`.
4. **Visit-level rollup:** `maybe_complete_visit_queue` (`102:81-136`, terminal check `:119-121`) must treat a fully-dispensed set as complete; a visit with any open balance stays actionable via the partials tab.
5. **Partials tab + dispense-the-rest.** Add a **"Partial"** tab to `PharmacyTabs` alongside To-dispense / Returned / Done-today. Selecting a partial line opens the worksheet with QTY defaulted to the **remaining** balance (`remainingToDispense`, already computed). Dispensing the remainder auto-completes the line (bug #1 fix).

**Files:** `packages/supabase/migrations/<new>_pharmacy_partial_completion.sql` (additive: new RPC version + updated `aggregate_visit_dispensing_status`/`maybe_complete_visit_queue`), `apps/web/src/app/dashboard/pharmacy/pharmacy-data.ts` (queue sets), `PharmacyTabs.tsx` (new tab), `PharmacyStationClient.tsx` (`handleDispenseCompleted`/`removeRow` at `143-152`/`127-141`), `PrescriptionWorksheet.tsx` (outcome semantics, remaining default), `pharmacy-shared.tsx` (status pill). Android dispenser side (`ui/pharmacy/PrescriptionWorksheetSheet.kt`) reads the same fields — verify it reflects derived status.

**Tests:** RPC test — dispense full qty as "Part" → line becomes `dispensed`, leaves To-dispense. RPC test — dispense 1 of 2 → `partially_dispensed`, appears in Partial tab, remaining = 1; dispense the 1 → `dispensed`. `pharmacy-data.test.ts` — a `partial` visit appears in exactly one tab. e2e (`pharmacy-station.spec.ts`) — partial → dispense remainder → Done.

> **PHARM-5 is independent of PHARM-4 and is the priority.** It can ship first.

---

## PHARM-4 — Structured course-of-treatment prescribing + computed quantity

**Goal:** A prescription is oriented around the **course of treatment** (dose × frequency × duration), from which the dispensable quantity is **computed**, so (a) "quantity" is unambiguous, (b) the pharmacist can substitute by strength with an automatic recompute, and (c) it plugs into future inventory management. Every field is deterministically entered by a physician/nurse.

### Current state (grounded)
Both surfaces are **semi-structured** but serialize to free text and never compute quantity:
- **Web `PrescriptionComposer.tsx`:** drug `<select>`; strength free-text `<input>`+datalist; **dose free-text `<input>`**; route `<select>`; frequency `<select>` (default BID); duration `<select>` + **"Custom / PRN" (empty)**; quantity numeric `<input>`; **unit free-text `<input>`**. `draftLinesToRpcInput` (`:303`) stamps `source:'manual'`, sets `duration_text = \`${durationDays} days\``.
- **Android `PharmacyPickerSheet.kt`:** 4-step wizard; strength dropdown; **quantity free-text** (`.toDoubleOrNull()`, `quantityUnit` hard-coded null); route dropdown; frequency dropdown; duration dropdown + **"Custom…" free-text**; notes. Enums live in `HcDrugCatalog.kt` (`Frequency`: OD,BID,TID,QID,Q4H,Q6H,Q8H,Q12H,STAT,HS,AC,PC,PRN; `Route`; `durations`: 1,3,5,7,10,14,21,30).
- **Storage:** `prescription_orders` (`064_structured_pharmacy.sql:60-87`) — `dose_text/route_text/frequency_text/duration_text` all TEXT; `quantity_prescribed NUMERIC` + `quantity_unit TEXT`. Room mirror `PrescriptionOrderEntity.kt` same shape. Structured strength/formulation live only on `medication_catalog`/`pharmacy_stock_items`.

### Target model
Add **structured, authoritative** fields to the prescription line (additive; keep `*_text` for back-compat and print summaries):

| Field | Type | Notes |
|---|---|---|
| `frequency_code` | enum | OD/BID/TID/QID/Q4H/Q6H/Q8H/Q12H/HS/STAT/PRN (mirror `HcDrugCatalog.Frequency`) |
| `frequency_per_day` | int (derived) | canonical doses/day; PRN/STAT handled specially |
| `duration_days` | int, nullable | required for scheduled; null for PRN/fixed-qty |
| `dose_amount` | numeric | numeric dose per administration |
| `dose_unit` | enum | `mg` / `mL` / `tab` / `cap` / `drop` / `puff` (strength unit vs form clarified below) |
| `strength_amount` + `strength_unit` | numeric + enum | e.g. 500 + mg, or 125 + mg/5mL for concentration |
| `form` | enum | tablet/capsule/syrup/suspension/… (from catalog) |
| `order_mode` | enum | `scheduled` (computed) or `fixed_quantity` (PRN/STAT, clinician enters total) |
| `quantity` | numeric | **computed** for scheduled, **entered** for fixed_quantity; clinician can confirm/override |
| `dispense_unit` | enum | the unit stock is counted in (tab/cap/mL) |

> **"Unit" is overloaded today.** Keep two distinct concepts: *strength unit* (mg, mg/mL — belongs to the drug) and *dispense unit* (tab, mL — what stock is counted in). The UI must label them separately.

### Quantity computation (must be identical across web, Android, and validated server-side)
Canonical logic lives in shared (`packages/shared/src/pharmacy-catalog.ts`) with a Kotlin mirror in `HcDrugCatalog.kt`; both must produce the same number.

- **Scheduled meds:**
  - `total_doses = frequency_per_day × duration_days`
  - Tablets/caps: `units_per_dose = dose_amount / strength_amount` (e.g. 1000mg ÷ 500mg = 2 tabs). Allow half-tablet increments (0.5) — Ugandan practice uses ½ tab; flag/round non-0.5 fractions for clinician review.
  - Liquids: `mL_per_dose = dose_amount` (if dose entered in mL) **or** `dose_amount(mg) ÷ concentration(mg/mL)`.
  - `quantity = units_per_dose × total_doses` (in `dispense_unit`).
- **PRN / STAT / fixed_quantity:** no duration; clinician enters the total quantity directly. `order_mode = fixed_quantity`.
- **frequency_per_day map:** OD=1, BID=2, TID=3, QID=4, Q4H=6, Q6H=4, Q8H=3, Q12H=2, HS=1. STAT/PRN → fixed_quantity path.
- `quantity` is a **computed default the clinician confirms or overrides** — confirmation keeps it "human-entered," satisfying the invariant.

### Substitution (dispense-time)
- **Same molecule, different strength:** pharmacist may substitute at the counter; the tablet/mL count for the **remaining balance** auto-recomputes from the substitute's strength (250mg for a 500mg order ⇒ double the tabs). Record the substitution + notes (`dispense_records` already has `substitute`, `substitute_notes` per `PrescriptionWorksheet.tsx` LineDraft).
- **Different molecule / therapeutic swap:** not allowed at the counter — routed back via the existing "Returned to clinician" flow (`rpc_send_pharmacy_line_back_to_clinician`) for a clinician to re-prescribe.

### Deterministic-entry hardening (removes free-text escape hatches)
- Web composer: dose → numeric input + unit enum; quantity → computed/confirmed (read-only-ish with explicit override); remove "Custom / PRN" free-text duration → structured `order_mode=fixed_quantity` path; unit → enum.
- Android picker: quantity free-text → computed/confirmed; "Custom…" duration → structured; `quantityUnit` must be set (not null).
- Enforce enums + integer duration in `PrescriptionLineInputSchema` and the RPC. `*_text` columns become **derived** (assembled from structured fields for print/summary), not the source of truth.

### Surfaces that change
- **Shared:** `packages/shared/src/types.ts` (`PrescriptionOrderLine`, `PrescriptionLineInput`, enums), `packages/shared/src/pharmacy-catalog.ts` (freq map + compute fn + enums).
- **Web:** `PrescriptionComposer.tsx`, `VisitPharmacyPanel.tsx`, `prescription-line-mappers.ts`, `lib/validators/prescription.ts`, `app/dashboard/visits/actions.ts` (`submitPharmacyOrder`).
- **Android:** `ui/dictation/PharmacyPickerSheet.kt`, `PharmacyPickerResult.kt`, `DictationViewModel.kt` (+ `DictationScreen.kt`), `domain/catalog/HcDrugCatalog.kt`, `data/remote/dto/Dtos.kt` (`PrescriptionLineRpc`, `SubmitPharmacyOrderRequest`, `PrescriptionOrderDto`), `data/local/db/entity/PrescriptionOrderEntity.kt` (+ Room migration), `domain/model/PrescriptionOrderLine.kt`, `data/repository/PrescriptionOrderRepository.kt`, `VisitRepository.kt`, `data/sync/SyncEngine.kt`.
- **DB:** additive migration on `prescription_orders`; updated `rpc_submit_pharmacy_order` (structured fields + AI gate + server-side quantity validation); `format_prescription_line_summary` / `rebuild_visit_medications_summary` to derive `*_text` from structured fields.

---

## Migration / back-compat

- **Additive only.** New structured columns are added; `*_text` retained. New orders write structured fields (and derive `*_text` for display/print). Existing free-text/`legacy_text` orders continue to render from `*_text`.
- Small live footprint (few patients) → **no destructive rewrite now**; plan to phase out the free-text path as more clinics onboard. Track as a follow-up.
- **Room migration** on Android must be additive with a version bump; offline queued orders in the old shape must still sync (SyncEngine tolerates both shapes during transition).
- **Replay/idempotency:** preserve `p_client_op_id` idempotency (per `101_replay_tolerance.sql`) in the new RPC version.

---

## Test plan (write tests as part of the work)

**Unit (shared):** quantity computation — scheduled (BID×5d, TID×7d, half-tab dose 250mg from 500mg → fractional), PRN/fixed, mg→mL via concentration; freq→per-day map; web/Kotlin parity (same inputs → same number).

**Server / RPC:** AI gate rejects `ai_suggested`; partial completion derives `dispensed` at `SUM >= prescribed`; over-dispense still rejected; substitution recompute for remaining balance; idempotent replay of the same `client_op_id`.

**Web:** `pharmacy-data.test.ts` — partial visit in exactly one tab; `PharmacyStationClient.test.tsx` — dispense-remainder flow; composer emits structured fields + `source:'manual'` only; server action `.parse()` throws on `ai_suggested`.

**e2e (`pharmacy-station.spec.ts`):** structured prescribe → dispense partial → Partial tab → dispense remainder → Done; substitution by strength.

**Android:** Room migration test (additive, old rows readable); `PharmacyPickerSheet` emits structured line with computed quantity + non-null unit; SyncEngine round-trips both old and new payload shapes.

---

## Open decisions for Fable review

1. **Fractional tablets:** allow 0.5 increments and flag other fractions, or force whole tablets with round-up? (Spec assumes 0.5 allowed + flag.)
2. **Quantity override:** clinician may override the computed quantity freely (spec: yes, with the override still counting as human-entered). Any guardrail (e.g. warn if override deviates >X% from computed)?
3. **AI source values:** drop `ai_suggested`/`manual_confirmed` from writable types entirely (spec) vs keep `manual_confirmed` for a future "clinician confirmed an AI question" audit signal?
4. **Partials tab placement:** dedicated "Partial" tab (spec) vs a filter within To-dispense.
5. **Duration for PRN:** confirm `order_mode=fixed_quantity` with clinician-entered total is the right model for PRN/STAT (spec assumes yes).
6. **Sequencing:** ship PHARM-5 (+ PHARM-3) first, PHARM-4 second? Or land all together behind the additive migration?

---

## Sequencing for implementation agents

1. **Agent A — PHARM-5** (backend partial-completion RPC + queue sets + partials tab + tests). Independent, highest priority.
2. **Agent B — PHARM-3** (sidebar collapse + tests). Independent.
3. **Agent C — PHARM-4 backend** (schema migration, structured RPC, AI gate, shared compute fn + validators + tests).
4. **Agent D — PHARM-4 web** (composer/panel/mappers/action) — depends on C's shared types.
5. **Agent E — PHARM-4 Android** (picker/DTOs/Room/sync + Kotlin compute mirror) — depends on C's contract.

Worktree isolation where surfaces overlap (C/D/E share shared types — land C first or coordinate the contract).

---

## Revisions after Fable review (v2 — AUTHORITATIVE where it conflicts with anything above)

Fable verified every load-bearing citation above as correct, and found four issues serious enough to change the plan. Two verified by hand (`PrescriptionOrderLine.kt:36-46`, `PrescriptionWorksheetSheet.kt:50`). The following amendments are mandatory before agents start.

### R1 — Dispense accounting must be in dose-equivalents, not raw units (fixes the substitution hole)
The over-dispense guard (`102:562`) and the derived-completion sum both operate on **raw `quantity_dispensed`**, which breaks the moment a pharmacist substitutes a different strength.
- Each `dispense_record` stores **two** quantities: `quantity_dispensed` (in the *substitute's* dispense unit — used for stock decrement / FEFO) **and** `prescribed_equivalent` (converted to the *original prescribed* dispense unit via the strength ratio, e.g. 8×250mg tabs = 4 prescribed-equivalent 500mg tabs).
- The **guard and completion math run on `prescribed_equivalent`** (or equivalently, on fraction-of-course dispensed). `SUM(prescribed_equivalent) >= quantity_prescribed` → `dispensed`.
- Add `prescribed_equivalent` (nullable numeric) to `dispense_records` in the additive migration. When no substitution, `prescribed_equivalent = quantity_dispensed`.

### R2 — Android dispenser is IN PHARM-5 scope (it ships a new sync-poison vector otherwise)
PHARM-5 is **not shippable** while the Android dispenser can generate guaranteed-rejected ops. Add to PHARM-5:
- `PrescriptionOrderLine.kt` — fix `pharmacyTabForVisit` (`:36-46`): a `partial` visit must stay in the working queue, not go to DoneToday; and fix the Kotlin `aggregateDispensingStatus` mirror (`:49-64`) to agree with the server's derived status.
- Expose remaining balance to Android: add `quantity_dispensed_so_far` to `PrescriptionOrderEntity`, `PrescriptionOrderLine.kt`, `PrescriptionOrderDto`, and the pull path.
- `PrescriptionWorksheetSheet.kt:50` — default `quantityDispensed` to **remaining**, not `quantityPrescribed`.
- **Interim safety valve:** until the above lands, block re-dispense of `partially_dispensed` lines on Android (they have no remaining data) so we never enqueue a doomed op.
- Reconcile the TS mirror too: `pharmacyTabForVisit`/`aggregateDispensingStatus` in `validators/prescription.ts:58,77` currently disagree with the Kotlin ones (partial → in_progress vs DoneToday).

### R3 — Three correctness fixes to PHARM-5 as written
- **NULL-quantity fallback:** `quantity_prescribed` is nullable (`064:72`; never set for `legacy_text`, `101:261-267`) and `dispense_records.quantity_dispensed` is nullable. The derived-completion rule must add a branch: **when `quantity_prescribed` is NULL or the record has no quantity, fall back to the operator's dropdown status** (current behavior). Test this explicitly.
- **`out_of_stock` has the same dual-membership bug as `partial`** (`pharmacy-data.ts:32-33` — it's in both `ACTIVE` and `TERMINAL`). The queue de-dup must decide OOS placement too. Also reconcile `lineIsEditable` (`PrescriptionWorksheet.tsx:83`, excludes OOS) vs the RPC dispensable set (`102:549`, includes OOS) so a restocked OOS line is dispensable *and* editable.
- **Drop PHARM-5 fix #4 rewrite:** `maybe_complete_visit_queue`/`aggregate_visit_dispensing_status` already terminalize correctly once lines actually reach `dispensed` — do **not** rewrite them; the R1/derived-completion change is sufficient.

### R4 — RPC signature strategy (avoid PostgREST overload / stuck-submit regression)
Carry all new PHARM-4 structured fields **inside the existing `p_lines` JSONB** — **no change to the `rpc_submit_pharmacy_order` argument list.** (This codebase already ate a stuck-submit serialization hotfix, commit `9277dca`.) If a signature change is ever unavoidable, the migration must `DROP FUNCTION` the old signature atomically in the same transaction. Same rule for the dispense RPC.

### R5 — Quantity-computation clinical hardening (PHARM-4)
- **Branch computation on `dose_unit`:** `tab`/`cap` → `units_per_dose = dose_amount` directly (do NOT divide by strength); `mg` → divide by `strength_amount`; `mL` → direct, or `dose_amount(mg) ÷ concentration(mg/mL)`; `drop`/`puff` → direct. The mg-divide formula in the body applies ONLY to `dose_unit = mg`.
- **Sanity range check:** if `units_per_dose` falls outside ~0.25–4 tabs (or an equivalent per-form band), force explicit clinician confirmation — guards mis-taps like `dose_amount=1 mg` on a 500mg drug.
- **STAT computes** `total_doses = 1` (one dose), NOT fixed_quantity — several catalog obstetric injections default to STAT; don't reopen a free-entry hole for acute drugs. PRN remains `fixed_quantity`.
- **Pack/container concept for liquids + inhalers:** amoxicillin 125mg/5mL × 5d = 150mL but stock is 100mL bottles; salbutamol dispenses as an inhaler. Add `dispense_unit ∈ {…, bottle, inhaler}` with mL-per-container from the catalog, so the computed number is right at the counter and stock decrement (in containers) reconciles with dispense records. Compute in mL then round up to whole containers where the form is a container.
- **Keep AC/PC in `frequency_code`** (Android ships them today) — map to a per-day count (~TID) as meal-timing modifiers. Beware the Route enum's Ophthalmic "OD" colliding with frequency "OD" in any text-derivation code.

### R6 — Parity, provenance, scope fences
- **Shared golden-vector fixture** for the quantity computation, consumed by BOTH the TS and Kotlin test suites (a committed JSON of input→expected). There are already 3 drifting mirrors of `aggregate_visit_dispensing_status` (SQL/TS/Kotlin); do not add a 4th unpinned one.
- **Override provenance replaces `manual_confirmed`:** add `quantity_source ∈ {computed, overridden}` (or a boolean) so the audit trail records whether the clinician accepted the computed number or overrode it. Retire `manual_confirmed`/`ai_suggested` from writable types (open decision 3 → resolved: retire).
- **Inpatient `medication_orders` (migrations 054/074) is explicitly OUT OF SCOPE** — it is a separate free-text ward system that never touches pharmacy stock or the dispense queue. Agents must not unify it.
- **HMIS/reports:** `admin/reports/care-delivered/page.tsx:39` reads `prescription_orders`; keep report queries `*_text`-tolerant. HMIS 105 (013/014) is unaffected.
- **`needs_clarification` × partial:** decide which tab wins for a visit with both a partial line and a returned line (aggregate currently returns `partial`).
- **CI grep check:** assert nothing outside `PrescriptionComposer`/`PharmacyPickerSheet` constructs prescription-line submit payloads (the AI gate enforces the label; this enforces provenance).

### R7 — Sequencing correction
- **Agent A (PHARM-5) also edits `packages/shared`** (`PharmacyQueueTab` gains a `partial` member) — so A and C both touch shared types. **Land A's shared change before C branches**, or have C rebase onto A.
- PHARM-5 now spans backend **and** Android (R2) — it's larger than "backend-only" but still first and highest priority. Consider splitting: **A1** backend/web partial-completion + queue + R1 accounting; **A2** Android dispenser (R2). A2 depends on A1's contract (`prescribed_equivalent`, remaining exposure).

### Go / No-Go
Fable: **Go, with R1–R3 mandatory before spawning agents.** R1 (accounting unit) is the one that, unfixed, makes Agent A faithfully implement a model that rejects the spec's own substitution flow. R2 keeps us from shipping a new poison vector to the offline surface the clinic actually uses.
