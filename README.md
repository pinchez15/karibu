# Karibu Health

A patient-centered electronic health record for low-resource health centres in Uganda, built for the realities of a Health Centre III: intermittent power and connectivity, shared devices, one clinician wearing many hats, and Ministry of Health reporting that unlocks the facility's subsidies.

Clinicians work on an offline-first Android tablet; desktop staff (lab, pharmacy, admin) work on a web dashboard backed by the same Supabase database. An AI assistant acts as a colleague, not a ghostwriter — it reviews notes against Ugandan clinical guidelines and surfaces disagreements with citations, helps draft, and answers consults on a redacted case bundle. The clinician retains medical authority on every decision. The patient's entire digital footprint is a printed 58mm receipt.

The monorepo contains **two separate products**:

- **Karibu EHR** — the clinical record system, in pilot at a diocesan Health Centre III in Uganda.
- **Karibu Learn** — a free, standalone CME app for Ugandan clinicians (coral learning shell over a simulated EHR chart). Different auth, different database, not reachable from the EHR; it lives here only so Learn can mirror the EHR chart UX.

## Clinical scope (EHR)

| Area | What it covers |
|------|----------------|
| OPD | Registration with duplicate detection, day-line check-in, triage/vitals, visit charting, worklists |
| Clinical notes | Typed or dictated provider notes with a full lifecycle (draft → sign → amend/addend/cosign/void), autosave, finalize-encounter |
| Lab | Order entry from the chart, per-test lab bench, results with abnormal-flag routing back to the ordering clinician |
| Pharmacy | Structured prescription orders (queued on **order submit**, not note finalization), per-line dispense worksheet, batches, offline dispense with local stock decrement, send-back-to-clinician loop |
| Inpatient (HC III ward) | Admissions, ward census and rounds, observations with overdue alerts, treatment chart, IV infusions, maternity (delivery record, newborn, postnatal), discharge/outcome, handover notes |
| ANC | Pregnancy registry and WHO-contact protocol tracker |
| HIV/TB | HTS events, HIV care, viral load, TB episodes — HMIS 106a registers |
| Outbreak | Ebola/VHF interruptive screening alert, wired end-to-end |
| Billing & payments | Payment recording decoupled from clinical closure, receipts on a 58mm thermal printer |
| Referrals & care tasks | Urgent referral prominence, create/complete care-task loops across web and Android |
| Reporting | **HMIS 105** (the report the diocese files with the Ministry of Health to unlock subsidies) and HMIS 106a; chart access log |
| AI clinical assist | Dictation (Whisper), draft/lab AI assist, guideline-conflict review with citations, and Consult (double-confirmed, redacted bundle to a frontier model, one thread per visit) |

## Architecture

```
karibu-health/
├── apps/
│   ├── android/         # Kotlin EHR clinician app — offline-first (Room + WorkManager outbox)
│   ├── web/             # Next.js dashboard — OPD, lab, pharmacy, inpatient, admin, HMIS reports
│   ├── learn-android/   # Karibu Learn (standalone CME app)
│   └── learn-web/       # Learn content extraction / web surface
├── packages/
│   ├── shared/          # Shared TS types + constants
│   ├── supabase/        # Migrations, SECURITY DEFINER RPCs, edge functions, SQL tests
│   ├── design-system/   # Tokens + primitives shared across surfaces
│   ├── clinical-ui/     # Chart UI shared by EHR web and Learn's simulated chart
│   ├── content-schema/  # Learn case-pack schema
│   ├── learn-supabase/  # Learn's own database + pack publishing pipeline
│   └── ai-evals/        # Evals for the AI clinical-assist prompts
└── docs/                # Authoritative implementation guides (see below)
```

### Principles that shape the code

- **Offline-first on Android, online-only on web.** Every Android write lands in Room and reaches the server either by a direct RPC (when connected) or through the `sync_queue` outbox, drained by WorkManager with dependency ordering, retry classification, and per-run telemetry. Never design around a clinic's accidental wifi.
- **All writes go through SECURITY DEFINER RPCs** — Clerk JWTs don't work with `auth.uid()`, so RPCs assert staff/clinic membership themselves. Replays are deduplicated via a `sync_operations` client-op ledger and client-supplied ids. No direct PostgREST inserts from Android (CI-enforced).
- **Web server actions use the service-role client** and must scope every mutation by `staff.clinic_id` — RLS is bypassed there by design.
- **Payment is decoupled from clinical closure.** Pharmacy queues on order submit. Uses "visits", not "encounters".
- **AI is a colleague.** It flags guideline conflicts with citations and drafts on request; it never rewrites or auto-signs a note.

## Tech stack

| Component | Technology |
|-----------|------------|
| Android apps | Kotlin, Jetpack Compose, Room, Hilt, WorkManager |
| Web app | Next.js 16, React, Tailwind |
| Database | Supabase (Postgres), SECURITY DEFINER RPC layer, RLS |
| Auth | Clerk (Android SDK + Next.js); Learn has its own auth realm |
| Edge functions | Supabase (Deno): `dictate`, `consult-chat`, `request-draft-ai-assist`, `request-lab-ai-assist` (+ legacy dictation review trio) |
| Background jobs | Inngest — durable note-structuring and review workflows |
| AI | OpenAI Whisper (dictation) + healthcare model (guideline review, drafts, consult); evals in `packages/ai-evals` |
| Receipts | 58mm thermal printer via the browser print dialog and Android setup wizard |
| Distribution | Web on Vercel; Android via Firebase App Distribution (`apps/android/scripts/upload-beta.sh`) |

## Getting started

Prerequisites: Node 20+, pnpm 10 (`corepack enable && corepack prepare pnpm@10.18.0 --activate`), Supabase CLI, Android Studio (its bundled JBR is the expected `JAVA_HOME` for Gradle).

```bash
pnpm install

# Database
cd packages/supabase
supabase link --project-ref <your-project-ref>
supabase db push

# Edge functions
supabase functions deploy dictate consult-chat request-draft-ai-assist request-lab-ai-assist
supabase secrets set OPENAI_API_KEY=... CLERK_ISSUER=... INNGEST_EVENT_KEY=...
```

Auth: create a Clerk app, enable email/password, add a JWT template named `supabase` with your Supabase JWT secret, and put the keys in `.env`. Key env vars: `OPENAI_API_KEY`, `CLERK_PUBLISHABLE_KEY`/`CLERK_SECRET_KEY`/`CLERK_WEBHOOK_SECRET`/`CLERK_ISSUER`, `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SECRET_KEY`, `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY`, `POSTHOG_KEY`/`POSTHOG_HOST`.

## Development

```bash
pnpm web                  # Next.js dashboard at localhost:3000
pnpm android:build        # Debug APK
pnpm android:test         # Android unit tests
pnpm build                # Typecheck shared libraries
pnpm ai:eval              # Run AI clinical-assist evals

# Karibu Learn
pnpm learn-android:build
pnpm learn:export-packs && pnpm learn:publish-packs

# SQL regression tests (against a local `supabase db reset` database)
psql "$DATABASE_URL" -f packages/supabase/tests/rpc_idempotency.sql
```

CI runs the web build and Android unit tests (`.github/workflows/`), plus audit scripts that block direct PostgREST writes from Android.

## Documentation map

Read these end-to-end before touching the corresponding area — they are authoritative and supersede older plans:

- `docs/ehr-pivot-implementation.md` — the EHR architecture: sync contract, RPC + idempotency rules, role homes, locked decisions.
- `docs/ai-clinical-assist.md` — AI notes and Consult.
- `docs/karibu-learn/product-boundary.md` + `docs/karibu-learn/vision.md` — the EHR/Learn separation.
- `docs/patient-centered-architecture-plan.md` — the long-term direction: the patient is the durable record; visits are optional.
- `docs/workplans/` — dated, agent-runnable work packages with tests (current: `2026-07-09-sync-drain/`, the offline-sync reliability program).
- `docs/architecture/adr-0001-per-subdomain-apps.md` — the per-subdomain app split.

## Status

In pilot at a Health Centre III in Uganda (Android beta 1.0.31). Current engineering focus: the sync-drain program (`docs/workplans/2026-07-09-sync-drain/`) — making the offline outbox drain to zero on connectivity so ward and lab staff see Android-entered data on the web within seconds.

## License

Proprietary — Karibu Health
