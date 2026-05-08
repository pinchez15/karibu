import { NonRetriableError } from 'inngest'
import { createServiceClient } from '@/lib/supabase'
import { inngest } from '../client'
import { MEDICAL_MODEL, openai } from '../openai'

/**
 * Draft a very short, plain-language patient summary for the thermal
 * receipt. Triggered on every saved visit. Writes to `patient_notes`
 * with `source='ai_generated'` — the clinician's `clinician_fallback`
 * row is the receipt-of-record by default; this AI version is reference
 * material the clinician can opt to print instead.
 *
 * Intentionally tight: ≤250 chars, ≤3 sentences, second person, no
 * medical jargon, must include diagnosis name + medication regimen +
 * one red-flag instruction.
 */

const SYSTEM_PROMPT = `You are writing the printed slip a Ugandan patient takes home from a Health Centre III. They may have limited literacy; their first language may not be English. Most patients have a phone but limited credit.

Constraints — non-negotiable:
- Maximum 3 sentences. Maximum 250 characters total.
- Plain language. No medical jargon. No abbreviations the patient won't recognize.
- Second person ("You have…", "Take this…", "Call us if…").
- Must include: (1) the diagnosis or condition name, (2) the medication regimen as the clinician wrote it, (3) one red-flag callback instruction relevant to the diagnosis.
- If no medication was prescribed, replace (2) with the follow-up instruction.

Output ONLY the patient slip text. No JSON. No preamble. No "Here's the summary".`

async function markFailed(visit_id: string, clinic_id: string): Promise<void> {
  // Receipt drafting is best-effort — if it fails we still let the visit
  // proceed using the clinician's verbatim note as the receipt.
  try {
    const supabase = createServiceClient()
    await supabase
      .from('visits')
      .update({ ai_structure_error: 'receipt draft failed' })
      .eq('id', visit_id)
      .eq('clinic_id', clinic_id)
  } catch {
    // swallow
  }
}

export const draftPatientReceipt = inngest.createFunction(
  {
    id: 'draft-patient-receipt',
    name: 'Draft plain-language patient receipt',
    concurrency: { key: 'event.data.visit_id', limit: 1 },
    retries: 2,
  },
  { event: 'note.dictated' },
  async ({ event, step, logger }) => {
    const { visit_id, clinic_id } = event.data

    const text = await step.run('draft', async () => {
      const supabase = createServiceClient()

      const { data: visit, error } = await supabase
        .from('visits')
        .select(`
          id, chief_complaint, diagnosis, medications, follow_up_instructions,
          provider_notes(transcript)
        `)
        .eq('id', visit_id)
        .eq('clinic_id', clinic_id)
        .single()

      if (error || !visit) {
        await markFailed(visit_id, clinic_id)
        throw new NonRetriableError(`Visit ${visit_id} not found`)
      }

      const rawNote = visit.provider_notes as unknown
      const providerNote = Array.isArray(rawNote)
        ? (rawNote[0] as { transcript: string | null } | undefined) ?? null
        : (rawNote as { transcript: string | null } | null)

      const transcript = providerNote?.transcript?.trim() ?? ''
      if (transcript.length === 0) {
        // No note → nothing to draft from. Skip.
        return null
      }

      const userMessage = [
        visit.chief_complaint ? `Chief complaint: ${visit.chief_complaint}` : null,
        visit.diagnosis ? `Diagnosis (clinician): ${visit.diagnosis}` : null,
        visit.medications ? `Medications: ${visit.medications}` : null,
        visit.follow_up_instructions ? `Follow-up: ${visit.follow_up_instructions}` : null,
        '',
        'Clinician note:',
        transcript,
      ]
        .filter(Boolean)
        .join('\n')

      const response = await openai().chat.completions.create({
        model: MEDICAL_MODEL,
        temperature: 0.4,
        max_tokens: 200,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
      })

      const draft = response.choices[0]?.message?.content?.trim()
      if (!draft) {
        throw new Error('Empty receipt draft')
      }
      return draft
    })

    if (!text) {
      logger.info('Skipped receipt draft (no transcript)', { visit_id })
      return { visit_id, drafted: false }
    }

    await step.run('persist', async () => {
      const supabase = createServiceClient()
      const now = new Date().toISOString()
      const { error } = await supabase.from('patient_notes').upsert(
        {
          visit_id,
          content: text,
          language: 'en',
          status: 'draft',
          source: 'ai_generated',
          updated_at: now,
        },
        { onConflict: 'visit_id,source' },
      )
      if (error) throw new Error(`persist receipt: ${error.message}`)
    })

    return { visit_id, drafted: true, length: text.length }
  },
)
