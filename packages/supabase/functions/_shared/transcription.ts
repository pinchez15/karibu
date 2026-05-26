/**
 * Prompting for OpenAI audio/transcription models (gpt-4o-transcribe).
 * A domain vocabulary bias materially reduces homophone errors on short
 * short clips and homophones (e.g. "patient" → "fish").
 *
 * @see https://platform.openai.com/docs/guides/speech-to-text#prompting
 */

/** ~200 tokens — vocabulary + style hints for clinician dictation. */
export const CLINICAL_TRANSCRIPTION_PROMPT =
  'Clinical clinician dictation in English. Use standard medical spelling and punctuation. ' +
  'Common words: patient, patients, presented, presents, chief complaint, history of present illness, ' +
  'review of systems, physical exam, examination, vital signs, temperature, blood pressure, pulse, ' +
  'respiratory rate, diagnosis, assessment, plan, follow-up, discharge, admission, pharmacy, laboratory, ' +
  'malaria, RDT, antimalarial, artemether, lumefantrine, paracetamol, amoxicillin, ORS, hemoglobin, ' +
  'glucose, pregnancy, gravida, ANC, antenatal, pediatric, adult, male, female.'

/** Max continuation text appended after the base prompt (chars, conservative vs 224-token cap). */
const MAX_CONTINUATION_CHARS = 400

const SECTION_HINTS: Record<string, string> = {
  ChiefComplaint: 'chief complaint',
  Hpi: 'history of present illness',
  PhysicalExam: 'physical examination and vital signs',
  FamilySocialHistory: 'family and social history',
  Diagnosis: 'diagnosis or working impression',
  AssessmentPlan: 'assessment and plan',
  Medications: 'medications and prescriptions',
  TestsOrdered: 'laboratory tests and investigations ordered',
  FollowUpInstructions: 'follow-up instructions',
  AdditionalNote: 'additional clinical notes',
}

/**
 * Build the `prompt` field for /v1/audio/transcriptions.
 * [section] biases vocabulary toward that part of the SOAP-style note.
 * [continuation] is existing text in that section (re-dictate / append).
 */
export function buildTranscriptionPrompt(
  continuation?: string | null,
  section?: string | null,
): string {
  const sectionLabel = section ? SECTION_HINTS[section] : null
  let prompt = CLINICAL_TRANSCRIPTION_PROMPT
  if (sectionLabel) {
    prompt += ` The clinician is dictating the ${sectionLabel} section of a visit note.`
  }
  const tail = continuation?.trim()
  if (!tail) return prompt
  const slice = tail.length > MAX_CONTINUATION_CHARS
    ? tail.slice(-MAX_CONTINUATION_CHARS)
    : tail
  return `${prompt}\n\nExisting text in this section: ${slice}`
}
