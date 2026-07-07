# WP4 — Access model (audit visibility, restricted records, program sensitivity, capabilities)

**Priority:** P1 · **Platforms:** both (enforcement in RPCs; UI on web + Android)
**Theme:** *Navigation follows the role, permissions follow the action, confidentiality
follows the patient, accountability follows the person.* Default-open reads within the
clinic + audit visibility — NOT default-closed role walls. Break-the-glass, never
approval loops. The six-second search→tap→chart path must not gain a single click.

---

## Product decisions (locked, from 2026-07-07 session)

1. **Reads are default-open to clinic staff, audited.** Role-based read denial is
   rejected for HC III reality (6–10 staff wearing many hats; the paper OPD register
   already exposes diagnoses; hiding HIV status from treating clinicians is clinically
   dangerous). The working control is visibility of access, not prevention.
2. **Hard walls only for bulk/admin:** exports, HMIS reports, billing reports, purge,
   staff management. A chart view is bounded harm; an export is mass disclosure.
3. **Sensitive programs get a curtain, not a wall:** HIV, TB (extend later to mental
   health/SGBV). One-tap break-the-glass with prominent logging — no blocking, no
   approval.
4. **The curtain must not itself disclose:** a "Program records" section appears on
   EVERY chart, occupied or empty, with identical friction.
5. **Module hiding is demoted to focus/navigation default** — not a security boundary.
6. **Capabilities become per-clinic config, not hardcoded role lists** (first consumer:
   dispensing; the stranded 093 migration on `fix/web-calendar-timezone` is superseded).
7. Regulatory footing: Uganda Data Protection and Privacy Act (2019) treats health data
   as a special category; purpose-limited access + audit trail is the compliance story
   at 2,000-clinic scale.

## Problems (verified)

- `audit_logs` (001 ~L120) covers writes only; **no chart-view logging exists**.
- HIV/TB registry reads (`rpc_active_hiv_care`, `rpc_recent_hts_events`, 088) are gated
  only by `assert_staff_in_clinic` and are **GRANTed to `anon`** (088 ~L541, L567,
  L590) — the most sensitive data has the loosest gating while pharmacy stock has the
  hardest walls.
- Dispense allowlist `('admin','dispenser')` hardcoded across 064/077/083/087/089 +
  web `assertDispenser()` + Android role routing. Nurses/COs cannot dispense; reality is
  task-shifted per shift.
- Role-set drift: `staff-roles.ts` claims source-of-truth but `note-actions.ts` (~L12–19),
  `vitals-actions.ts` (~L8–15), inpatient pages define local sets that disagree —
  `records_officer` gets nav to desks whose actions reject them.
- Clerk webhook fallback maps `org:member` → `doctor` when no invitation row exists
  (`clerk.ts` ~L443–446).
- 009 RLS policies still gate on `role='doctor'` (dormant — writes go through RPCs —
  but a booby trap for future direct access).
- Live incident: a staff member was treated at the clinic; his record is now browsable
  by all colleagues.

## Deliverables (staged — ship in this order)

### Stage 1 — Chart access log

1. **Migration:** `chart_access_log(id, clinic_id, staff_id, patient_id, surface TEXT,
   accessed_on DATE, first_at, last_at, count)` with UNIQUE
   `(staff_id, patient_id, accessed_on)` — one row per staff/patient/day, cheap.
   Write via a `rpc_log_chart_access` (or piggyback on existing chart-read RPCs/server
   actions — web patient/visit detail loaders + Android chart open).
2. **Weekly digest for the clinic in-charge** (admin dashboard card: accesses by staff,
   outliers, glass-breaks once Stage 2/3 exist).
3. **"Who viewed my record":** any staff member who is also a patient can see the access
   list for their own patient record (self-service, admin surface).
4. **Fix 088 grants:** REVOKE `anon` from the HIV/TB read RPCs (defense in depth even
   though `assert_staff_in_clinic` raises without staff context).

### Stage 2 — Restricted records (staff-as-patients / VIP)

5. **Migration:** `patients.restricted BOOLEAN DEFAULT FALSE` (set by admin, or on
   patient request). Chart opens for a restricted patient require break-the-glass for
   everyone EXCEPT staff with an open encounter with that patient today.
6. **Break-the-glass mechanic (shared component, reused in Stage 3):** one tap on
   "Open restricted record" (optional one-line reason), immediate access, log row
   flagged `glass=true`, prominent in the in-charge digest. NO approval loop. Target: ≤2
   seconds added, only on restricted charts.
7. **Queue display hygiene:** wall-facing/shared queue surfaces show today's number +
   first name only (coordinate with WP2's number work).

### Stage 3 — Program sensitivity (HIV/TB)

8. **Migration:** sensitivity flag on program registry rows (088 tables) and propagation
   to linked artifacts — prescriptions/dispense/timeline entries for program medications
   (ART, TB regimens; catalog-driven list) carry `sensitive=true`.
9. **Uniform "Program records" chart section** on every patient chart (web + Android):
   collapsed by default for staff NOT involved in that patient's care today and without
   the program capability; opens via the Stage-2 glass tap; identical rendering whether
   empty or populated (rule: the curtain must not disclose).
10. **Shared-surface masking:** orders lists, pharmacy done-today, billing lines render
    "program medication" instead of drug names outside the dispensing worksheet
    context. The dispenser actively dispensing sees full detail (care involvement).
11. **Clinical-safety escape:** treating clinician (open encounter today) sees program
    data inline with zero friction — never wall off ART status from the person
    prescribing (interactions, OI differentials).

### Stage 4 — Capability config

12. **Migration:** per-clinic capability grants. Minimum viable:
    `clinics.workflow_config.dispensing_roles TEXT[]` (default
    `['admin','dispenser']`) consumed by ONE central SQL helper (refactor
    `pharmacy_resolve_dispenser_staff_id` + the dispense-gate checks in 064/077/083/
    087/089 to call it). Add `program_access` capability (ART/TB focal person) consumed
    by Stage 3. Web nav/page guards and Android role routing read the same config.
    **Supersedes the unmerged 093 migration — do not merge that branch's SQL.**
13. Admin UI: clinic in-charge edits dispensing roles + program-access grants on the
    staff management page.

### Stage 5 — Role hygiene (fold into above PRs where files are touched)

14. Consolidate duplicated role Sets to import from `staff-roles.ts`
    (`note-actions.ts`, `vitals-actions.ts`, inpatient/ANC pages); resolve
    `records_officer` nav-vs-action mismatches per decision 1 (they get audited reads;
    they keep NOT having note-writing/dispensing).
15. Clerk webhook fallback: `org:member` without an invitation row → `clinical_officer`
    or explicit failure — never `doctor`.
16. Update 009 RLS policies still naming `doctor` to match current role reality (or
    document them as dormant with a pointer here).

## Acceptance

- Opening any chart writes exactly one access-log row per staff/day; in-charge digest
  renders; a staff-patient can list who viewed them.
- A restricted patient's chart demands one glass tap (visibly logged) from everyone
  except today's treating clinician.
- The Programs section looks identical on charts with and without HIV/TB data until
  opened; treating clinician sees contents inline with no tap.
- A clinic with `dispensing_roles=['admin','dispenser','nurse']` lets a nurse dispense
  end-to-end (web + Android) with `dispense_records.dispensed_by` recording who; a
  clinic on defaults behaves exactly as today.
- Search → tap → chart on a normal patient remains unchanged: zero added clicks.
