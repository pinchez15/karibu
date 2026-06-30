# KaribuLearn Supabase

**Separate project from Karibu EHR.** No PHI, no Clerk, no EHR migrations.

## 1. Run SQL

In the **KaribuLearn** Supabase project → **SQL Editor** → New query → paste and run:

`migrations/001_learn_init.sql`

Then run:

`migrations/002_case_corrections.sql`

`migrations/003_learn_storage_buckets.sql`

## 2. Enable auth

**Authentication → Providers** — enable at least one:

- **Phone** (recommended for Uganda testers)
- **Email** (optional)

For phone OTP in dev, configure SMS (Twilio/etc.) under Auth → Phone settings.

### Email + password sign-in

**Authentication → Providers → Email** — enable Email provider.

For password sign-in without a confirmation email on every sign-up:

| Setting | Recommended |
|---------|-------------|
| Confirm email | **Off** for tester builds (users sign in immediately after create account) |
| Minimum password length | 8 (matches the app) |

Users can still choose **Send one-time code instead** on the email screen for OTP login.

### Email auth redirect (fix localhost links)

Karibu Learn is **Android-only** — there is no web app. Supabase defaults **Site URL** to
`http://localhost:3000`, which is why confirmation emails open localhost.

**Dashboard → Authentication → URL Configuration**

| Field | Value |
|-------|--------|
| Site URL | `com.karibuhealth.learn://login-callback` |
| Redirect URLs (allow list) | `com.karibuhealth.learn://login-callback` |

The app registers this deep link and calls `handleDeeplinks()` on launch.

**Option A (codes in app):** See step-by-step in repo docs or follow:

1. Sign In / Providers → turn **Confirm email** OFF → Save
2. Email Templates → **Magic Link** → body uses `{{ .Token }}` only (no link)
3. Email provider → **Email OTP length** = **6** (must match app)

## 3. Android env vars (local only — never commit)

**Supabase → Project Settings → API**

| Dashboard label | Put in `apps/learn-android/local.properties` |
|-----------------|-----------------------------------------------|
| Project URL | `LEARN_SUPABASE_URL=https://xxxx.supabase.co` |
| anon public | `LEARN_SUPABASE_ANON_KEY=eyJ...` |

Example `apps/learn-android/local.properties`:

```properties
sdk.dir=/Users/you/Library/Android/sdk
LEARN_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
LEARN_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Do not** add `service_role` to the app. **Do not** commit this file (`local.properties` is gitignored).

Rebuild: `pnpm learn-android:build`

## 4. RPCs (used by the Android app)

| RPC | Purpose |
|-----|---------|
| `rpc_record_case_completion(case_id, pack_id, score, total, credit?)` | Save score after finishing a case |
| `rpc_get_my_progress()` | Progress tab: credits + completion list |
| `rpc_submit_case_correction(case_id, pack_id, message, case_level?)` | Tester correction queue at end of case |

All RPCs require a signed-in user (`auth.uid()` from Supabase Auth session).

## 5. Security model

- **Anon key** in the APK is expected — RLS + RPCs enforce per-learner access.
- **Service role key** — migrations/scripts on your machine only; never in the Learn app.

## 6. Case pack storage (300 downloadable cases)

Run after migrations 001–002:

`migrations/003_learn_storage_buckets.sql`

This creates public bucket **`learn-packs`** with objects at `v1/{pack-id}.kpack`.

### Publish workflow

From repo root (after exporting):

```bash
# 1. Export 13 chapters × 3 levels → content/learn/published/chapters/
pnpm learn:export-packs

# 2. Write Supabase Storage URLs into the Android manifest
pnpm learn:sync-manifest

# 3. Upload .kpack files (needs service role in packages/learn-supabase/.env)
pnpm learn:upload-packs
```

Or all three: `pnpm learn:publish-packs`

Copy `.env.example` → `.env` and set:

- `LEARN_SUPABASE_URL`
- `LEARN_SUPABASE_SERVICE_ROLE_KEY`

Example public URL shape:

`https://YOUR_REF.supabase.co/storage/v1/object/public/learn-packs/v1/fever-malaria-acute-illness-l1.kpack`

The Android app downloads via plain HTTPS GET — no Storage SDK in the APK.
