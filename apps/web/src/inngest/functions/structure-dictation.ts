import { NonRetriableError } from 'inngest'
import { createServiceClient } from '@/lib/supabase'
import { inngest } from '../client'
import { MEDICAL_MODEL, openai } from '../openai'

// When a clinician finishes dictating, Inngest fans this out:
//
//   load-context   -> fetch visit + patient + transcript from Supabase
//   structure-note -> healthcare model turns dictation into SOAP + diagnoses
//                     with citations + meds + tests + follow-up
//   patient-note   -> plain-English summary for the printed receipt
//   persist        -> write both notes + flip visit to review for clinician
//
// Each step is retried independently by Inngest on failure. If the healthcare
// model is flaky we don't re-do the DB load or re-bill the structuring step
// just because the patient-note step glitched.
//
// AI tone (non-negotiable per product direction):
//   - Empowering for nurses, not a supervisor checking their work.
//   - Subtle recommendations + learning opportunities (relevant research
//     studies) not interruptive questions.
//   - Only flag missing_info when something is genuinely missing for safe
//     care — never to chase completeness for its own sake.

type StructuredNote = {
  diagnoses: Array<{
    name: string
    icd10?: string | null
    confidence: 'high' | 'medium' | 'low'
    rationale: string
    citations: Array<{ title: string; source: string; url?: string | null }>
  }>
  medications: Array<{ name: string; dosage: string; duration: string; notes?: string | null }>
  tests_ordered: Array<{ name: string; reason?: string | null }>
  follow_up: Array<{ when: string; what: string }>
  learning_note?: string | null
  missing_info?: string[]
  soap: {
    subjective: string
    objective: string
    assessment: string
    plan: string
  }
}

const STRUCTURE_SYSTEM_PROMPT = `You are a clinical documentation assistant supporting nurses at a low-resource health centre in Uganda. Most clinics see a doctor only once a week — nurses are providing primary care and deserve respect, not surveillance.

The clinician has just dictated a short summary of a patient visit. Your job is to:

1. Structure it into a SOAP note they can approve with a single tap.
2. Suggest the most likely differential diagnoses with evidence — include a citation (research study, WHO guideline, UpToDate, or Uganda MoH guideline) when one is relevant.
3. Extract medications, tests, and follow-up so they can flow into the printed patient receipt.
4. Optionally add ONE "learning_note" if you see a teachable pattern or a recent research insight the nurse would find genuinely useful. Omit this if nothing is worth saying.
5. Only populate "missing_info" when something is CRITICAL for safe care (e.g. no vital signs for a febrile child). Do not list polite-to-have extras. An empty list is fine.

Tone rules:
- Supportive colleague sharing relevant research, not a checker looking for errors.
- Never second-guess the clinician's examination or rapport. Trust what they dictated.
- Citations must be specific (name the guideline or study). If you cannot cite something concretely, omit citations for that diagnosis.
- Confidence: 'high' = textbook presentation, 'medium' = likely but needs follow-up, 'low' = worth considering but other explanations are more likely.
- Write in clear clinical English. SOAP sections are for clinicians and can use medical shorthand.`

const PATIENT_SUMMARY_SYSTEM_PROMPT = `You are writing a printed receipt summary for a patient at a Ugandan clinic. The patient will walk out with this on a 58mm thermal receipt and may share it with family or another clinic.

Write in simple, clear English, 60-80 words maximum, covering:
- What the clinician thought was going on (in plain language)
- What they prescribed or tested
- When to come back
- When to call the clinic right away (red flags)

Do NOT include doctor names, dates, or clinic letterhead — those are added by the print template.
Do NOT restate diagnoses that a patient can't act on (avoid scaring them with low-probability differentials).
Do NOT give medical advice beyond what the clinician decided.

The output is plain text, no markdown, no bullets, no headers. Just prose.`

export const structureDictation = inngest.createFunction(
  {
    id: 'structure-dictation',
    name: 'Structure dictated visit into SOAP + patient summary',
    // Multiple dictation events for the same visit collapse — only the latest
    // run of the pipeline matters. Prevents double-billing if the clinician
    // taps Submit twice.
    concurrency: {
      key: 'event.data.visit_id',
      limit: 1,
    },
    retries: 3,
  },
  { event: 'note.dictated' },
  async ({ event, step, logger }) => {
    const { visit_id, clinic_id } = event.data

    // ---------------------------------------------------------------- load
    const context = await step.run('load-context', async () => {
      const supabase = createServiceClient()
      const { data: visit, error } = await supabase
        .from('visits')
        .select(`
          id, clinic_id, chief_complaint,
          patient:patients(id, first_name, last_name, display_name, date_of_birth, sex),
          provider_notes(id, transcript)
        `)
        .eq('id', visit_id)
        .eq('clinic_id', clinic_id)
        .single()

      if (error || !visit) {
        // Cross-clinic or missing visit: don't retry, this is a data problem
        // not a transient one.
        throw new NonRetriableError(`Visit ${visit_id} not found for clinic ${clinic_id}: ${error?.message ?? 'no row'}`)
      }

      const providerNotesArr = visit.provider_notes as unknown as Array<{ id: string; transcript: string | null }> | null
      const providerNote = providerNotesArr?.[0] ?? null
      if (!providerNote?.transcript || providerNote.transcript.trim().length === 0) {
        throw new NonRetriableError(`Visit ${visit_id} has no dictation transcript`)
      }

      const patientArr = visit.patient as unknown as Array<{
        id: string
        first_name: string | null
        last_name: string | null
        display_name: string | null
        date_of_birth: string | null
        sex: string | null
      }> | null
      const patient = patientArr?.[0] ?? null

      return {
        visit_id,
        clinic_id,
        chief_complaint: visit.chief_complaint as string | null,
        patient,
        provider_note_id: providerNote.id,
        transcript: providerNote.transcript,
      }
    })

    // ------------------------------------------------------------ structure
    const structured = await step.run('structure-note', async () => {
      const patientBlurb = context.patient
        ? `Patient: ${context.patient.sex ?? 'unknown sex'}, DOB ${context.patient.date_of_birth ?? 'unknown'}.`
        : 'Patient demographics unavailable.'

      const response = await openai().chat.completions.create({
        model: MEDICAL_MODEL,
        response_format: { type: 'json_object' },
        temperature: 0.3,
        messages: [
          { role: 'system', content: STRUCTURE_SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              patientBlurb,
              context.chief_complaint ? `Chief complaint: ${context.chief_complaint}` : 'No chief complaint recorded at check-in.',
              '',
              'Dictation:',
              context.transcript,
              '',
              'Respond with JSON matching this shape: { "soap": { "subjective": string, "objective": string, "assessment": string, "plan": string }, "diagnoses": [{ "name": string, "icd10": string|null, "confidence": "high"|"medium"|"low", "rationale": string, "citations": [{ "title": string, "source": string, "url": string|null }] }], "medications": [{ "name": string, "dosage": string, "duration": string, "notes": string|null }], "tests_ordered": [{ "name": string, "reason": string|null }], "follow_up": [{ "when": string, "what": string }], "learning_note": string|null, "missing_info": string[] }',
            ].join('\n'),
          },
        ],
      })

      const raw = response.choices[0]?.message?.content
      if (!raw) throw new Error('structure-note: empty response from model')

      let parsed: StructuredNote
      try {
        parsed = JSON.parse(raw) as StructuredNote
      } catch (e) {
        // Surface the raw output so the clinician can see what happened in the
        // error state, instead of silently retrying on bad JSON forever.
        throw new NonRetriableError(`structure-note: model returned non-JSON: ${raw.slice(0, 200)}`)
      }

      // Minimum viable: we need at least a SOAP assessment to show the clinician.
      if (!parsed.soap?.assessment || parsed.soap.assessment.trim().length === 0) {
        throw new Error('structure-note: model returned empty assessment, retrying')
      }

      return parsed
    })

    // ---------------------------------------------------------- patient note
    const patientSummary = await step.run('generate-patient-summary', async () => {
      const diagnosesForPatient = structured.diagnoses
        .filter(d => d.confidence !== 'low')
        .map(d => d.name)
        .join('; ')

      const response = await openai().chat.completions.create({
        model: MEDICAL_MODEL,
        temperature: 0.4,
        messages: [
          { role: 'system', content: PATIENT_SUMMARY_SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              `Clinician assessment: ${structured.soap.assessment}`,
              `Plan: ${structured.soap.plan}`,
              diagnosesForPatient ? `Main considerations: ${diagnosesForPatient}` : '',
              structured.medications.length
                ? `Medications: ${structured.medications.map(m => `${m.name} ${m.dosage} for ${m.duration}`).join('; ')}`
                : '',
              structured.follow_up.length
                ? `Follow-up: ${structured.follow_up.map(f => `${f.when}: ${f.what}`).join('; ')}`
                : '',
            ]
              .filter(Boolean)
              .join('\n'),
          },
        ],
      })

      const text = response.choices[0]?.message?.content?.trim()
      if (!text || text.length === 0) {
        throw new Error('generate-patient-summary: empty response from model')
      }

      return text
    })

    // --------------------------------------------------------------- persist
    await step.run('persist', async () => {
      const supabase = createServiceClient()
      const now = new Date().toISOString()

      // Flatten the SOAP into note_content (clinician-facing SOAP note) and
      // keep the full structured payload (diagnoses + citations + meds + etc)
      // in structured_data for the review UI to render inline suggestions.
      const soapText = [
        `S: ${structured.soap.subjective}`,
        `O: ${structured.soap.objective}`,
        `A: ${structured.soap.assessment}`,
        `P: ${structured.soap.plan}`,
      ].join('\n\n')

      const { error: providerErr } = await supabase
        .from('provider_notes')
        .update({
          note_content: soapText,
          structured_data: {
            diagnoses: structured.diagnoses,
            medications: structured.medications,
            tests_ordered: structured.tests_ordered,
            follow_up: structured.follow_up,
            learning_note: structured.learning_note ?? null,
            missing_info: structured.missing_info ?? [],
          },
          updated_at: now,
        })
        .eq('id', context.provider_note_id)
        .eq('visit_id', context.visit_id)
      if (providerErr) throw new Error(`persist: provider_notes update failed: ${providerErr.message}`)

      // Upsert patient_notes — there's a unique index on visit_id so insert-
      // or-update keeps this step idempotent if Inngest replays.
      const { error: patientErr } = await supabase
        .from('patient_notes')
        .upsert(
          {
            visit_id: context.visit_id,
            content: patientSummary,
            language: 'en',
            status: 'draft',
            updated_at: now,
          },
          { onConflict: 'visit_id' },
        )
      if (patientErr) throw new Error(`persist: patient_notes upsert failed: ${patientErr.message}`)

      // Also flatten the most likely diagnosis + med list into visits.diagnosis
      // / medications so the print view can render without joining JSON.
      const primaryDiagnosis = structured.diagnoses.find(d => d.confidence === 'high')
        ?? structured.diagnoses[0]
      const medSummary = structured.medications
        .map(m => `${m.name} ${m.dosage} ${m.duration}`.trim())
        .join('; ')
      const testSummary = structured.tests_ordered.map(t => t.name).join('; ')
      const followUpSummary = structured.follow_up.map(f => `${f.when}: ${f.what}`).join('; ')

      const { error: visitErr } = await supabase
        .from('visits')
        .update({
          status: 'review',
          review_status: 'pending_review',
          diagnosis: primaryDiagnosis?.name ?? null,
          medications: medSummary || null,
          tests_ordered: testSummary || null,
          follow_up_instructions: followUpSummary || null,
          updated_at: now,
        })
        .eq('id', context.visit_id)
        .eq('clinic_id', context.clinic_id)
      if (visitErr) throw new Error(`persist: visits update failed: ${visitErr.message}`)

      logger.info('structure-dictation persisted', {
        visit_id: context.visit_id,
        diagnoses: structured.diagnoses.length,
        citations: structured.diagnoses.reduce((n, d) => n + d.citations.length, 0),
      })
    })

    // ------------------------------------------------------------ HMIS code
    // Map AI-suggested diagnoses onto Uganda HMIS 105 codes so the diocese's
    // monthly report (admin/reports/hmis105) reflects what the AI thought
    // happened. Source = 'ai'; the clinician can later flip to 'ai_confirmed'
    // or 'manual' from the review queue. Failures here do NOT roll back the
    // visit — HMIS coding is best-effort, the clinical note is the source of
    // truth.
    await step.run('code-diagnoses-hmis', async () => {
      if (structured.diagnoses.length === 0) return { coded: 0 }
      const supabase = createServiceClient()
      const codedIds = new Set<number>()

      for (const dx of structured.diagnoses) {
        // Confidence -> numeric for the visit_diagnosis_codes.confidence column.
        const confidence =
          dx.confidence === 'high' ? 0.9 :
          dx.confidence === 'medium' ? 0.6 : 0.3

        // Match priority:
        //   1. Exact ICD-10 (the model returned an icd10 string and it lives
        //      in hmis_diagnosis_codes.icd10_codes[])
        //   2. Fuzzy display_name match (case-insensitive substring)
        // We never insert without a match — bogus codes would corrupt the
        // monthly aggregation.
        let hmisId: number | null = null

        if (dx.icd10) {
          const { data: byIcd } = await supabase
            .from('hmis_diagnosis_codes')
            .select('id')
            .eq('is_active', true)
            .contains('icd10_codes', [dx.icd10])
            .limit(1)
            .maybeSingle()
          if (byIcd) hmisId = byIcd.id
        }

        if (hmisId === null && dx.name) {
          const { data: byName } = await supabase
            .from('hmis_diagnosis_codes')
            .select('id')
            .eq('is_active', true)
            .ilike('display_name', `%${dx.name.replace(/[%_]/g, '')}%`)
            .limit(1)
            .maybeSingle()
          if (byName) hmisId = byName.id
        }

        if (hmisId === null) {
          logger.warn('No HMIS match for AI diagnosis', { name: dx.name, icd10: dx.icd10 })
          continue
        }

        if (codedIds.has(hmisId)) continue // dedupe — same HMIS bucket twice

        // Insert ignoring conflicts on (visit_id, hmis_code_id) so Inngest
        // replays don't double-count.
        const { error } = await supabase
          .from('visit_diagnosis_codes')
          .upsert(
            {
              visit_id: context.visit_id,
              hmis_code_id: hmisId,
              confidence,
              source: 'ai',
              coded_by: null,
            },
            { onConflict: 'visit_id,hmis_code_id', ignoreDuplicates: true },
          )
        if (error) {
          logger.warn('HMIS code insert failed', { hmis_code_id: hmisId, error: error.message })
          continue
        }
        codedIds.add(hmisId)
      }

      return { coded: codedIds.size }
    })

    return { visit_id, status: 'review' }
  },
)
