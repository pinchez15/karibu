# Karibu Health — Product Spec

> Status: current as of 2026-05-12. This replaces the pre-pivot PRD, which is archived at `docs/archive/PRD_pre_dictation_pivot.md` and is no longer authoritative. Read this file as the source of truth for product shape today; cross-reference plans in `docs/` for direction in flight.

## What it is

Clinical documentation and patient-flow software for HC III-level health centres in Uganda. After each patient visit the clinician types or dictates a brief note. An AI assistant works as a peer — it reviews the note against Ugandan clinical guidelines and surfaces possible disagreements with citations, drafts a plain-language patient receipt, and suggests an HMIS diagnosis code. The clinician retains medical authority on every decision. The patient walks out with a printed receipt.

## Who it's for

- **Clinicians** — Clinical Officers, Nurses, Midwives, Nursing Assistants. Work on a single shared Android phone per role, often with intermittent connectivity.
- **Records Officers** — run reception, registration, and check-in.
- **Lab attendants, Dispensers, Cashiers** — stationary desks at busier facilities, often default to web.
- **Clinic admins** — review, payment reconciliation, HMIS 105 reporting, user management.

## Surfaces

- **Android** (`apps/android`) — primary surface for clinical work. Offline-first via Room + WorkManager. Kotlin + Jetpack Compose.
- **Web dashboard** (`apps/web`) — Next.js 16. Operational and administrative surface: queue management, visit review/edit/approve, payment recording, printed-receipt rendering, HMIS 105 reporting, role-based worklists.

## Core flow

1. Records Officer registers or looks up the patient and checks them into the right department (OPD / ANC / Maternity / Family Planning / Immunization).
2. Clinician conducts the visit face-to-face. No app during the consultation.
3. After the patient leaves, the clinician opens the visit on Android and types or dictates a brief note.
4. Save persists the note locally; Android syncs to Supabase when online.
5. (Opt-in) "Structure with AI" — Inngest workflow runs three independent handlers: review the note against Uganda guidelines, draft a patient receipt, suggest an HMIS code. AI surfaces questions only when it would disagree with high confidence against retrieved evidence.
6. Receipt prints from the web dashboard to a 58mm thermal printer.
7. Payment recorded; HMIS 105 line items accumulate for the monthly Ministry of Health report (unlocks diocesan subsidies).

The patient never touches the app — the printed receipt is the entire patient-facing surface.

## Non-negotiables

- **Clinician retains medical authority.** AI never rewrites the note. It asks questions with corpus citations; the clinician dismisses, considers, or reopens.
- **Offline-first on Android.** Every clinical write goes to local Room first, then a sync queue with dependency ordering.
- **HMIS 105 reporting stays.** The diocese reports to the Ministry of Health monthly; subsidies depend on it. Migrations 013 + 014 implement the line-item mapping.
- **No audio retention.** Whisper transcription runs through the stateless `dictate` edge function; audio never lands in the database and no per-patient consent is required. Finalised in migration 023.
- **Typing and dictation are equal.** The clinician picks the input that fits their workflow. Neither is "the right way."

## Tech stack

| Component | Technology |
|---|---|
| Android | Kotlin, Jetpack Compose, Room, Hilt, WorkManager |
| Web | Next.js 16 (App Router), React, Tailwind |
| Database | Supabase (Postgres + pgvector for AI retrieval) |
| Auth | Clerk (Android SDK + Next.js middleware) |
| Edge functions | Supabase (Deno) — `dictate`, `submit-dictation`, `approve-dictation`, `reject-dictation` |
| Background jobs | Inngest — note-review, patient-receipt, HMIS-code workflows + a 1-minute polling fallback |
| AI | OpenAI Whisper (dictation), GPT (note review, receipt drafting, HMIS suggestion) |
| Receipt printer | 58mm thermal via browser print dialog |
| Analytics | PostHog |

## Data model (today)

`patients → visits` is the core relationship. Notes, vitals, payments, lab/pharmacy state all hang off `visits` today. The architecture is moving toward patient-first records — see `docs/patient-centered-architecture-plan.md` for the target shape. `patient_vitals` (migration 029) is already patient-first.

Visit status state machine: `pending → review → sent → completed`, plus `error`. A parallel `queue_status` (`waiting → with_nurse → ready_for_doctor → with_doctor → completed | cancelled`) handles intake routing independently.

Migrations live in `packages/supabase/migrations/` — sequential, additive. Key landmarks: 023 (dictation-only pivot, dropped audio/consent infrastructure), 024 (HC III roles + departments), 029 (offline-first foundation: sync_queue, SECURITY DEFINER write RPCs, patient_vitals table), 032–033 (AI as augmentation, then AI as colleague-with-citations). Head: 037.

## What's in flight

- **Patient-centered architecture shift** — `docs/patient-centered-architecture-plan.md`. Patient becomes the durable record; visits become one kind of operational event. DOB precision (exact / year_only / age_estimate / unknown). Patient-only notes. Worklists replace forced queue flow.
- **HC III multi-role rollout** — `docs/hc3-rollout-plan.md`. Records Officer / Lab / Pharmacy / Cashier role-specific home screens, mirrored on Android and web.
- **Android sync engine fix** — known defect in `SyncEngine.kt:99-128` (success-branch payload propagation missing). Lands as part of the patient-centered work in Phase 6.

## Reference

- `README.md` — setup and dev commands
- `docs/offline-first-refactor.md` — offline-first architecture spec (largely shipped in migrations 029–033)
- `docs/patient-centered-architecture-plan.md` — long-term architecture target
- `docs/hc3-rollout-plan.md` — role-based UI rollout plan
- `docs/susunga-hc3-patient-flow.md` — reference patient-flow diagrams
- `docs/STYLING_PRD.md` — design system
- `docs/SUPABASE_SETUP.md` — Supabase realtime + edge function deploy
- `docs/KARIBU_LEGAL_COMPLIANCE_REPORT.md` — Uganda DPPA + HIPAA assessment (Feb 2026, pre-pivot)
- `CLAUDE.md` — agent skill routing for this repo
