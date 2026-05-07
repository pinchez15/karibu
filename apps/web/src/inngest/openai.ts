import OpenAI from 'openai'

// Two models, tuned to cost vs. capability:
//
//   STRUCTURING_MODEL — runs on every visit. SOAP formatting from a
//                       clinician's free-text note. gpt-4o-mini handles this
//                       reliably at ~10× lower cost than gpt-4o, which matters
//                       at HC III scale (every visit gets touched by an LLM).
//
//   MEDICAL_MODEL     — reserved for the patient-summary translation step
//                       and any clinician-flagged complex case. Higher tier
//                       for the patient-facing prose.
//
// Both are env-overridable so we can swap models without redeploying.
export const STRUCTURING_MODEL = process.env.OPENAI_STRUCTURING_MODEL || 'gpt-4o-mini'
export const MEDICAL_MODEL = process.env.OPENAI_MEDICAL_MODEL || 'gpt-4o-mini'

let _client: OpenAI | null = null
export function openai(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set')
    _client = new OpenAI({ apiKey })
  }
  return _client
}
