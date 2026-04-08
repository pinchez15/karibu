# Supabase Setup: Realtime & Edge Functions

Use this guide after your Supabase project exists and all SQL migrations have been run.

---

## Part 1: Enable Realtime (queue updates)

The queue dashboard (web and mobile) subscribes to **Postgres changes** on the `visits` table so the UI updates when patients move through the queue. Migration `008_queue_system.sql` already adds `visits` to the realtime publication; you just need to enable Realtime in the Dashboard.

### Steps

1. Open **[Supabase Dashboard](https://supabase.com/dashboard)** and select your project.

2. Go to **Database** → **Replication** (or **Database** → **Publications** in older UI).
   - If you see **Realtime** as a section, open it.

3. **Enable Realtime** for the project if there is a toggle (e.g. “Enable Realtime” or “Realtime” switch).

4. **Confirm `visits` is in the publication:**
   - Find the publication **`supabase_realtime`**.
   - Ensure the **`visits`** table is in the publication (your migration `008_queue_system.sql` runs `ALTER PUBLICATION supabase_realtime ADD TABLE visits`, so it should already be there if migrations ran).
   - If `visits` is missing, add it:
     - In **Replication** / **Publications**, edit `supabase_realtime` and add the `visits` table,  
     - Or run in **SQL Editor**:
       ```sql
       ALTER PUBLICATION supabase_realtime ADD TABLE visits;
       ```
       (If you get “table already in publication”, you’re done.)

5. **Verify:** Open your queue dashboard in the web app, move a visit (e.g. assign to nurse) from another tab or device. The first tab should update without a refresh.

---

## Part 2: Deploy Edge Functions

> **2026-04-08:** WhatsApp delivery removed. Patient notes are now printed
> from the staff dashboard. The `send-whatsapp` function and magic-link
> patient viewer no longer exist.

You have two Edge Functions that must be deployed and given secrets:

| Function         | Purpose                          | Used by                          |
|------------------|-----------------------------------|----------------------------------|
| `transcribe`     | Audio → transcript (OpenAI/Sunbird)| Web + mobile after upload         |
| `generate-notes` | Transcript → SOAP + patient note | Called by `transcribe` (internal) |

### Prerequisites

- **Supabase CLI** installed and logged in:
  ```bash
  npm install -g supabase
  supabase login
  ```
- Project **linked** (from repo root or `packages/supabase`):
  ```bash
  cd packages/supabase
  supabase link --project-ref YOUR_PROJECT_REF
  ```
  (`YOUR_PROJECT_REF` is in Dashboard → Project Settings → General → Reference ID.)

### Deploy all three functions

From **`packages/supabase`**:

```bash
cd packages/supabase

# Deploy both (order doesn’t matter for deploy; transcribe calls generate-notes at runtime)
supabase functions deploy transcribe
supabase functions deploy generate-notes
```

### Set secrets (required for Edge Functions)

Supabase automatically provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to deployed functions. You must set the rest.

**Option A – CLI (recommended)**

From `packages/supabase`:

```bash
# Required for transcribe + generate-notes
supabase secrets set OPENAI_API_KEY=sk-your-actual-openai-key
supabase secrets set SUNBIRD_API_KEY=your-sunbird-api-key

# Required for edge function authentication (Clerk JWT verification)
# Find this in Clerk Dashboard → API Keys → "Frontend API URL"
supabase secrets set CLERK_ISSUER=https://clerk.karibu.health
```

**Option B – Dashboard**

1. Go to **Project Settings** (gear) → **Edge Functions**.
2. Under **Edge Function Secrets**, add each key:

| Secret name               | Required by        | Example / notes        |
|---------------------------|--------------------|------------------------|
| `OPENAI_API_KEY`          | transcribe, generate-notes, dictate | `sk-...`         |
| `SUNBIRD_API_KEY`         | transcribe (translation)   | Sunbird dashboard |
| `CLERK_ISSUER`            | dictate, transcribe, generate-notes (auth) | `https://clerk.karibu.health` |

3. Save. Redeploy functions if the UI says so, or run:

   ```bash
   supabase functions deploy transcribe
   supabase functions deploy generate-notes
   ```

### Verify Edge Functions

1. **URLs:**  
   `https://YOUR_PROJECT_REF.supabase.co/functions/v1/transcribe`  
   (same pattern for `generate-notes` and `send-whatsapp`).

2. **transcribe:**  
   Trigger from the web app: visit detail → upload/trigger transcription. Check **Edge Functions** → **Logs** in the Dashboard for runs and errors.

3. **generate-notes:**  
   Called by `transcribe` after transcription; no direct call from the app.

---

## Checklist

- [ ] Realtime enabled; `visits` in `supabase_realtime` publication.
- [ ] `transcribe` and `generate-notes` deployed.
- [ ] Secrets set: `OPENAI_API_KEY`, `SUNBIRD_API_KEY`.
- [ ] Queue dashboard updates in real time when visits change.
- [ ] Transcription + notes pipeline works from visit detail.
- [ ] Print patient note works from dashboard.

---

## Troubleshooting

**Realtime not updating**

- Confirm **Database → Replication**: Realtime is on and `visits` is in `supabase_realtime`.
- Confirm RLS allows the client to read `visits` (Realtime respects RLS).
- In browser dev tools, check for WebSocket errors to `realtime.supabase.co`.

**Edge Function 500 / “Missing key”**

- In Dashboard → Project Settings → Edge Functions, confirm every required secret is set.
- Redeploy the function after changing secrets.

**transcribe fails after upload**

- Check Edge Function logs for the exact error (OpenAI/Sunbird key, Storage path, or `generate-notes` URL).
- Ensure Storage bucket and RLS allow the service role to read the audio file.
