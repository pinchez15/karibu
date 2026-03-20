// Transcription router: routes audio to the correct provider based on language toggle
// Simple model: English → OpenAI, Local Language → Sunbird AI

import { createLogger } from '../logger.ts'
import { transcribeWithOpenAI } from './openai.ts'
import { transcribeWithSunbird } from './sunbird.ts'
import type { TranscriptionResult, TranscribeOptions, TranscriptionProvider } from './types.ts'

const logger = createLogger('transcription-router')

/**
 * Determine which provider to use based on the language toggle.
 * 'eng' → OpenAI (best for English)
 * 'local' → Sunbird AI (handles all Ugandan languages)
 */
export function getProvider(language: string): TranscriptionProvider {
  if (language === 'eng') return 'openai'
  if (language === 'local') return 'sunbird'
  // Default fallback to OpenAI for unknown values
  logger.warn('Unknown language value, defaulting to OpenAI', { language })
  return 'openai'
}

/**
 * Transcribe audio by routing to the correct provider based on language.
 * This is the main entry point for the transcription pipeline.
 */
export async function transcribe(options: TranscribeOptions): Promise<TranscriptionResult> {
  const { audioFile, language, filename } = options
  const provider = getProvider(language)

  logger.info('Routing transcription', {
    language,
    provider,
    file_size: audioFile.size,
  })

  try {
    if (provider === 'openai') {
      return await transcribeWithOpenAI(audioFile, filename)
    } else {
      // Check if Sunbird is configured before attempting
      const sunbirdKey = Deno.env.get('SUNBIRD_API_KEY')
      if (!sunbirdKey) {
        throw new Error(
          'Local language transcription is not yet available. Please select English for now.'
        )
      }
      return await transcribeWithSunbird(audioFile, filename)
    }
  } catch (error) {
    logger.error('Transcription failed', { language, provider }, error as Error)

    // For Swahili/unknown, could fall back to the other provider
    // For now, just rethrow — fallback logic can be added later
    throw error
  }
}
