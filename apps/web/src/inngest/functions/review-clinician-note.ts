import { NonRetriableError } from 'inngest'
import { createServiceClient } from '@/lib/supabase'
import { inngest } from '../client'
import { STRUCTURING_MODEL, openai } from '../openai'
import { retrieveRelevantChunks, formatChunksForPrompt, type RetrievedChunk } from '../retrieval'

/**
 * The clinician is the medical authority. This function exists to ask a
 * question — never restructure the note, never override the diagnosis. It
 * runs after the clinician saves and only surfaces a suggestion when AI
 * would disagree with high confidence, citing Uganda HC III treatment
 * guidelines from the published evidence library.
 *
 * Pipeline:
 *   load-context     — pull visit + clinician note + vitals + clinic capabilities
 *   retrieve         — embed the case, fetch top-N corpus chunks
 *   ask-disagreement — prompt the model to flag concerns ONLY when present;
 *                      answers must cite chunk_ids from the retrieved set
 *   validate         — drop any suggestion that cites a chunk we didn't pass
 *                      (no hallucinated citations reach the clinician)
 *   persist          — write surviving suggestions to ai_review_suggestions;
 *                      flip visits.ai_review_status to completed (or
 *                      set ai_review_no_concerns=true if zero suggestions)
 */

const SYSTEM_PROMPT = `You are a senior physician reviewing a colleague's clinical note at a Health Centre III in Uganda. Your colleague is the authority on this patient — only flag concerns when something significant appears to have been missed or mistaken. Do NOT restructure the note. Do NOT comment on style.

You are given:
- The clinician's note, vitals, chief complaint
- The clinic's available labs and pharmacy
- Excerpts from Uganda HC III treatment guidelines and WHO protocols, each tagged [chunk_id=N]

For each potential concern you raise, you MUST:
- Phrase it as a question, not a verdict ("Should we check X to rule out Y?")
- Cite at least one chunk_id from the retrieved set (citations outside the set will be discarded)
- State the reasoning in 1-2 sentences, grounded in the cited chunk
- Set confidence to 'high' only if the cited evidence makes the concern materially likely to change management
- If suggesting a lab or medication, prefer items on the clinic's available list

Most notes will have ZERO concerns. Empty array is the right answer when the clinician's plan matches the evidence. Never invent a concern just to have something to say.

Output JSON:
{
  "suggestions": [
    {
      "type": "ask_lab" | "ask_dx" | "ask_med" | "ask_history" | "ask_red_flag",
      "question": string,
      "reasoning": string,
      "citation_ids": number[],
      "confidence": "high" | "medium" | "low"
    }
  ]
}`

interface RawSuggestion {
  type?: string
  question?: string
  reasoning?: string
  citation_ids?: unknown[]
  confidence?: string
}

interface ValidatedSuggestion {
  type: 'ask_lab' | 'ask_dx' | 'ask_med' | 'ask_history' | 'ask_red_flag'
  question: string
  reasoning: string
  citation_ids: number[]
  confidence: 'high' | 'medium' | 'low'
}

const VALID_TYPES = new Set([
  'ask_lab',
  'ask_dx',
  'ask_med',
  'ask_history',
  'ask_red_flag',
])
const VALID_CONFIDENCES = new Set(['high', 'medium', 'low'])

async function markReviewFailed(
  visit_id: string,
  clinic_id: string,
  reason: string,
): Promise<void> {
  try {
    const supabase = createServiceClient()
    await supabase
      .from('visits')
      .update({
        ai_review_status: 'failed',
        ai_review_error: reason.slice(0, 500),
        ai_review_completed_at: new Date().toISOString(),
      })
      .eq('id', visit_id)
      .eq('clinic_id', clinic_id)
  } catch {
    // best effort
  }
}

export const reviewClinicianNote = inngest.createFunction(
  {
    id: 'review-clinician-note',
    name: 'Review clinician note for disagreements',
    concurrency: { key: 'event.data.visit_id', limit: 1 },
    retries: 2,
    onFailure: async ({ event, error }) => {
      const data =
        (event.data as { event?: { data?: { visit_id?: string; clinic_id?: string } } })?.event
          ?.data ??
        (event as unknown as { data: { visit_id: string; clinic_id: string } }).data
      if (data?.visit_id && data?.clinic_id) {
        await markReviewFailed(data.visit_id, data.clinic_id, error?.message ?? 'unknown error')
      }
    },
  },
  { event: 'note.dictated' },
  async ({ event, step, logger }) => {
    const { visit_id, clinic_id } = event.data

    // ---------------------------------------------------------- mark running
    await step.run('mark-running', async () => {
      const supabase = createServiceClient()
      const { data: cur } = await supabase
        .from('visits')
        .select('ai_review_attempts')
        .eq('id', visit_id)
        .eq('clinic_id', clinic_id)
        .maybeSingle()
      const attempts = (cur?.ai_review_attempts ?? 0) + 1
      const { error } = await supabase
        .from('visits')
        .update({
          ai_review_status: 'running',
          ai_review_started_at: new Date().toISOString(),
          ai_review_attempts: attempts,
          ai_review_error: null,
          ai_review_no_concerns: false,
        })
        .eq('id', visit_id)
        .eq('clinic_id', clinic_id)
      if (error) throw new NonRetriableError(`mark-running failed: ${error.message}`)
    })

    // ---------------------------------------------------------- load-context
    const context = await step.run('load-context', async () => {
      const supabase = createServiceClient()

      const { data: visit, error: vErr } = await supabase
        .from('visits')
        .select(`
          id, clinic_id, chief_complaint, visit_date,
          patient:patients(id, first_name, last_name, date_of_birth, sex),
          provider_notes(id, transcript)
        `)
        .eq('id', visit_id)
        .eq('clinic_id', clinic_id)
        .single()

      if (vErr || !visit) {
        await markReviewFailed(visit_id, clinic_id, `visit lookup: ${vErr?.message ?? 'no row'}`)
        throw new NonRetriableError(`Visit ${visit_id} not found: ${vErr?.message ?? 'no row'}`)
      }

      const rawNote = visit.provider_notes as unknown
      const providerNote = Array.isArray(rawNote)
        ? (rawNote[0] as { id: string; transcript: string | null } | undefined) ?? null
        : (rawNote as { id: string; transcript: string | null } | null)

      if (!providerNote?.transcript || providerNote.transcript.trim().length === 0) {
        await markReviewFailed(visit_id, clinic_id, `no transcript on ${providerNote?.id ?? 'null'}`)
        throw new NonRetriableError(`Visit ${visit_id} has no clinician note to review`)
      }

      const rawPatient = visit.patient as unknown
      const patient = Array.isArray(rawPatient)
        ? (rawPatient[0] as { date_of_birth?: string | null; sex?: string | null } | undefined) ??
          null
        : (rawPatient as { date_of_birth?: string | null; sex?: string | null } | null)

      // Latest vitals for this visit (best effort).
      const { data: vitals } = await supabase
        .from('patient_vitals')
        .select(
          'temp_c, bp_systolic, bp_diastolic, pulse_bpm, resp_rate, spo2_pct, weight_kg, height_cm, muac_cm',
        )
        .eq('visit_id', visit_id)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      // Clinic capabilities — only items currently flagged available/in-stock.
      const [{ data: labRows }, { data: drugRows }] = await Promise.all([
        supabase
          .from('clinic_lab_capabilities')
          .select('test_name')
          .eq('clinic_id', clinic_id)
          .eq('is_available', true),
        supabase
          .from('clinic_pharmacy_formulary')
          .select('drug_name')
          .eq('clinic_id', clinic_id)
          .eq('in_stock', true),
      ])

      return {
        visit_id,
        clinic_id,
        chief_complaint: visit.chief_complaint as string | null,
        transcript: providerNote.transcript,
        patient_age_years: patient?.date_of_birth
          ? Math.floor(
              (Date.now() - new Date(patient.date_of_birth).getTime()) /
                (1000 * 60 * 60 * 24 * 365.25),
            )
          : null,
        patient_sex: patient?.sex ?? null,
        vitals,
        labs_available: (labRows ?? []).map((r) => r.test_name).sort(),
        drugs_available: (drugRows ?? []).map((r) => r.drug_name).sort(),
      }
    })

    // ---------------------------------------------------------- retrieve
    const retrieved: RetrievedChunk[] = await step.run('retrieve', async () => {
      const v = context.vitals
      const vitalsBlurb = v
        ? [
            v.temp_c != null ? `T ${v.temp_c}°C` : null,
            v.bp_systolic != null && v.bp_diastolic != null
              ? `BP ${v.bp_systolic}/${v.bp_diastolic}`
              : null,
            v.pulse_bpm != null ? `HR ${v.pulse_bpm}` : null,
            v.resp_rate != null ? `RR ${v.resp_rate}` : null,
            v.spo2_pct != null ? `SpO2 ${v.spo2_pct}%` : null,
            v.weight_kg != null ? `Wt ${v.weight_kg}kg` : null,
          ]
            .filter(Boolean)
            .join(', ')
        : null

      return retrieveRelevantChunks({
        clinicianNote: context.transcript,
        chiefComplaint: context.chief_complaint,
        vitalsBlurb,
        limit: 6,
      })
    })

    if (retrieved.length === 0) {
      // No corpus matches → we have nothing to ground a disagreement against.
      // Mark as completed with no concerns rather than failed, so the
      // clinical workflow proceeds. This is the expected state until the
      // corpus is seeded; once it is, retrieval should always return chunks
      // for any reasonable clinician note.
      await step.run('finish-no-corpus', async () => {
        const supabase = createServiceClient()
        await supabase
          .from('visits')
          .update({
            ai_review_status: 'completed',
            ai_review_completed_at: new Date().toISOString(),
            ai_review_no_concerns: true,
            status: 'review',
          })
          .eq('id', visit_id)
          .eq('clinic_id', clinic_id)
          .eq('status', 'pending')
      })
      return { visit_id, ai_review_status: 'completed' as const, suggestions: 0 }
    }

    // ---------------------------------------------------------- ask-disagreement
    const suggestions: ValidatedSuggestion[] = await step.run(
      'ask-disagreement',
      async () => {
        const v = context.vitals
        const vitalsLine = v
          ? `T ${v.temp_c ?? '—'}°C, BP ${v.bp_systolic ?? '—'}/${v.bp_diastolic ?? '—'}, HR ${v.pulse_bpm ?? '—'}, RR ${v.resp_rate ?? '—'}, SpO2 ${v.spo2_pct ?? '—'}%, Wt ${v.weight_kg ?? '—'}kg, Ht ${v.height_cm ?? '—'}cm`
          : 'Vitals not recorded.'

        const userMessage = [
          `Patient: ${context.patient_sex ?? 'unknown sex'}, age ${context.patient_age_years ?? 'unknown'} years.`,
          `Chief complaint: ${context.chief_complaint ?? 'not recorded'}.`,
          vitalsLine,
          '',
          'Clinician note:',
          context.transcript,
          '',
          'Available labs at this clinic:',
          context.labs_available.length > 0
            ? context.labs_available.map((l) => `- ${l}`).join('\n')
            : '(none recorded)',
          '',
          'Available drugs at this clinic:',
          context.drugs_available.length > 0
            ? context.drugs_available.map((d) => `- ${d}`).join('\n')
            : '(none recorded)',
          '',
          'Retrieved guideline excerpts:',
          formatChunksForPrompt(retrieved),
        ].join('\n')

        const response = await openai().chat.completions.create({
          model: STRUCTURING_MODEL,
          response_format: { type: 'json_object' },
          temperature: 0.2,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ],
        })

        const raw = response.choices[0]?.message?.content
        if (!raw) {
          throw new Error('review: empty response from model')
        }

        let parsed: { suggestions?: RawSuggestion[] }
        try {
          parsed = JSON.parse(raw) as { suggestions?: RawSuggestion[] }
        } catch (e) {
          await markReviewFailed(visit_id, clinic_id, `non-JSON output: ${raw.slice(0, 200)}`)
          throw new NonRetriableError(`review: model returned non-JSON: ${raw.slice(0, 200)}`)
        }

        const allowedChunkIds = new Set(retrieved.map((c) => c.id))
        const validated: ValidatedSuggestion[] = []

        for (const s of parsed.suggestions ?? []) {
          // Validate shape.
          if (!s.type || !VALID_TYPES.has(s.type)) {
            logger.warn('Dropped suggestion: invalid type', { type: s.type })
            continue
          }
          if (!s.question || typeof s.question !== 'string' || s.question.trim().length < 5) {
            continue
          }
          if (!s.reasoning || typeof s.reasoning !== 'string') {
            continue
          }
          if (!s.confidence || !VALID_CONFIDENCES.has(s.confidence)) {
            continue
          }
          // Only keep high-confidence at launch (per product call).
          if (s.confidence !== 'high') {
            logger.info('Dropped suggestion: confidence below threshold', {
              confidence: s.confidence,
            })
            continue
          }

          // Validate citations against the retrieved set. Any citation we
          // didn't hand the model is a hallucination — drop the suggestion.
          const citationIds = Array.isArray(s.citation_ids)
            ? (s.citation_ids
                .map((x) => (typeof x === 'number' ? x : Number(x)))
                .filter((n) => Number.isFinite(n)) as number[])
            : []
          const validCitations = citationIds.filter((id) => allowedChunkIds.has(id))
          if (validCitations.length === 0) {
            logger.warn('Dropped suggestion: no valid citations', { question: s.question })
            continue
          }

          validated.push({
            type: s.type as ValidatedSuggestion['type'],
            question: s.question.trim(),
            reasoning: s.reasoning.trim(),
            citation_ids: validCitations,
            confidence: 'high',
          })
        }

        return validated
      },
    )

    // ---------------------------------------------------------- persist
    await step.run('persist', async () => {
      const supabase = createServiceClient()

      if (suggestions.length > 0) {
        const rows = suggestions.map((s) => ({
          visit_id,
          clinic_id,
          suggestion_type: s.type,
          question: s.question,
          reasoning: s.reasoning,
          citation_ids: s.citation_ids,
          confidence: s.confidence,
        }))
        const { error: insertErr } = await supabase.from('ai_review_suggestions').insert(rows)
        if (insertErr) {
          throw new Error(`persist suggestions: ${insertErr.message}`)
        }
      }

      const { error: updateErr } = await supabase
        .from('visits')
        .update({
          ai_review_status: 'completed',
          ai_review_completed_at: new Date().toISOString(),
          ai_review_no_concerns: suggestions.length === 0,
          // AI dictation pipeline: submit-dictation leaves status='pending';
          // advance to 'review' when the primary note.dictated handler completes.
          status: 'review',
        })
        .eq('id', visit_id)
        .eq('clinic_id', clinic_id)
        .eq('status', 'pending')
      if (updateErr) {
        throw new Error(`persist status: ${updateErr.message}`)
      }

      logger.info('reviewClinicianNote done', {
        visit_id,
        suggestions: suggestions.length,
        retrieved: retrieved.length,
      })
    })

    return {
      visit_id,
      ai_review_status: 'completed' as const,
      suggestions: suggestions.length,
    }
  },
)
