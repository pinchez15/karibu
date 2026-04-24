# Karibu Health

A clinical documentation system for low-resource health centres in Uganda. Clinicians dictate a brief summary after each patient visit; an AI assistant turns the dictation into a structured SOAP note with diagnosis suggestions and citations; the patient walks out with a printed receipt.

## Product Shape

The product is built around two surfaces:

- **Android tablet (apps/android)** — what nurses use day to day. Offline-first via Room + WorkManager. After the patient leaves, the clinician taps the visit, dictates 1-3 minutes into the phone, and watches the AI structure the note.
- **Web dashboard (apps/web)** — for desktop staff and admins: queue management, visit review + edit + approve, payment recording, printed-receipt rendering, and HMIS 105 reporting (which is what the diocese uses to report to the Ministry of Health and unlock subsidies).

### Core flow

1. Patient arrives at the clinic. Receptionist (or any staff) checks them in via the Queue (web or Android).
2. Nurse calls the patient and conducts the visit face-to-face — no app involvement during the consultation.
3. After the patient leaves, nurse opens the visit on Android and dictates a 1-3 minute summary.
4. Inngest workflow turns the dictation into a SOAP note + patient summary, suggests likely diagnoses with citations, drafts follow-up instructions.
5. Nurse reviews + edits + approves on the web dashboard.
6. Web dashboard renders the patient receipt for the clinic's 58mm thermal printer.
7. Patient walks out with the receipt. Done.

The patient never touches the app — the printed receipt is the entire patient-facing surface.

## Project Structure

```
karibu-health/
├── apps/
│   ├── android/         # Kotlin clinician app (offline-first dictation)
│   └── web/             # Next.js dashboard (review, print, admin, HMIS)
├── packages/
│   ├── shared/          # Shared TS types + constants
│   └── supabase/        # Database migrations + edge functions
└── docs/                # Architecture, legal compliance, design docs
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Android app | Kotlin, Compose, Room, Hilt, WorkManager |
| Web app | Next.js 16, React, Tailwind |
| Database | Supabase (Postgres) |
| Auth | Clerk (Android SDK + Next.js) |
| Edge functions | Supabase (Deno) — `dictate`, `generate-notes` |
| Background jobs | Inngest (note structuring workflow, scheduled tasks) |
| AI | OpenAI Whisper (dictation transcription), OpenAI healthcare model (SOAP + citations) |
| Receipt printer | 58mm thermal via browser print dialog |

## Prerequisites

- Node.js 20+
- pnpm 10+ (`corepack enable && corepack prepare pnpm@10.18.0 --activate`)
- Supabase CLI
- Android Studio (for Android development)
- Inngest CLI for local dev (optional)

## Setup

```bash
corepack enable
corepack prepare pnpm@10.18.0 --activate
pnpm install
```

### Supabase

```bash
cd packages/supabase
supabase link --project-ref your-project-ref
supabase db push
```

### Clerk

Create a Clerk app, enable email/password sign-in, create a JWT template named `supabase` with your Supabase JWT secret, drop the keys into `.env`.

### OpenAI

API key with access to Whisper + the healthcare model goes into `.env` as `OPENAI_API_KEY`.

### Edge functions

```bash
cd packages/supabase
supabase functions deploy dictate
supabase functions deploy generate-notes
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set CLERK_ISSUER=https://clerk.karibu.health
```

## Development

```bash
pnpm web                     # Next.js dashboard at localhost:3000
pnpm android:build           # Build the debug APK
pnpm android:test            # Run Android unit tests
```

## Deployment

- **Web** ships to Vercel.
- **Android** is distributed as a signed APK to clinic-managed devices.
- **Edge functions** ship via `supabase functions deploy`.

## License

Proprietary — Karibu Health
