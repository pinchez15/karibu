import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { visit_id } = await req.json()

    if (!visit_id) {
      return new Response(
        JSON.stringify({ error: 'visit_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!

    // Get visit and transcript
    const { data: visit, error: visitError } = await supabase
      .from('visits')
      .select('*, provider_notes(*), patient:patients(display_name)')
      .eq('id', visit_id)
      .single()

    if (visitError || !visit) {
      throw new Error('Visit not found')
    }

    const transcript = visit.provider_notes?.transcript
    if (!transcript) {
      throw new Error('Transcript not found')
    }

    // Build context from visit data
    const context = []
    if (visit.diagnosis) context.push(`Diagnosis: ${visit.diagnosis}`)
    if (visit.medications) context.push(`Medications: ${visit.medications}`)
    if (visit.follow_up_instructions) context.push(`Follow-up: ${visit.follow_up_instructions}`)
    if (visit.tests_ordered) context.push(`Tests ordered: ${visit.tests_ordered}`)

    const contextStr = context.length > 0 ? `\n\nAdditional context from doctor:\n${context.join('\n')}` : ''

    // Generate provider note (SOAP format)
    const providerPrompt = `You are a medical scribe. Generate a professional clinical note in SOAP format from this visit transcript.

Transcript:
${transcript}
${contextStr}

Generate a structured clinical note with these sections:
- Subjective: Patient's reported symptoms and history
- Objective: Any vitals, observations, or exam findings mentioned
- Assessment: Clinical assessment and diagnosis
- Plan: Treatment plan, medications, follow-up

Be concise but thorough. Use medical terminology appropriately. If information is not mentioned in the transcript, note it as "Not documented" rather than making assumptions.`

    const providerResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: 'You are a medical scribe assistant helping doctors document patient visits.' },
          { role: 'user', content: providerPrompt },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    })

    if (!providerResponse.ok) {
      throw new Error(`OpenAI API error: ${await providerResponse.text()}`)
    }

    const providerResult = await providerResponse.json()
    const providerNoteContent = providerResult.choices[0].message.content

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

    const patientResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: 'You are a friendly healthcare assistant helping patients understand their visit.' },
          { role: 'user', content: patientPrompt },
        ],
        temperature: 0.5,
        max_tokens: 1000,
      }),
    })

    if (!patientResponse.ok) {
      throw new Error(`OpenAI API error: ${await patientResponse.text()}`)
    }

    const patientResult = await patientResponse.json()
    const patientNoteContent = patientResult.choices[0].message.content

    // Save both notes
    await supabase
      .from('provider_notes')
      .update({
        note_content: providerNoteContent,
        status: 'draft',
      })
      .eq('visit_id', visit_id)

    await supabase
      .from('patient_notes')
      .upsert({
        visit_id,
        content: patientNoteContent,
        language: 'en',
        status: 'draft',
      }, {
        onConflict: 'visit_id',
      })

    // Update visit status to review
    await supabase
      .from('visits')
      .update({ status: 'review' })
      .eq('id', visit_id)

    return new Response(
      JSON.stringify({
        success: true,
        provider_note_length: providerNoteContent.length,
        patient_note_length: patientNoteContent.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Note generation error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
