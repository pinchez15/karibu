// Sunbird AI transcription provider (Ugandan local languages)
// Supports: Luganda, Acholi, Runyankole, Ateso, Lugbara, Swahili, and code-switched variants

import { createLogger } from '../logger.ts'
import { fetchWithRetry } from '../retry.ts'
import type { TranscriptionResult, SpeakerSegment } from './types.ts'

const logger = createLogger('sunbird-transcription')

const SUNBIRD_API_URL = 'https://api.sunbird.ai/tasks/stt'

/**
 * Transcribe audio using Sunbird AI's speech-to-text API.
 * Used for local language encounters (Luganda, Acholi, Runyankole, Ateso, Lugbara, Swahili).
 * Sunbird auto-detects the specific language when 'mul' (multilingual) adapter is used.
 */
export async function transcribeWithSunbird(
  audioFile: Blob,
  filename: string = 'recording.m4a'
): Promise<TranscriptionResult> {
  const apiKey = Deno.env.get('SUNBIRD_API_KEY')
  if (!apiKey) {
    throw new Error('SUNBIRD_API_KEY environment variable is not set')
  }

  const op = logger.startOperation('sunbird_transcription', {
    file_size: audioFile.size,
    filename,
  })

  // Sunbird limit: 100MB file size, 10 minutes processed
  const MAX_FILE_SIZE = 100 * 1024 * 1024
  if (audioFile.size > MAX_FILE_SIZE) {
    throw new Error(
      `Audio file too large for Sunbird AI (${(audioFile.size / 1024 / 1024).toFixed(1)}MB). Max: 100MB.`
    )
  }

  const formData = new FormData()
  formData.append('audio', audioFile, filename)
  // Use 'mul' (multilingual) to let Sunbird auto-detect the local language
  formData.append('language', 'mul')
  formData.append('adapter', 'mul')

  const response = await fetchWithRetry(
    SUNBIRD_API_URL,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData,
    },
    'sunbird_stt',
    {
      maxRetries: 3,
      initialDelayMs: 2000, // Sunbird may be slower; give more backoff time
      shouldRetry: (error) => {
        // Retry on 429 (rate limit) and 5xx
        if (error.message.includes('429') || error.message.includes('HTTP 5')) {
          return true
        }
        return false
      },
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Sunbird AI API error (${response.status}): ${errorText}`)
  }

  const rawResponse = await response.json()

  // Parse Sunbird's diarization output
  // Format: "Speaker 1: ...\nSpeaker 2: ..."
  const diarization = parseSunbirdDiarization(
    rawResponse.formatted_diarization_output || ''
  )

  const result: TranscriptionResult = {
    transcript: rawResponse.audio_transcription || '',
    language: 'local',
    diarization,
    provider: 'sunbird',
    confidence: null,
    audio_trimmed: rawResponse.was_audio_trimmed || false,
    original_duration_minutes: rawResponse.original_duration_minutes || null,
    raw_response: rawResponse,
  }

  op.success({
    transcript_length: result.transcript.length,
    segments: diarization.length,
    audio_trimmed: result.audio_trimmed,
    duration_minutes: result.original_duration_minutes,
  })

  return result
}

/**
 * Parse Sunbird's formatted diarization output into SpeakerSegment array.
 * Input format: "Speaker 1: Hello doctor\nSpeaker 2: What brings you in today?"
 */
function parseSunbirdDiarization(output: string): SpeakerSegment[] {
  if (!output || output.trim() === '') return []

  const segments: SpeakerSegment[] = []
  const lines = output.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Match "Speaker N: text" pattern
    const match = trimmed.match(/^(Speaker \d+):\s*(.+)$/)
    if (match) {
      segments.push({
        speaker: match[1],
        text: match[2],
      })
    } else {
      // Line without speaker label — append to previous segment or create new one
      if (segments.length > 0) {
        segments[segments.length - 1].text += ' ' + trimmed
      } else {
        segments.push({
          speaker: 'Speaker 1',
          text: trimmed,
        })
      }
    }
  }

  return segments
}
