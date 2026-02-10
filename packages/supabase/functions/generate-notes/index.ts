import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { withRetry, fetchWithRetry } from '../_shared/retry.ts'
import { createLogger } from '../_shared/logger.ts'
import { auditLog } from '../_shared/audit.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const logger = createLogger('generate-notes')

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let visit_id: string | undefined
  let supabase: ReturnType<typeof createClient> | undefined

  try {
    const body = await req.json()
    visit_id = body.visit_id

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

    const patientPrompt = `You are helping explain a doctor visit to a patient in simple, friendly language. Based on this clinical note, create a patient-friendly summary.

Clinical Note:
${providerNoteContent}

Create a summary for the patient that includes:
1. A brief, friendly greeting using their name: ${patientName}
2. What was found during the visit (in simple terms)
3. Any medications prescribed and how to take them
4. What to do next (follow-up appointments, tests, etc.)
5. When to seek help if things get worse

Use simple language a non-medical person can understand. Be warm and reassuring. Avoid medical jargon. Keep it under 300 words.`

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
          max_tokens: 1000,
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
