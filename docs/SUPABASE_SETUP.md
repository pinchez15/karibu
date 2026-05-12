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

> **2026-04-24:** Audio/consent infrastructure dropped in migration 023. The `transcribe` and `cleanup-audio` functions, `audio_uploads` table, and `patient_consents` table no longer exist. Patient voice is never recorded. The product is dictation-enabled (typing or post-visit clinician dictation).
>
> **2026-04-08:** WhatsApp delivery removed. Patient notes are printed from the staff dashboard. `send-whatsapp` and the magic-link patient viewer no longer exist.

Four Edge Functions are deployed; all live in `packages/supabase/functions/`.

| Function            | Purpose                                                            | Called by                                  |
|---------------------|--------------------------------------------------------------------|--------------------------------------------|
| `dictate`           | Audio chunk → Whisper transcript. Stateless: no DB write, no consent gate. ≤25MB. | Android dictation flow, web mic recorder |
| `submit-dictation`  | Persists transcript to `provider_notes`, sets `visits.status='pending'`, fires Inngest `note.dictated` event. | Android opt-in "Structure with AI" action, web dashboard submit |
| `approve-dictation` | Clinician approves AI-structured note; advances `pending → sent`, finalizes provider + patient notes. | Web review flow, Android ReviewScreen     |
| `reject-dictation`  | Clears AI output (note_content, structured_data, patient summary); preserves transcript for re-edit. | Web review flow                          |

The downstream AI workflow runs in **Inngest**, not in an edge function — see `apps/web/src/inngest/functions/` for `reviewClinicianNote`, `draftPatientReceipt`, `suggestHmisCode`, and the 1-minute polling fallback `pollAiStructureQueue`.

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

### Deploy all four functions

From **`packages/supabase`**:

```bash
cd packages/supabase

supabase functions deploy dictate
supabase functions deploy submit-dictation
supabase functions deploy approve-dictation
supabase functions deploy reject-dictation
```

### Set secrets (required for Edge Functions)

Supabase automatically provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to deployed functions. You must set the rest.

**Option A – CLI (recommended)**

From `packages/supabase`:

```bash
# OpenAI Whisper (dictate) and Inngest event dispatch (submit-dictation)
supabase secrets set OPENAI_API_KEY=sk-your-actual-openai-key
supabase secrets set INNGEST_EVENT_KEY=your-inngest-event-key

# Clerk JWT verification (all four functions verify Clerk tokens)
# Find this in Clerk Dashboard → API Keys → "Frontend API URL"
supabase secrets set CLERK_ISSUER=https://clerk.karibu.health
```

**Option B – Dashboard**

1. Go to **Project Settings** (gear) → **Edge Functions**.
2. Under **Edge Function Secrets**, add each key:

| Secret name          | Required by                                                    | Example / notes                |
|----------------------|----------------------------------------------------------------|--------------------------------|
| `OPENAI_API_KEY`     | `dictate` (Whisper)                                            | `sk-...`                       |
| `INNGEST_EVENT_KEY`  | `submit-dictation` (fires `note.dictated`)                     | Inngest dashboard              |
| `CLERK_ISSUER`       | All four (Clerk JWT validation)                                | `https://clerk.karibu.health`  |

3. Save and redeploy the affected functions.

### Verify Edge Functions

1. **URLs follow the pattern:** `https://YOUR_PROJECT_REF.supabase.co/functions/v1/<function-name>`.
2. **`dictate`:** Trigger from Android dictation or the web mic recorder; check Dashboard → Edge Functions → Logs.
3. **`submit-dictation`:** Triggered when the clinician taps "Structure with AI"; the Inngest event should appear in the Inngest dashboard within seconds.
4. **`approve-dictation` / `reject-dictation`:** Exercised from the web review flow.

---

## Checklist

- [ ] Realtime enabled; `visits` in `supabase_realtime` publication.
- [ ] All four edge functions deployed.
- [ ] Secrets set: `OPENAI_API_KEY`, `INNGEST_EVENT_KEY`, `CLERK_ISSUER`.
- [ ] Inngest signing keys configured in the web app (`INNGEST_SIGNING_KEY`, `INNGEST_EVENT_KEY`).
- [ ] Queue dashboard updates in real time when visits change.
- [ ] Dictation round-trip works: clinician dictates → transcript persisted → `note.dictated` event fires → AI review writes back.
- [ ] Print patient note works from the dashboard.

---

## Troubleshooting

**Realtime not updating**

- Confirm **Database → Replication**: Realtime is on and `visits` is in `supabase_realtime`.
- Confirm RLS allows the client to read `visits` (Realtime respects RLS).
- Check browser dev tools for WebSocket errors to `realtime.supabase.co`.

**Edge Function 500 / "Missing key"**

- In Dashboard → Project Settings → Edge Functions, confirm every required secret is set.
- Redeploy the function after changing secrets.

**`submit-dictation` succeeds but no AI review appears**

- Check the Inngest dashboard for the `note.dictated` event and the three handlers (`reviewClinicianNote`, `draftPatientReceipt`, `suggestHmisCode`).
- The 1-minute polling fallback `pollAiStructureQueue` will eventually pick up any visit with `documentation_complete=true AND ai_review_status='not_started' AND ai_review_attempts < 5`.
