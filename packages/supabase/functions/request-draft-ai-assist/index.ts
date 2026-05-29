// request-draft-ai-assist: record draft-stage AI intent via RPC and dispatch
// Inngest `note.draft-ai-assist` for the attending review pipeline.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { getCorsHeaders, handleCorsPreflightOrError } from '../_shared/cors.ts'
import { requireAuth, requireStaffForClinic, authErrorResponse } from '../_shared/auth.ts'
import { createLogger } from '../_shared/logger.ts'

const logger = createLogger('request-draft-ai-assist')
const INNGEST_EVENT_KEY = Deno.env.get('INNGEST_EVENT_KEY') || ''

async function sendInngestEvent(name: string, data: Record<string, unknown>) {
  if (!INNGEST_EVENT_KEY) {
    throw new Error('INNGEST_EVENT_KEY is not set; cannot dispatch draft AI assist')
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

  try {
    const body = await req.json()
    const visit_id = body.visit_id as string | undefined
    const sections_snapshot = body.sections_snapshot as Record<string, unknown> | undefined

    if (!visit_id) {
      return new Response(JSON.stringify({ error: 'visit_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: visit, error: visitError } = await supabase
      .from('visits')
      .select('id, clinic_id')
      .eq('id', visit_id)
      .maybeSingle()

    if (visitError) throw new Error(visitError.message)
    if (!visit) {
      return new Response(JSON.stringify({ error: 'Visit not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    await requireStaffForClinic(supabase, authCtx, visit.clinic_id)

    const { error: rpcError } = await supabase.rpc('rpc_request_draft_ai_assist', {
      p_visit_id: visit_id,
      p_sections_snapshot: sections_snapshot ?? null,
    })
    if (rpcError) {
      throw new Error(`rpc_request_draft_ai_assist failed: ${rpcError.message}`)
    }

    await sendInngestEvent('note.draft-ai-assist', {
      visit_id,
      clinic_id: visit.clinic_id,
      phase: 'draft',
    })

    logger.info('draft AI assist queued', { visit_id })
    return new Response(JSON.stringify({ ok: true, visit_id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    logger.error('request-draft-ai-assist failed', { error: String(err) })
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
