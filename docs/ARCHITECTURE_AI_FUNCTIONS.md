# Architecture Decision: Supabase Edge Functions vs Vercel Serverless Functions for AI

## Current Setup

> **2026-04-08:** WhatsApp delivery removed. Patient notes are printed from
> the staff dashboard. The `send-whatsapp` function no longer exists.

**AI Functions (Supabase Edge Functions):**
- `transcribe` - Downloads audio from Supabase Storage, calls OpenAI/Sunbird, saves transcript
- `generate-notes` - Reads transcript, calls OpenAI twice (provider + patient notes), saves to DB

**Call Pattern:**
- Web app → `/functions/v1/transcribe` (direct HTTP call)
- Mobile app → `/functions/v1/transcribe` (direct HTTP call)
- `transcribe` → internally calls `generate-notes` via HTTP

**Key Dependencies:**
- Heavy Supabase DB reads/writes (visits, audio_uploads, provider_notes, patient_notes)
- Supabase Storage access (download audio files, potentially 10-100MB)
- Multiple OpenAI API calls (transcription, translation, note generation)
- Service role key access (bypasses RLS)

---

## Comparison: Supabase Edge Functions vs Vercel Serverless Functions

### ✅ **Arguments FOR Supabase Edge Functions (Current)**

#### 1. **Zero Egress Costs for Storage**
- **Current:** Audio files (10-100MB) downloaded from Supabase Storage → Supabase Edge Function = **no network egress cost**
- **Vercel:** Download from Supabase Storage → Vercel Function = **egress costs** (~$0.09/GB after free tier)
- **Impact:** For 1000 visits/month with 50MB avg audio = **~$4.50/month in egress costs** (on Vercel)

#### 2. **Co-location with Data**
- **Current:** Edge Functions run in same region as Supabase DB/Storage = **low latency** (~1-5ms)
- **Vercel:** Functions may be in different region = **higher latency** (~50-200ms) for DB calls
- **Impact:** Faster DB queries, better user experience

#### 3. **Single Backend for Web + Mobile**
- **Current:** Both web and mobile call same Supabase URLs (`/functions/v1/transcribe`)
- **Vercel:** Would need to expose Vercel URLs to mobile app (CORS, auth complexity)
- **Impact:** Simpler architecture, one place to manage

#### 4. **Service Role Access**
- **Current:** Edge Functions automatically get `SUPABASE_SERVICE_ROLE_KEY` injected
- **Vercel:** Would need to store service role key in Vercel env vars (same security, but more places to manage)
- **Impact:** Slightly simpler secret management

#### 5. **Storage Access Patterns**
- **Current:** Direct Supabase Storage SDK access (no HTTP overhead)
- **Vercel:** Would need to use Supabase Storage API over HTTP (extra network hop)
- **Impact:** Faster file downloads, simpler code

---

### ✅ **Arguments FOR Vercel Serverless Functions**

#### 1. **Vercel AI SDK Benefits**
- **Better DX:** `ai` package with streaming, tool calling, structured outputs
- **Streaming:** Could stream transcription/notes to UI (better UX)
- **Type Safety:** Better TypeScript support for AI responses
- **Example:**
  ```ts
  // Vercel AI SDK
  const stream = await openai.chat.completions.create({
    model: 'gpt-4o',
    stream: true,
    messages: [...]
  })
  // Stream to client in real-time
  ```

#### 2. **Better Local Development**
- **Current:** Need Supabase CLI + local Supabase instance for Edge Functions
- **Vercel:** `vercel dev` runs functions locally with hot reload
- **Impact:** Faster iteration, easier debugging

#### 3. **Better Observability**
- **Current:** Supabase Dashboard logs (basic)
- **Vercel:** Better logging, error tracking, performance metrics
- **Impact:** Easier debugging in production

#### 4. **Node.js Ecosystem**
- **Current:** Deno runtime (limited npm packages, different APIs)
- **Vercel:** Node.js runtime (full npm ecosystem)
- **Impact:** More package options, familiar APIs

#### 5. **Cost at Scale**
- **Current:** Supabase Edge Functions: $0.0000002 per invocation + compute time
- **Vercel:** Pro plan includes 100GB-hours/month (generous for most use cases)
- **Impact:** Vercel might be cheaper at very high scale (100k+ invocations/month)

---

## **Recommendation: Keep Supabase Edge Functions**

### Why?

1. **Cost Savings:** Zero egress costs for audio downloads (saves ~$5-50/month depending on volume)
2. **Performance:** Co-location with DB/Storage = faster operations
3. **Simplicity:** One backend for web + mobile, fewer moving parts
4. **Storage Access:** Direct SDK access is faster than HTTP API calls

### When to Consider Vercel?

Consider migrating to Vercel if:
- ✅ You need **streaming responses** (real-time transcription/notes to UI)
- ✅ You need **Vercel AI SDK features** (tool calling, structured outputs)
- ✅ **Egress costs** become negligible (< $10/month)
- ✅ You want **better local dev experience** (faster iteration)
- ✅ You need **advanced observability** (detailed metrics, error tracking)

---

## Hybrid Approach (Best of Both Worlds)

**Option:** Keep heavy DB/Storage operations in Supabase Edge Functions, move AI calls to Vercel.

### Architecture:
```
Mobile/Web → Supabase Edge Function (transcribe)
  ↓
Downloads audio from Storage (no egress cost)
  ↓
Calls Vercel Function (ai-transcribe)
  ↓
Vercel Function calls OpenAI/Sunbird (with streaming?)
  ↓
Returns transcript to Supabase Edge Function
  ↓
Supabase Edge Function saves to DB
```

**Pros:**
- ✅ Zero egress costs (audio stays in Supabase)
- ✅ Vercel AI SDK benefits (streaming, better DX)
- ✅ Best of both worlds

**Cons:**
- ❌ More complex (two function types to manage)
- ❌ Extra network hop (Supabase → Vercel → OpenAI)
- ❌ More places to deploy/debug

**Verdict:** Only worth it if you **really need streaming** or Vercel AI SDK features.

---

## Final Recommendation

**Keep Supabase Edge Functions** for now because:
1. **Cost efficiency** (no egress for audio downloads)
2. **Performance** (co-location with data)
3. **Simplicity** (one backend, one deployment target)
4. **Current setup works** (no pressing need to change)

**Revisit if:**
- You need streaming responses (better UX)
- Egress costs become negligible
- You hit Deno limitations (package ecosystem)
- You need advanced observability

---

## Migration Path (If Needed Later)

If you decide to migrate to Vercel:

1. **Create Vercel API routes:**
   - `app/api/transcribe/route.ts`
   - `app/api/generate-notes/route.ts`

2. **Update clients:**
   - Web: Change URLs to `/api/transcribe`
   - Mobile: Change URLs to `https://your-app.vercel.app/api/transcribe`

3. **Handle Storage:**
   - Download audio in Vercel function (accept egress costs)
   - Or: Keep download in Supabase Edge Function, pass audio data to Vercel

4. **Secrets:**
   - Move `OPENAI_API_KEY`, `SUNBIRD_API_KEY` to Vercel env vars
   - Keep `SUPABASE_SERVICE_ROLE_KEY` in Vercel (for DB access)

5. **Test thoroughly:**
   - Audio download performance
   - DB query latency
   - Cost impact (egress)

---

## Summary Table

| Factor | Supabase Edge Functions | Vercel Serverless Functions |
|--------|-------------------------|----------------------------|
| **Storage Egress Cost** | ✅ $0 (co-located) | ❌ ~$0.09/GB |
| **DB Latency** | ✅ ~1-5ms (co-located) | ⚠️ ~50-200ms |
| **DX (AI SDK)** | ⚠️ Manual OpenAI calls | ✅ Vercel AI SDK |
| **Streaming** | ❌ Not supported | ✅ Supported |
| **Local Dev** | ⚠️ Requires Supabase CLI | ✅ `vercel dev` |
| **Observability** | ⚠️ Basic logs | ✅ Advanced metrics |
| **Ecosystem** | ⚠️ Deno (limited) | ✅ Node.js (full) |
| **Simplicity** | ✅ One backend | ⚠️ Two backends |
| **Cost (compute)** | ✅ Very cheap | ✅ Generous free tier |

**Winner:** Supabase Edge Functions (for your use case)
