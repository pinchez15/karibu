# Karibu Health

A clinical documentation system for low-bandwidth environments. Record patient visits, auto-generate dual notes (provider + patient), and deliver summaries via WhatsApp.

## Demo MVP Scope

This initial build validates the core loop:

1. **Doctor records visit** - Offline-capable audio recording
2. **AI generates dual notes** - Transcription + SOAP note + patient-friendly summary
3. **Patient receives summary** - WhatsApp magic link to mobile-friendly page

## Project Structure

```
karibu-health/
├── apps/
│   ├── mobile/          # React Native (Expo) doctor app
│   └── web/             # Next.js patient note viewer
├── packages/
│   ├── shared/          # Shared types and utilities
│   └── supabase/        # Database schema and Edge Functions
└── PRD.md               # Product Requirements Document
```

## Prerequisites

- Node.js 18+
- npm or yarn
- Supabase CLI
- Expo CLI (`npm install -g expo-cli`)
- Android Studio (for Android development)

## Setup

### 1. Clone and Install Dependencies

```bash
cd karibu-health
npm install
```

### 2. Set Up Supabase

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Copy your project URL and keys
3. Install Supabase CLI:
   ```bash
   npm install -g supabase
   ```
4. Link to your project:
   ```bash
   cd packages/supabase
   supabase link --project-ref your-project-ref
   ```
5. Run migrations:
   ```bash
   supabase db push
   ```

### 3. Set Up Clerk Authentication

1. Create a Clerk account at [clerk.com](https://clerk.com)
2. Create a new application
3. Configure for Expo:
   - Enable Email/Password sign-in
   - Create a JWT template named "supabase" with your Supabase JWT secret
4. Copy your publishable and secret keys

### 4. Set Up OpenAI

1. Get an API key from [platform.openai.com](https://platform.openai.com)
2. Ensure you have access to Whisper API and GPT-4

### 5. Set Up WhatsApp Business API

1. Create a Meta Business account
2. Set up WhatsApp Business API
3. Create a message template named "patient_note_ready":
   ```
   Your visit summary from {{1}} is ready.

   Tap to view your summary:
   [View Summary]({{2}})
   ```
4. Get your Phone Number ID and Access Token

### 6. Configure Environment Variables

Copy the example files and fill in your values:

```bash
cp .env.example .env
cp apps/mobile/.env.example apps/mobile/.env
cp apps/web/.env.example apps/web/.env
```

### 7. Deploy Edge Functions

```bash
cd packages/supabase
supabase functions deploy transcribe
supabase functions deploy generate-notes
supabase functions deploy send-whatsapp

# Set secrets
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set WHATSAPP_PHONE_NUMBER_ID=...
supabase secrets set WHATSAPP_ACCESS_TOKEN=...
supabase secrets set WEB_URL=https://your-app.vercel.app
```

## Development

### Mobile App

```bash
cd apps/mobile
npm install
npx expo start
```

Scan the QR code with Expo Go, or press `a` to open Android emulator.

### Web App

```bash
cd apps/web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deployment

### Mobile App

```bash
cd apps/mobile
npx eas build --platform android
```

### Web App (Vercel)

```bash
cd apps/web
npx vercel
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Mobile App | React Native (Expo) |
| Web App | Next.js 14 |
| Database | Supabase (Postgres) |
| Auth | Clerk |
| Storage | Supabase Storage |
| Serverless | Supabase Edge Functions |
| AI | OpenAI (Whisper + GPT-4) |
| Messaging | WhatsApp Cloud API |

## Demo Flow

1. Doctor logs in with Clerk
2. Enters patient WhatsApp number and name
3. Confirms recording consent
4. Records visit (audio stored locally)
5. Submits for processing
6. Audio uploads → Transcription → Note generation
7. Doctor reviews and edits notes
8. Approves and sends to patient
9. Patient receives WhatsApp with magic link
10. Patient views summary on mobile-friendly page

## Environment Variables

See `.env.example` files in each app directory.

## License

Proprietary - Karibu Health
