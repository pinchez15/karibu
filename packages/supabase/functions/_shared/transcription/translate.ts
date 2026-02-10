// Sunbird AI translation: translates local language transcripts to English
// Uses NLLB (No Language Left Behind) model via Sunbird API

import { createLogger } from '../logger.ts'
import { fetchWithRetry } from '../retry.ts'
import type { TranslationResult } from './types.ts'

const logger = createLogger('sunbird-translation')

const SUNBIRD_TRANSLATE_URL = 'https://api.sunbird.ai/tasks/nllb_translate'

/**
 * Translate a local language transcript to English using Sunbird AI.
 * Called after Sunbird transcription for non-English encounters.
 *
 * @param text - The transcript text to translate
 * @param sourceLanguage - Source language code. Use 'lug' for Luganda, 'ach' for Acholi, etc.
 *                         When the specific language is unknown, defaults to 'lug' (most common).
 */
export async function translateToEnglish(
  text: string,
  sourceLanguage: string = 'lug'
): Promise<TranslationResult> {
  const apiKey = Deno.env.get('SUNBIRD_API_KEY')
  if (!apiKey) {
    throw new Error('SUNBIRD_API_KEY environment variable is not set')
  }

  if (!text || text.trim() === '') {
    return {
      translated_text: '',
      source_language: sourceLanguage,
      target_language: 'eng',
      raw_response: null,
    }
  }

  const op = logger.startOperation('translate_to_english', {
    source_language: sourceLanguage,
    text_length: text.length,
  })

  const response = await fetchWithRetry(
    SUNBIRD_TRANSLATE_URL,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source_language: sourceLanguage,
        target_language: 'eng',
        text,
      }),
    },
    'sunbird_translate',
    {
      maxRetries: 3,
      shouldRetry: (error) => {
        if (error.message.includes('429') || error.message.includes('HTTP 5')) {
          return true
        }
        return false
      },
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Sunbird translation API error (${response.status}): ${errorText}`)
  }

  const rawResponse = await response.json()

  const result: TranslationResult = {
    translated_text: rawResponse.output || rawResponse.translated_text || '',
    source_language: sourceLanguage,
    target_language: 'eng',
    raw_response: rawResponse,
  }

  op.success({
    translated_length: result.translated_text.length,
    source_language: sourceLanguage,
  })

  return result
}
