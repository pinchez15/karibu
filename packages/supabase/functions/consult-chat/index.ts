// consult-chat: append a user message and return an assistant reply (frontier model).
// Only redacted_snapshot from consult_threads is sent to the model — never patient names.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { getCorsHeaders, handleCorsPreflightOrError } from '../_shared/cors.ts'
import { checkRateLimit } from '../_shared/rate-limit.ts'
import { requireAuth, requireStaffForClinic, authErrorResponse } from '../_shared/auth.ts'
import { createLogger } from '../_shared/logger.ts'

const logger = createLogger('consult-chat')
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || ''
const CONSULT_MODEL = Deno.env.get('OPENAI_MEDICAL_MODEL') || 'gpt-4o-mini'

const SYSTEM = `You are a senior clinician advising a colleague at a Health Centre III in Uganda.
The case summary is de-identified. Give concise, practical second-opinion guidance.
Do not ask for patient names or identifiers. Prefer syndromic management and locally available tests.
This is not a substitute for supervisor review, referral, or emergency care.`

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

  // Paid LLM call — rate limit per user (same pattern as dictate).
  const rlKey = authCtx.type === 'clerk' ? `consult:${authCtx.userId}` : 'consult:service'
  const rl = checkRateLimit(rlKey, { maxRequests: 20, windowMs: 60 * 1000 })
  if (!rl.allowed) {
    return new Response(
      JSON.stringify({ error: 'Too many consult requests. Please wait a minute.' }),
      { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  if (!OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: 'OPENAI_API_KEY is not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json()
    const thread_id = body.thread_id as string | undefined
    const message = (body.message as string | undefined)?.trim()
    if (!thread_id || !message) {
      return new Response(JSON.stringify({ error: 'thread_id and message are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: thread, error: tErr } = await supabase
      .from('consult_threads')
      .select('id, clinic_id, visit_id, redacted_snapshot, status')
      .eq('id', thread_id)
      .maybeSingle()
    if (tErr || !thread) {
      return new Response(JSON.stringify({ error: 'Thread not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    await requireStaffForClinic(supabase, authCtx, thread.clinic_id)

    const { data: visit } = await supabase
      .from('visits')
      .select('documentation_complete')
      .eq('id', thread.visit_id)
      .maybeSingle()

    if (visit?.documentation_complete) {
      return new Response(JSON.stringify({ error: 'Visit signed — consult is read-only' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: prior } = await supabase
      .from('consult_messages')
      .select('role, content')
      .eq('thread_id', thread_id)
      .order('created_at', { ascending: true })
      .limit(16)

    const caseJson = JSON.stringify(thread.redacted_snapshot ?? {}, null, 2)
    const history = (prior ?? [])
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-8)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    const messages = [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: `De-identified case bundle:\n${caseJson}`,
      },
      ...history,
      { role: 'user', content: message },
    ]

    await supabase.rpc('rpc_append_consult_message', {
      p_thread_id: thread_id,
      p_role: 'user',
      p_content: message,
    })

    const oaiResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: CONSULT_MODEL,
        temperature: 0.3,
        messages,
      }),
    })

    if (!oaiResp.ok) {
      const errText = await oaiResp.text()
      throw new Error(`OpenAI ${oaiResp.status}: ${errText.slice(0, 300)}`)
    }

    const oaiJson = await oaiResp.json()
    const assistant =
      oaiJson.choices?.[0]?.message?.content?.trim() ||
      'I could not generate a response. Please try again or escalate to your supervisor.'

    await supabase.rpc('rpc_append_consult_message', {
      p_thread_id: thread_id,
      p_role: 'assistant',
      p_content: assistant,
    })

    logger.info('consult reply', { thread_id })
    return new Response(JSON.stringify({ ok: true, thread_id, assistant }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    logger.error('consult-chat failed', { error: String(err) })
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
