// Lightweight dictation endpoint: audio blob → OpenAI Whisper → text
// No database, no storage — just fast speech-to-text for keyboard-mic-style dictation

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getCorsHeaders, handleCorsPreflightOrError } from '../_shared/cors.ts'
import { checkRateLimit } from '../_shared/rate-limit.ts'
import { requireAuth, AuthError, authErrorResponse } from '../_shared/auth.ts'
import { buildTranscriptionPrompt } from '../_shared/transcription.ts'

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  const preflightResponse = handleCorsPreflightOrError(req)
  if (preflightResponse) return preflightResponse

  // Require authenticated caller (Clerk session or service role).
  // Without this, the public anon key is the only gate, which is no gate at all.
  let authCtx
  try {
    authCtx = await requireAuth(req)
  } catch (err) {
    return authErrorResponse(err, corsHeaders)
  }

  try {
    // Rate limit: 30 dictation requests per authenticated user per minute.
    // Keyed by Clerk userId (or 'service' for service-role calls) so attackers
    // can't bypass by rotating IPs.
    const rlKey = authCtx.type === 'clerk' ? `clerk:${authCtx.userId}` : 'service'
    const rl = checkRateLimit(rlKey, { maxRequests: 30, windowMs: 60 * 1000 })
    if (!rl.allowed) {
      return new Response(
        JSON.stringify({ error: 'Too many dictation requests. Please wait.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const apiKey = Deno.env.get('OPENAI_API_KEY')
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured')
    }

    // Accept audio as multipart form data
    const formData = await req.formData()
    const audioFile = formData.get('audio')

    if (!audioFile || !(audioFile instanceof File)) {
      return new Response(
        JSON.stringify({ error: 'audio file is required (multipart form field "audio")' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 25MB OpenAI limit
    if (audioFile.size > 25 * 1024 * 1024) {
      return new Response(
        JSON.stringify({ error: 'Audio file too large (max 25MB)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Optional tail of transcript already on screen — improves continuity
    // across ~5s streaming chunks and disambiguates clinical homophones.
    const continuation = formData.get('context')
    const section = formData.get('section')
    const prompt = buildTranscriptionPrompt(
      typeof continuation === 'string' ? continuation : null,
      typeof section === 'string' ? section : null,
    )

    const whisperForm = new FormData()
    whisperForm.append('file', audioFile, audioFile.name || 'dictation.webm')
    whisperForm.append('model', 'gpt-4o-transcribe')
    whisperForm.append('language', 'en')
    whisperForm.append('response_format', 'json')
    whisperForm.append('prompt', prompt)

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: whisperForm,
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('OpenAI API error:', response.status, errorText)
      throw new Error(`Transcription failed (${response.status})`)
    }

    const result = await response.json()

    return new Response(
      JSON.stringify({ text: result.text || '' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    if (error instanceof AuthError) {
      return authErrorResponse(error, corsHeaders)
    }
    console.error('Dictation error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
