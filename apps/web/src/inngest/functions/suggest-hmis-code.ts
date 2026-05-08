import { NonRetriableError } from 'inngest'
import { createServiceClient } from '@/lib/supabase'
import { inngest } from '../client'
import { STRUCTURING_MODEL, openai } from '../openai'

/**
 * Extract a HMIS 105 diagnosis code suggestion from the clinician's note.
 * Writes to `visit_diagnosis_codes` with `source='ai'`. The DiagnosisCoder
 * UI on the visit-detail page surfaces it for clinician confirmation;
 * confirmation flips `source` to `ai_confirmed` and only confirmed (or
 * `manual`) codes count toward the HMIS 105 monthly diocese report.
 *
 * Lightweight compared to the old SOAP step — single short prompt, single
 * insert. The clinician is the authority on coding too; we just save them
 * the typing.
 */

const SYSTEM_PROMPT = `You map a Ugandan clinician's free-text visit note to one HMIS 105 diagnosis bucket from the list below. The list is what the Ugandan Ministry of Health Health Management Information System reports each month.

Rules:
- Pick the SINGLE most likely bucket based on the diagnosis the clinician wrote, or — if no explicit diagnosis — the chief complaint and key findings.
- If you cannot map confidently, return null. Do not guess.
- Output JSON: { "icd10": string|null, "name": string|null, "confidence": "high"|"medium"|"low" }

icd10 must be a real ICD-10 code that maps to a HMIS 105 disease bucket (e.g. B54 for malaria unspecified, A09 for diarrhea, J18.9 for pneumonia unspecified, R50.9 for fever, O80 for normal delivery). Do not invent.`

interface RawSuggestion {
  icd10?: string | null
  name?: string | null
  confidence?: string
}

export const suggestHmisCode = inngest.createFunction(
  {
    id: 'suggest-hmis-code',
    name: 'Suggest HMIS 105 diagnosis code from clinician note',
    concurrency: { key: 'event.data.visit_id', limit: 1 },
    retries: 2,
  },
  { event: 'note.dictated' },
  async ({ event, step, logger }) => {
    const { visit_id, clinic_id } = event.data

    const suggestion = await step.run('suggest', async () => {
      const supabase = createServiceClient()

      const { data: visit, error } = await supabase
        .from('visits')
        .select(`
          id, chief_complaint, diagnosis,
          provider_notes(transcript)
        `)
        .eq('id', visit_id)
        .eq('clinic_id', clinic_id)
        .single()

      if (error || !visit) {
        throw new NonRetriableError(`Visit ${visit_id} not found`)
      }

      const rawNote = visit.provider_notes as unknown
      const providerNote = Array.isArray(rawNote)
        ? (rawNote[0] as { transcript: string | null } | undefined) ?? null
        : (rawNote as { transcript: string | null } | null)

      const transcript = providerNote?.transcript?.trim() ?? ''
      if (transcript.length === 0) return null

      const userMessage = [
        visit.chief_complaint ? `Chief complaint: ${visit.chief_complaint}` : null,
        visit.diagnosis ? `Clinician diagnosis: ${visit.diagnosis}` : null,
        '',
        'Note:',
        transcript,
      ]
        .filter(Boolean)
        .join('\n')

      const response = await openai().chat.completions.create({
        model: STRUCTURING_MODEL,
        response_format: { type: 'json_object' },
        temperature: 0.1,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
      })

      const raw = response.choices[0]?.message?.content
      if (!raw) return null

      try {
        const parsed = JSON.parse(raw) as RawSuggestion
        if (!parsed.icd10 || typeof parsed.icd10 !== 'string') return null
        if (!parsed.confidence || !['high', 'medium', 'low'].includes(parsed.confidence)) {
          return null
        }
        return {
          icd10: parsed.icd10.trim().toUpperCase(),
          name: parsed.name?.trim() ?? null,
          confidence: parsed.confidence as 'high' | 'medium' | 'low',
        }
      } catch {
        return null
      }
    })

    if (!suggestion) {
      logger.info('No HMIS suggestion returned', { visit_id })
      return { visit_id, coded: false }
    }

    // Resolve to hmis_diagnosis_codes.id by ICD-10 match.
    await step.run('persist', async () => {
      const supabase = createServiceClient()

      const { data: hmis } = await supabase
        .from('hmis_diagnosis_codes')
        .select('id')
        .eq('is_active', true)
        .contains('icd10_codes', [suggestion.icd10])
        .limit(1)
        .maybeSingle()

      if (!hmis) {
        logger.warn('No HMIS bucket matched ICD-10', {
          icd10: suggestion.icd10,
          name: suggestion.name,
        })
        return
      }

      const numericConfidence =
        suggestion.confidence === 'high'
          ? 0.9
          : suggestion.confidence === 'medium'
            ? 0.6
            : 0.3

      const { error: insertErr } = await supabase
        .from('visit_diagnosis_codes')
        .upsert(
          {
            visit_id,
            hmis_code_id: hmis.id,
            confidence: numericConfidence,
            source: 'ai',
            coded_by: null,
          },
          { onConflict: 'visit_id,hmis_code_id', ignoreDuplicates: true },
        )
      if (insertErr) {
        logger.warn('HMIS code upsert failed', { error: insertErr.message })
      }
    })

    return { visit_id, coded: true, icd10: suggestion.icd10 }
  },
)
