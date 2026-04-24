import OpenAI from 'openai'

// Healthcare-tuned model. Set via env so we can swap models without code change
// when OpenAI ships a newer healthcare release. Falls back to gpt-4o so dev
// envs without the medical-tier model still work.
export const MEDICAL_MODEL = process.env.OPENAI_MEDICAL_MODEL || 'gpt-4o'

let _client: OpenAI | null = null
export function openai(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set')
    _client = new OpenAI({ apiKey })
  }
  return _client
}
