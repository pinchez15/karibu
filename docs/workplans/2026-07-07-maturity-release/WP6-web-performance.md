# WP6 — Web performance to sub-2s

**Priority:** P1, **step 0 immediately** · **Platform:** web
**Theme:** No single villain — compounding waterfalls, heavy RPCs, `force-dynamic`
blocking TTFB, and a 60s auto-refresh that re-runs whole server renders. Target: every
dashboard page interactive in <2s on clinic connectivity. The platform contract makes
web performance a product feature (web = the visibly superior desk experience).

**Current pain:** 5–6s loads reported. Likely worst pages (static analysis ranking):
`/dashboard/worklists`, `/dashboard/opd`, `/dashboard/billing`, `/dashboard/visits/[id]`,
`/dashboard/pharmacy`, `/dashboard/patients/[id]`, `/dashboard/lab`.

---

## Step 0 — Measure first (do this before ANY fix)

1. Add Server-Timing headers (or structured timing logs to Sentry/PostHog) around the
   named heavy loaders: `getAllWorklists`, `getVisitDetails`, `listPatientBalances`,
   `getQueueData`, `pharmacy-data` queue load, patient detail loaders. Sentry exists
   (10% traces, no custom spans); add spans. Every subsequent PR in this WP must show
   before/after numbers.

   **Implemented (Step 0):** `apps/web/src/lib/server-timing.ts` — `measureServerLoader`
   wraps each loader with a Sentry span (`op: web.loader`) when `NEXT_PUBLIC_SENTRY_DSN`
   is set, and logs `[perf] loader.* <ms>` to the dev server console. Span names are in
   `PERF_LOADER` (e.g. `loader.worklists.getAllWorklists`). In Sentry: Performance →
   Transactions for the route → child spans. Locally: `pnpm web`, load a hot page, read
   terminal output.

## Wave 1 — Cheap, high-impact (each is a small PR)

2. **Kill the SQL N+1 in worklist RPCs (one migration, speeds up 7 RPCs).** Every
   worklist RPC calls `patient_age_years(p.id)` per row (e.g. 041 ~L256–276), which
   re-queries `patients` per call (fn defined 038 ~L112–123) despite `patients` being
   joined. Replace with an inline age expression over the joined row (or an
   `IMMUTABLE`/inlined variant taking the date columns as args).
3. **Visit detail parallelization + column narrowing.** `getVisitDetails`
   (`visits/[id]/page.tsx` ~L11–156): `ai_review_suggestions` then
   `visit_critical_alerts` then payments/addendums run sequentially — batch into
   `Promise.all`. Replace `visits.select('*')` + nested `provider_notes(*)`,
   `patient_notes(*)` with explicit column lists actually consumed by
   `VisitDetailClient`.
4. **Patient detail dedupe.** `patients/[id]/page.tsx` ~L35–39: three parallel actions
   each independently call `getStaff()` + `loadPatientForStaff()` = 3× patient row
   reads. Wrap the patient loader in React `cache()` (pattern already used for
   `getStaff`, `auth.ts` ~L17–37); pass `clinic_id` down. Reduce initial timeline 50→20
   (cursor pagination already supported).
5. **Billing indexes.** `rpc_billing_patient_balances` (076 ~L312–353) aggregates all
   clinic charges+payments with no composite indexes:
   `CREATE INDEX idx_charges_clinic_patient ON charges(clinic_id, patient_id) WHERE NOT voided;`
   `CREATE INDEX idx_payments_clinic_patient ON payments(clinic_id, patient_id) WHERE status='paid';`
6. **OPD page overfetch.** `getOutOfStock` reads BOTH stock tables unbounded
   (`opd/page.tsx` ~L19–29) → push predicate to SQL (`quantity_on_hand <= 0 OR
   is_unavailable`) + LIMIT 50. `getVisitsToday` uses `select('*')` for a count
   (~L114–118) → `select('id', { count: 'exact', head: true })`.

## Wave 2 — Streaming & rendering

7. **`loading.tsx` + Suspense on hot routes.** Only 6 loading files exist; none for
   `visits/[id]`, `opd`, `worklists`. Add skeletons; wrap slow panels (worklist cards,
   OPD rounds/out-of-stock/calendar, billing paid-up section) in per-panel `Suspense`
   so the shell streams while RPCs finish.
8. **Scope `force-dynamic`.** Root `app/layout.tsx` L42 forces every route fully
   dynamic; combined with the dashboard layout blocking on auth+staff+clinic-name, TTFB
   waits for everything. Move `force-dynamic` off the root to the authed segments that
   need it; render the sidebar shell with cached clinic name and stream `{children}`.
9. **Consolidate worklists round trips:** single `rpc_worklist_all(clinic_id)` returning
   JSON buckets (replaces 7 parallel RPCs), or keep 7 but stream each card
   independently. Prefer the single RPC — it also helps Android's worklist screen.
10. **Pharmacy queue RPC:** replace the 3-step sequential load in `pharmacy-data.ts`
    (~L62–150: visits → prescription_orders → dispense_records) with one
    `rpc_pharmacy_station_queue(clinic_id, tab)`.

## Wave 3 — Client & polish

11. **Dynamic-import heavy client panels** on visit/patient detail (`DiagnosisCoder`,
    pharmacy/lab panels, note lifecycle modals) — `ClinicCalendar` already shows the
    pattern (`next/dynamic` for FullCalendar).
12. **Tame the auto-refresh multiplier.** `use-realtime-refresh.ts` (~L14–37) runs
    `router.refresh()` every 60s on visible tabs of every heavy page — slow pages reload
    slowly forever. After Waves 1–2 land, re-evaluate: lengthen to 120–180s, debounce,
    and rely more on the broadcast channel; consider client-side refetch of list data
    only instead of full SSR refresh.
13. **Calendar window:** dashboard home loads 104 days of appointments
    (`dashboard/page.tsx` ~L12–15) → match the visible range (~42 days), lazy-fetch on
    `datesSet` (client action exists).
14. Narrow `getStaff` `select('*')` (`auth.ts` ~L26–28) to needed columns.

## Non-goals

- No caching of clinical data with TTLs that could show stale queue state beyond the
  existing refresh cadence without explicit product sign-off.
- No edge runtime experiments (Supabase/Clerk SDKs need Node — see workspace rules).

## Acceptance

- Server-Timing evidence: p75 TTFB <1s and page interactive <2s on the seven listed
  pages against production-scale data (≥5k patients, ≥100 visits/day history).
- Worklists page total DB time reduced ≥50% from baseline (age-fn fix + consolidation).
- No functional regressions on the queue surfaces (manual QA scripts in
  `docs/ehr-pivot-qa.md`).
