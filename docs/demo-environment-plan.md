# KaribuEHR demo environment (sandbox)

> **Status:** Plan — approved direction, not yet built.
> **Purpose:** A PHI-free, resettable clone of production KaribuEHR for recording
> training and investor videos, and for live demos.
> **Audience:** Engineers and AI agents standing this up.

## 1. Goals and principles

- **Zero PHI.** Every patient, staff member, and clinic in the demo environment is
  fictional. Nothing recorded on video can leak real data because none exists there.
- **Same code, different backend.** No "demo mode" flag in web or Android. The demo
  environment is the production apps pointed at a separate backend. This is what keeps
  the demo close to production without ongoing effort.
- **Reset to baseline in one command**, safe to run between takes.
- **Close to production, not lockstep.** Demo schema = whatever migrations have been
  applied. Catching up is `supabase db push`. Lagging a few migrations before a
  recording session is fine.
- **Live AI.** All data is synthetic, so dictation, structuring, AI notes, and Consult
  run against real OpenAI/Inngest with demo-scoped keys. Recording the real AI pipeline
  is the honest demo.

## 2. Environment topology

**Scope decision (2026-07-13): web-only.** The demo audience is investors and
guest users on desktops or iPhones (mobile Safari). The Android app is **not**
part of the demo environment — which means the demo touches **zero production
code** (the previously planned Android `demo` build flavor is dropped; it can be
revived later if Android demos are ever needed).

| Component | Production | Demo |
|---|---|---|
| Supabase | `sopirdewhhpxdxpwwosn` | New project **`karibu-demo`** (own ref) |
| Clerk | `clerk.karibu.health` (live instance) | Second Clerk application, **production-type instance on the free plan** ($0; avoids the "development mode" badge in front of guests), attached to the demo subdomain |
| Web | Vercel prod project | Second Vercel project, e.g. `demo.karibu.health` (fits ADR-0001 per-subdomain apps) |
| Android | `com.karibuhealth.app` | **Out of scope** (web-only demo) |
| Edge functions | deployed to prod ref | Same `packages/supabase/functions/` deployed to demo ref with demo secrets |
| Inngest | app `karibu-health` | Separate Inngest app/env `karibu-demo` (served by the demo Vercel deployment) |
| OpenAI | prod key | Separate key (cost visibility; no PHI either way) |
| PostHog | prod key | Separate project or omit |

**Not** the Learn Supabase project (`zvandlyuhhovvqovutyq`) — Learn and EHR stay
separate per `docs/karibu-learn/product-boundary.md`. The demo EHR is a third project.

### 2.1 Clerk demo accounts and guest access

**Core accounts:** one per role, created up front with memorable fictional names
(e.g. "Dr. Amina Ssebunya") and shared, publishable credentials:

records officer · nursing assistant · nurse · clinical officer (primary presenter
account) · lab tech · dispenser · admin · superadmin.

Staff rows sync via the Clerk organization webhook / invitation flow (same as prod).
Set `SUPERADMIN_BOOTSTRAP_EMAIL` to the demo admin. Edge functions get the demo
instance's `CLERK_ISSUER`.

### 2.2 Guests (investors, school leads, event audiences)

**Guests:** create individual Clerk users
in the dashboard or run the in-app staff-invitation flow — the latter doubles as a
live demo moment. Guests keep their logins across resets (reset never touches
`staff`/`clinics`); everything they enter is wiped nightly. New staff are normally
gated by required onboarding (migration 079) before they can register patients — the
demo reset unlocks onboarding for all staff, so guests chart immediately; demo the
onboarding flow from a deliberately fresh account instead.

### 2.3 Domain and DNS (provisioned 2026-07-14)

- Vercel project **`karibu-demo`** exists (scope `nate-cappaworkcos-projects`,
  root directory `apps/web`, framework Next.js) with **`demo.karibu.health`**
  attached. Remaining Vercel setup: connect the git repo + demo env vars.
- DNS for `karibu.health` is at **Namecheap** (registrar-servers nameservers),
  so records are added there, not in Vercel:
  - For the site: `CNAME` host `demo` → `cname.vercel-dns.com`
    (Vercel's `A demo 76.76.21.21` also works; CNAME is the standard for subdomains).
- The demo Clerk application (production-type instance, home URL
  `https://demo.karibu.health`) will require its own DNS records under the
  subdomain during setup — Clerk's dashboard lists the exact values; in
  Namecheap they appear as hosts like `clerk.demo`, `accounts.demo`,
  `clkmail.demo`, and two `…_domainkey.demo` DKIM CNAMEs.

## 3. Schema strategy: consolidated baseline (replaces replaying 001–105)

The migration chain contains done/undone work (`magic_links` created in 001, dropped
in 020; queue-as-spine logic superseded by the EHR pivot; `cme_*` tables from 049 whose
product was withdrawn) and dozens of `CREATE OR REPLACE` self-corrections. The demo
project should **not** replay this history, and the repo shouldn't keep it as the
source of truth either.

### 3.1 Derive the baseline mechanically — do not hand-rewrite

**Implemented in `packages/supabase-demo/`** (see its README for the runbook).

Hand-rewriting 105 interdependent files into "clean" SQL would drift from the real end
state (the current definition of any object is whichever migration touched it last).
Instead, take the **actual end state**: a schema-only dump of the production database
(`scripts/build-baseline.sh` — uses `supabase db dump` via Docker, or native `pg_dump`
via `brew install libpq`). Dumping prod directly is strictly better than replaying the
chain through a shadow DB: it captures any SQL-editor drift by construction, and needs
no local Postgres. Schema only — no table data ever leaves prod.

The baseline lands as `packages/supabase-demo/migrations/0001_baseline.sql` and is
applied to the demo project by `pnpm demo:baseline`, which also records versions
001–105 in the demo project's migration history — so future `supabase db push
--db-url $DEMO_DB_URL` from `packages/supabase` applies **only new migrations**.
The production chain in `packages/supabase/migrations/` stays untouched and remains
the single place new migrations are authored; nothing is duplicated.

(Optionally, prod itself can later adopt the same consolidated baseline via
`supabase migration squash` + `migration repair` — a repo-hygiene move, independent
of the demo environment.)

### 3.2 Reference data that must survive the consolidation

Most `INSERT INTO` hits in the migrations are inside RPC function bodies (schema, not
data). The true reference-data carriers are **extracted from the repo's own migration
files** by `packages/supabase-demo/scripts/build-reference-seed.sh` — no database
access, zero PHI by construction (a prod data dump is never taken; the CLI's
`--data-only` mode only supports exclude-lists, which would be a fragile PHI denylist):

| Migration | Data | Lands in |
|---|---|---|
| 003, 036 | storage buckets + policies | `seed/00_storage_buckets.sql` (hand-mirrored) |
| 064, 080 | `medication_catalog` (base + enriched upsert) | `seed/10_reference_data.sql` |
| 069, 088 | `lab_test_catalog` (incl. HIV/TB additions) | `seed/10_reference_data.sql` |
| 076 | catalog price `UPDATE`s | `seed/10_reference_data.sql` |
| 013, 088 | `hmis_diagnosis_codes`, `hmis_106a_elements` | `seed/10_reference_data.sql` |
| 048 | `clinical_protocol_definitions` (ebola/cholera) | `seed/10_reference_data.sql` |
| 033, 076, 080 | per-clinic backfills (`clinic_lab_capabilities`, formulary, billing rates) — `SELECT … FROM clinics`, so they run **after** the census creates the demo clinic | `seed/30_clinic_backfill.sql` |

New reference data added by future migrations does **not** need re-extraction —
future migrations are applied to prod and demo alike.

### 3.3 Old demo seeds leave the migration chain

`004_seed_demo_clinic.sql`, `012_seed_demo_data.sql`, `014_seed_hmis_demo_data.sql` are
demo content, not schema — they drop out of `migrations/` entirely and are superseded by
the generator in §4. (They can't be reused verbatim anyway: 012 inserts into
`magic_links`, which no longer exists in the post-020 schema.)

### 3.4 Cleaning dead architecture — separately, after the squash

The baseline must equal prod's end state **including** legacy objects, or demo diverges
and future migrations break. Dropping genuinely dead objects (`cme_*` tables, retired
queue columns once the pivot fully lands) happens as a normal **new migration** applied
to both prod and demo — never by editing the baseline.

## 4. Seed content: Learn canonical cases → EHR rows

### 4.1 Source

Use the pipeline's canonical case corpus —
`content/learn/generated/hc3-core-draft-v0.1.0/cases/*.json` (100 cases, Ugandan
guideline-derived) — **not** the on-device `.kpack` files (those carry only a 4-field
patient plus narrative chart fragments). Each canonical case has a `clinicalTruth`
block that maps nearly 1:1 onto EHR rows:

| Canonical case field | EHR target |
|---|---|
| `simulatedPatient` (age, sex) + invented name/village from a names table | `patients` |
| `clinicalTruth.vitals` | `patient_vitals` |
| `chiefComplaint`, `history`, `examFindings` | `visits.chief_complaint` + `provider_notes` transcript / `structured_data` |
| `availableTests` | `visits.tests_ordered` + `lab_test_results` JSONB (075 shape) |
| `medicines` + `guidelineActions` | `prescription_orders` (064 structured pharmacy) |
| `diagnosis` | `visits.diagnosis` + `visit_diagnosis_codes` (HMIS) |
| `followUp` | `visits.follow_up_instructions` |

### 4.2 Generator

`scripts/demo-seed/` (TypeScript, reuses `@karibu/shared` types):

- Reads ~25 selected canonical cases + a hand-written Ugandan names/villages table
  (generated names are generic — "Simulated child patient"; the authored packs'
  "Nakato Sarah" style is the model).
- **Emits idempotent SQL with fixed UUIDs** (the migration-012 pattern). Baseline data
  is inserted with the service role; live demo actions during recording go through the
  real apps and real RPCs.
- **All dates relative** (`NOW() - INTERVAL '…'`, `CURRENT_DATE`) so every reseed
  produces a believable "today". Never hardcode dates.
- Case selection favors demo beats: malaria RDT (golden path), child diarrhoea/ORS,
  ANC hypertension, TB screen, HIV/ART side effects, asthma, chest-pain referral.

### 4.3 Baseline census (what must exist so every screen looks alive)

- **Clinic identity:** clearly fictional facility — e.g. "St. Monica HC III, Kayonza"
  (real district style, invented name; nothing implying SSUNGA). `receipt_prefix`,
  letterhead, billing rates, print settings all set so printed output looks finished.
- **3–5 longitudinal patients** with 3–6 historical visits (chronic hypertension, HIV
  on ART, an ANC series with `pregnancies` + `anc_contacts`) — makes the chart/timeline
  demo sing.
- **Today's OPD board:** one patient parked in *each* workflow state — waiting, needs
  vitals, with clinician (draft note), awaiting labs, at pharmacy, ready to bill, done —
  so worklists, role homes, and OPD filters are populated the moment recording starts.
- **Pharmacy:** formulary + `pharmacy_stock_items` + FEFO batches (098), including one
  low-stock drug and one near-expiry batch (demo beats: out-of-stock send-back,
  expiring-batches view).
- **Lab:** `clinic_lab_capabilities` + priced catalog; one order pending, one resulted
  abnormal.
- **A month of closed visits** with payments, charges, and HMIS diagnosis codes →
  HMIS 105/106a, cashflow, and monthly summaries render with real-looking numbers
  (clinic-leader and investor material).
- **One active admission** with observations + medication administrations; one
  referral; a few appointments and care tasks.

## 5. Reset to baseline

One command — `pnpm demo:reset` (implemented in
`packages/supabase-demo/scripts/db-run.ts`) — against the demo project only:

1. **Truncate** clinical/operational tables: visits, provider/patient notes, vitals,
   prescription_orders, dispense_records, stock movements + batches + items, payments,
   charges, care_tasks, admissions (+ observations/med admin/IV), pregnancies,
   anc_contacts, HIV/TB registry rows, referrals, appointments,
   `ai_review_suggestions`, `consult_*`, `visit_critical_alerts`, `sync_operations`,
   `audit_logs`, `chart_access_log`, sequences (`patient_number_sequences`,
   `payment_receipt_sequences`). **Keep:** clinics, staff, catalogs, corpus, onboarding
   progress.
2. **Clear storage** (audio-uploads bucket).
3. **Re-run** `seed/reference_data.sql` deltas if needed + the generated demo seed.

Deterministic, runs in seconds, safe between takes. The reset also unlocks
onboarding for any staff created since the last run (see §2.1).

**Nightly reset:** `.github/workflows/demo-reset.yml` runs `pnpm demo:reset` at
00:00 Africa/Kampala (cron `0 21 * * *` UTC) once the `DEMO_DB_URL` repository
secret is configured (it skips quietly until then), and supports manual dispatch
for a pre-presentation reset from a phone.

**Guardrails (hard requirements):**

- The reset script refuses to run unless the target URL contains the demo project ref.
  It takes **no** parameter that could point it at prod.
- Demo service-role key never lands in prod env files and vice versa.

`rpc_admin_purge_clinical_data_before` (084) is *not* the reset tool — it deletes
before a cutoff (keeps recent junk); it remains the prod pre-go-live cleaner.
For mid-scenario snapshots during multi-day recording, `supabase db dump`/restore
works; not needed for v1.

## 6. Demo flow coverage → video library

**Front desk / records:** register patient (approximate age, guardian) · duplicate
detection · search · check-in · edit demographics · appointments.
**Nurse:** vitals entry · critical-vitals interruptive alert · vitals-needed worklist.
**Clinician:** OPD today list + filters · chart/timeline · start encounter · dictate
voice note · AI structuring (pending → review) · review/approve/reject · AI notes on
timeline (draft + lab phase, incorporate) · order labs (`rpc_submit_lab_order`) ·
**send to pharmacy with note still draft** (locked pivot decision — its own video) ·
sign/finalize · addendum/amend/co-sign · Consult · referral.
**Lab tech:** Lab Home · start test · record result (abnormal) · result on clinician
chart · reopen · reagent stock.
**Dispenser:** Pharmacy Home · dispense with FEFO batch pick · stock decrement ·
partial / out-of-stock · send line back to clinician · receive stock + batches ·
expiring batches.
**Billing:** auto-charges (consultation/lab/pharmacy) · patient balance · payment
(cash, MoMo, split, barter, waived) · receipt print · cashflow.
**Print:** visit summary · patient receipt · bill (thermal printer if on hand).
**Offline (differentiator):** airplane mode → register → vitals → dictate → "Saved on
device" → reconnect → outbox drains → "Synced to cloud". *Android-only — cannot be
shown live in the web-only demo environment; cover it with a pre-recorded segment or
as a narrated slide until an Android demo build exists.*
**Inpatient:** admit · ward observations · medication administration · IV checks ·
discharge.
**Programs:** ANC series · HIV/TB registry views.
**Admin/leader:** staff invitations + roles · onboarding modules · inventory/catalog ·
billing rates · workflow config · HMIS 105/106a · monthly summaries.

**Library structure — three tracks + one reel:**

1. **New staff by role** — six short series matching the role homes.
2. **Clinic leaders** — reports, HMIS, billing oversight, inventory, staff management.
3. **Investors/board** — offline resilience, AI assist, HMIS unlocking subsidies.
4. **Highlight reel (~4 min):** one patient end-to-end — feverish child checked in →
   hot vitals → dictated note → AI structures → malaria RDT ordered → positive → AL
   prescribed → dispensed with stock decrement → charges → cash payment → printed
   receipt + summary. The census is designed so this exact path is always one reset
   away.

## 7. Build order

1. **Schema baseline tooling** — ✅ done: `packages/supabase-demo/` (scripts, guarded
   runner, generated reference seeds). Remaining: run `build-baseline.sh` against prod
   (needs Docker or `pg_dump`) and commit `migrations/0001_baseline.sql`.
2. **Provision demo** (½ day): create the demo Supabase project → pin its ref in
   `packages/supabase-demo/demo-project-ref` → `pnpm demo:baseline && pnpm demo:seed`
   → Clerk dev instance + 8 role accounts → deploy edge functions with demo secrets.
3. **Client** (½ day): demo Vercel project (+ Inngest app) · verify login → check-in
   → documentation → AI round-trip · sanity-check key screens in mobile Safari
   (investors will visit on iPhones).
4. **Seed generator** (1½–2 days): Learn-case converter, names table, census, stock,
   reports backfill.
5. **Reset command** (½ day): truncate + bucket clear + reseed, with prod-guard.
6. **Record**: golden-path reel first — it doubles as the acceptance test for the whole
   environment.

## 8. Explicit non-goals

- No Android demo build (web-only, per the 2026-07-13 scope decision) — revive the
  product-flavor approach from this doc's history if Android demos become needed.
- No in-app "demo mode" (flags, fake-data layers) — a second code path that drifts.
- No demo clinic row inside the production database — PHI adjacency on camera, no
  freedom to truncate.
- No reuse of Learn's Supabase project or `.kpack` chart steps as the data source.
- No hand-rewritten "clean" schema — the baseline is derived from the real end state,
  legacy warts included; cleanup is a forward migration (§3.4).

## Related docs

- `docs/ehr-pivot-implementation.md` — write-path invariants (RPC-only writes)
- `docs/karibu-learn-pack-schema.md` + `content/learn/generated/` — seed source corpus
- `docs/karibu-learn/product-boundary.md` — why demo ≠ Learn infrastructure
- `docs/architecture/adr-0001-per-subdomain-apps.md` — subdomain fit for `demo.`
- `packages/supabase/migrations/084_admin_purge_clinical_data.sql` — prod cleaner (not
  the demo reset)
