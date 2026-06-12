// submit-dictation: persist a clinician's dictation transcript and kick off
// the Inngest workflow that turns it into a SOAP note + diagnosis suggestions
// + patient summary.
//
// Called by the Android dictation screen after the user has reviewed the
// Whisper transcript on-device and tapped "Submit". The transcript is
// already plain text by this point — this function never sees patient audio.
//
// Pipeline downstream:
//   submit-dictation -> Inngest event 'note.dictated' -> structureDictation()
//   in apps/web/src/inngest/functions/structure-dictation.ts -> persists SOAP
//   + structured suggestions + patient note + flips visit.status to 'review'.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { getCorsHeaders, handleCorsPreflightOrError } from '../_shared/cors.ts'
import { checkRateLimit } from '../_shared/rate-limit.ts'
import { requireAuth, requireStaffForClinic, AuthError, authErrorResponse } from '../_shared/auth.ts'
import { createLogger } from '../_shared/logger.ts'
import { auditLog } from '../_shared/audit.ts'

const logger = createLogger('submit-dictation')

// Inngest event ingest URL. INNGEST_EVENT_KEY is the public-write event key
// from the Inngest dashboard for this environment. The endpoint is:
//   https://inn.gs/e/<event_key>
// (Inngest also accepts POST to /api/inngest on your own domain via the SDK,
// but for edge-fn-to-Inngest, the hosted ingest endpoint is the simplest path.)
const INNGEST_EVENT_KEY = Deno.env.get('INNGEST_EVENT_KEY') || ''

async function sendInngestEvent(name: string, data: Record<string, unknown>) {
  if (!INNGEST_EVENT_KEY) {
    throw new Error('INNGEST_EVENT_KEY is not set; cannot dispatch workflow')
  }
  const url = `https://inn.gs/e/${INNGEST_EVENT_KEY}`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, data }),
  })
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(`Inngest event ${name} failed (${resp.status}): ${body.slice(0, 200)}`)
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  const preflight = handleCorsPreflightOrError(req)
  if (preflight) return preflight

  let authCtx
  try {
    authCtx = await requireAuth(req)
  } catch (err) {
    return authErrorResponse(err, corsHeaders)
  }

  let visit_id: string | undefined
  try {
    const body = await req.json()
    visit_id = body.visit_id as string | undefined
    const transcript = (body.transcript as string | undefined)?.trim()

    if (!visit_id || !transcript) {
      return new Response(
        JSON.stringify({ error: 'visit_id and transcript are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (transcript.length < 10) {
      return new Response(
        JSON.stringify({ error: 'Transcript is too short to structure (min 10 chars)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Rate limit: 10 dictation submissions per caller per 10 min. Tap-twice
    // protection is also handled by Inngest's per-visit concurrency=1, but
    // limiting here saves a wasted Inngest invocation.
    const rlKey = authCtx.type === 'clerk' ? `clerk:${authCtx.userId}` : 'service'
    const rl = checkRateLimit(rlKey, { maxRequests: 10, windowMs: 10 * 60 * 1000 })
    if (!rl.allowed) {
      return new Response(
        JSON.stringify({ error: 'Too many submissions. Please wait before retrying.' }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Retry-After': String(Math.ceil((rl.retryAfterMs || 60000) / 1000)),
          },
        },
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Look up the visit so we can (a) tenant-check the caller and (b) pass
    // clinic_id into the Inngest event payload (the workflow uses it for its
    // own clinic-scoped reads).
    const { data: visit, error: visitError } = await supabase
      .from('visits')
      .select('id, clinic_id, patient_id, status')
      .eq('id', visit_id)
      .maybeSingle()

    if (visitError) {
      throw new Error(`Visit lookup failed: ${visitError.message}`)
    }
    if (!visit) {
      return new Response(
        JSON.stringify({ error: 'Visit not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    await requireStaffForClinic(supabase, authCtx, visit.clinic_id)

    // Upsert the provider note's transcript via rpc_upsert_provider_note
    // (047): the visit_id uniqueness is a PARTIAL unique index, which a
    // PostgREST onConflict upsert cannot target, and patient_id is NOT NULL
    // since 039 — the old direct upsert violated both. The RPC handles the
    // visit_id conflict path, so re-submitting overwrites the prior
    // dictation. Inngest concurrency=1 per visit_id then collapses duplicate
    // workflow runs.
    const now = new Date().toISOString()
    const noteId = crypto.randomUUID()
    const { error: noteError } = await supabase.rpc('rpc_upsert_provider_note', {
      p_id: noteId,
      p_visit_id: visit_id,
      p_transcript: transcript,
      p_status: 'draft',
      p_patient_id: visit.patient_id,
    })
    if (noteError) {
      throw new Error(`provider_notes upsert failed: ${noteError.message}`)
    }

    // Move the visit out of 'pending' so the dashboard reflects "AI working
    // on it" while Inngest runs. structure-dictation will flip to 'review'
    // when it finishes (or 'error' on terminal failure).
    await supabase
      .from('visits')
      .update({ status: 'pending', updated_at: now })
      .eq('id', visit_id)
      .eq('clinic_id', visit.clinic_id)

    // Fire the workflow.
    await sendInngestEvent('note.dictated', {
      visit_id,
      clinic_id: visit.clinic_id,
    })

    // Audit (fire-and-forget)
    auditLog(supabase, {
      actorType: authCtx.type === 'clerk' ? 'staff' : 'system',
      action: 'dictation_submitted',
      resourceType: 'visit',
      resourceId: visit_id,
      patientId: visit.patient_id,
      metadata: { transcript_length: transcript.length },
    })

    logger.info('Dictation submitted, workflow dispatched', {
      visit_id,
      transcript_length: transcript.length,
    })

    return new Response(
      JSON.stringify({ success: true, status: 'pending' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    if (error instanceof AuthError) {
      return authErrorResponse(error, corsHeaders)
    }
    logger.error('submit-dictation failed', { visit_id }, error as Error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
