import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { withRetry, fetchWithRetry } from '../_shared/retry.ts'
import { createLogger } from '../_shared/logger.ts'
import { auditLog } from '../_shared/audit.ts'
import { getCorsHeaders, handleCorsPreflightOrError } from '../_shared/cors.ts'
import { checkRateLimit } from '../_shared/rate-limit.ts'
import { requireAuth, requireStaffForClinic, AuthError, authErrorResponse } from '../_shared/auth.ts'

const logger = createLogger('generate-notes')

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  const preflightResponse = handleCorsPreflightOrError(req)
  if (preflightResponse) return preflightResponse

  // Require authenticated caller (Clerk session or service role).
  let authCtx
  try {
    authCtx = await requireAuth(req)
  } catch (err) {
    return authErrorResponse(err, corsHeaders)
  }

  let visit_id: string | undefined
  let supabase: ReturnType<typeof createClient> | undefined

  try {
    const body = await req.json()
    visit_id = body.visit_id

    // Rate limit: 5 note generation requests per caller identity per 10 minutes.
    const rlKey = authCtx.type === 'clerk' ? `clerk:${authCtx.userId}` : 'service'
    const rl = checkRateLimit(rlKey, { maxRequests: 5, windowMs: 10 * 60 * 1000 })
    if (!rl.allowed) {
      return new Response(
        JSON.stringify({ error: 'Too many requests. Please wait before retrying.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': String(Math.ceil((rl.retryAfterMs || 60000) / 1000)) } }
      )
    }

    if (!visit_id) {
      return new Response(
        JSON.stringify({ error: 'visit_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const op = logger.startOperation('noteGeneration', { visit_id })

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    supabase = createClient(supabaseUrl, supabaseServiceKey)
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!

    // Get visit and transcript
    const { data: visit } = await withRetry(
      async () => {
        const result = await supabase!
          .from('visits')
          .select('*, provider_notes(*), patient:patients(display_name)')
          .eq('id', visit_id)
          .single()
        if (result.error) throw new Error(result.error.message)
        return result
      },
      'getVisit'
    )

    if (!visit) {
      throw new Error('Visit not found')
    }

    // Tenant check: Clerk callers must belong to the visit's clinic.
    // Service-role callers (server-to-server) bypass this.
    await requireStaffForClinic(supabase, authCtx, visit.clinic_id)

    // Idempotency: refuse to re-bill OpenAI if a non-empty note already exists.
    // Callers should explicitly clear note_content (e.g. via the "Re-process"
    // flow which calls /transcribe again) if they want to regenerate.
    const existingNote = visit.provider_notes?.note_content
    if (existingNote && existingNote.trim().length > 0) {
      logger.info('Note already exists, skipping regeneration', { visit_id })
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: 'note_already_exists',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Use English transcript for note generation (translated if source was local language)
    const transcript = visit.provider_notes?.transcript_english
      || visit.provider_notes?.transcript
    if (!transcript) {
      throw new Error('Transcript not found')
    }

    const sourceLanguage = visit.source_language || 'eng'

    logger.info('Generating notes from transcript', {
      visit_id,
      transcript_length: transcript.length,
      source_language: sourceLanguage,
      provider: visit.provider_notes?.transcription_provider,
    })

    // Build context from visit data
    const context = []
    if (visit.diagnosis) context.push(`Diagnosis: ${visit.diagnosis}`)
    if (visit.medications) context.push(`Medications: ${visit.medications}`)
    if (visit.follow_up_instructions) context.push(`Follow-up: ${visit.follow_up_instructions}`)
    if (visit.tests_ordered) context.push(`Tests ordered: ${visit.tests_ordered}`)

    const contextStr = context.length > 0 ? `\n\nAdditional context from doctor:\n${context.join('\n')}` : ''

    // Note if this was a translated transcript
    const translationNote = sourceLanguage === 'local'
      ? '\n\nNote: This transcript was automatically translated from a Ugandan local language to English. Some medical terms may have been approximated during translation.'
      : ''

    // Generate provider note (SOAP format)
    const providerPrompt = `You are a medical scribe. Generate a professional clinical note in SOAP format from this visit transcript.

Transcript:
${transcript}
${contextStr}
${translationNote}

Generate a structured clinical note with these sections:
- Subjective: Patient's reported symptoms and history
- Objective: Any vitals, observations, or exam findings mentioned
- Assessment: Clinical assessment and diagnosis
- Plan: Treatment plan, medications, follow-up

Be concise but thorough. Use medical terminology appropriately. If information is not mentioned in the transcript, note it as "Not documented" rather than making assumptions.`

    const providerResponse = await fetchWithRetry(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: 'You are a medical scribe assistant helping doctors document patient visits in Uganda. Generate structured SOAP notes from visit transcripts.' },
            { role: 'user', content: providerPrompt },
          ],
          temperature: 0.3,
          max_tokens: 2000,
        }),
      },
      'generateProviderNote'
    )

    if (!providerResponse.ok) {
      throw new Error(`OpenAI API error: ${await providerResponse.text()}`)
    }

    const providerResult = await providerResponse.json()
    const providerNoteContent = providerResult.choices[0].message.content

    logger.info('Provider note generated', { visit_id, provider_note_length: providerNoteContent.length })

    // Generate patient note (plain language)
    const patientName = visit.patient?.display_name || 'there'

    // IMPORTANT: this output is printed on a 58mm thermal receipt and handed
    // to the patient. Every word costs paper. Diagnosis / medications /
    // follow-up are surfaced as STRUCTURED FIELDS on the printout already
    // (from visits.diagnosis, visits.medications, visits.follow_up_instructions),
    // so this prompt should NOT repeat them. Its only job is to add a short,
    // warm, plain-language explanation that contextualizes the structured
    // fields for the patient.
    const patientPrompt = `You are explaining a doctor visit to a patient in simple, warm, plain language. The patient will receive this on a small printed receipt alongside structured fields (diagnosis, medications, follow-up). Your job is the warm explanation only — do NOT repeat the medication names, doses, or follow-up dates.

Clinical Note (for your context, do not quote it):
${providerNoteContent}

Write a short note for ${patientName} that:
- Starts with their name as a friendly greeting
- Explains in 1-2 sentences what was found
- Reassures them if appropriate
- Reminds them to take medicine as prescribed and come back if they feel worse

Hard rules:
- Maximum 80 words. Count them. Stop at 80.
- No markdown, no asterisks, no bullet points, no headers.
- No medical jargon.
- Plain text only.`

    const patientResponse = await fetchWithRetry(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: 'You are a friendly healthcare assistant helping patients understand their visit. Write in simple English that can be easily understood.' },
            { role: 'user', content: patientPrompt },
          ],
          temperature: 0.5,
          max_tokens: 200,
        }),
      },
      'generatePatientNote'
    )

    if (!patientResponse.ok) {
      throw new Error(`OpenAI API error: ${await patientResponse.text()}`)
    }

    const patientResult = await patientResponse.json()
    const patientNoteContent = patientResult.choices[0].message.content

    logger.info('Patient note generated', { visit_id, patient_note_length: patientNoteContent.length })

    // Save both notes
    await withRetry(
      async () => {
        const { error } = await supabase!
          .from('provider_notes')
          .update({
            note_content: providerNoteContent,
            status: 'draft',
          })
          .eq('visit_id', visit_id)
        if (error) throw new Error(error.message)
      },
      'saveProviderNote'
    )

    await withRetry(
      async () => {
        const { error } = await supabase!
          .from('patient_notes')
          .upsert({
            visit_id,
            content: patientNoteContent,
            language: 'en',
            status: 'draft',
          }, {
            onConflict: 'visit_id',
          })
        if (error) throw new Error(error.message)
      },
      'savePatientNote'
    )

    // AI Diagnosis Coding: Map assessment to HMIS 105 codes
    try {
      // Fetch HMIS diagnosis codes
      const { data: hmisCodes } = await supabase!
        .from('hmis_diagnosis_codes')
        .select('id, hmis_code, display_name, category, subcategory')
        .eq('is_active', true)
        .order('sort_order')

      if (hmisCodes && hmisCodes.length > 0) {
        const codeList = hmisCodes
          .map((c: { hmis_code: string; display_name: string; category: string; subcategory: string | null }) =>
            `${c.hmis_code}: ${c.display_name}`)
          .join('\n')

        const diagnosisField = visit.diagnosis || ''
        const codingPrompt = `Based on this clinical note's Assessment section and diagnosis, map to the appropriate HMIS 105 diagnosis codes.

Assessment/Diagnosis from note:
${providerNoteContent}

${diagnosisField ? `Doctor's diagnosis field: ${diagnosisField}` : ''}

Available HMIS 105 codes:
${codeList}

Return a JSON array of matches. Each match should have:
- "hmis_code": the code string (e.g. "HMIS_105_1.1")
- "confidence": a number 0-1 indicating match confidence

Only include codes that clearly match the clinical findings. Return 1-3 codes maximum.
Return ONLY the JSON array, no other text.`

        const codingResponse = await fetchWithRetry(
          'https://api.openai.com/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openaiApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-4o',
              messages: [
                { role: 'system', content: 'You are a medical coding assistant. Map clinical findings to HMIS 105 OPD diagnosis codes used in Uganda. Return only valid JSON.' },
                { role: 'user', content: codingPrompt },
              ],
              temperature: 0.1,
              max_tokens: 500,
            }),
          },
          'aiDiagnosisCoding'
        )

        if (codingResponse.ok) {
          const codingResult = await codingResponse.json()
          const codingText = codingResult.choices[0].message.content.trim()

          // Parse JSON, stripping markdown fences if present
          const jsonStr = codingText.replace(/^```json?\s*/, '').replace(/\s*```$/, '')
          const matches = JSON.parse(jsonStr) as Array<{ hmis_code: string; confidence: number }>

          // Build a lookup of hmis_code -> id
          const codeIdMap = new Map(
            hmisCodes.map((c: { id: number; hmis_code: string }) => [c.hmis_code, c.id])
          )

          const validInserts = matches
            .filter((m: { hmis_code: string }) => codeIdMap.has(m.hmis_code))
            .map((m: { hmis_code: string; confidence: number }) => ({
              visit_id,
              hmis_code_id: codeIdMap.get(m.hmis_code),
              confidence: m.confidence,
              source: 'ai',
            }))

          if (validInserts.length > 0) {
            await supabase!
              .from('visit_diagnosis_codes')
              .upsert(validInserts, { onConflict: 'visit_id,hmis_code_id' })

            logger.info('AI diagnosis coding completed', {
              visit_id,
              codes_mapped: validInserts.length,
            })
          }
        }
      }
    } catch (codingError) {
      // Non-blocking: log but don't fail the visit
      logger.error('AI diagnosis coding failed (non-blocking)', { visit_id }, codingError)
    }

    // Update visit status to review (pending clinician review)
    await withRetry(
      async () => {
        const { error } = await supabase!
          .from('visits')
          .update({
            status: 'review',
            review_status: 'pending_review',
          })
          .eq('id', visit_id)
        if (error) throw new Error(error.message)
      },
      'updateVisitStatus'
    )

    // Audit log
    auditLog(supabase, {
      actorType: 'system',
      action: 'note_generation_completed',
      resourceType: 'visit',
      resourceId: visit_id,
      patientId: visit.patient_id,
      metadata: {
        provider_note_length: providerNoteContent.length,
        patient_note_length: patientNoteContent.length,
        source_language: sourceLanguage,
      },
    })

    op.success({
      provider_note_length: providerNoteContent.length,
      patient_note_length: patientNoteContent.length,
    })

    return new Response(
      JSON.stringify({
        success: true,
        provider_note_length: providerNoteContent.length,
        patient_note_length: patientNoteContent.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    // Auth/tenant errors: return as 401/403 without marking the visit failed.
    if (error instanceof AuthError) {
      return authErrorResponse(error, corsHeaders)
    }

    logger.error('Note generation failed', { visit_id }, error)

    // Update visit status to error
    if (visit_id && supabase) {
      try {
        await supabase
          .from('visits')
          .update({
            status: 'error',
            error_message: `Note generation failed: ${error.message}`,
            error_at: new Date().toISOString(),
          })
          .eq('id', visit_id)
        logger.info('Visit status updated to error', { visit_id })
      } catch (updateError) {
        logger.error('Failed to update visit error status', { visit_id }, updateError)
      }
    }

    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
