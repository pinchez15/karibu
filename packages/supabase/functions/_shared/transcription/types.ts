// Shared transcription types for dual-provider support (OpenAI + Sunbird AI)

export interface TranscriptionResult {
  /** Full transcribed text */
  transcript: string
  /** Source language: 'eng' for English, 'local' for Ugandan languages */
  language: string
  /** Speaker-labeled segments if diarization is available */
  diarization: SpeakerSegment[]
  /** Which provider handled this transcription */
  provider: 'openai' | 'sunbird'
  /** Confidence score if available from provider */
  confidence: number | null
  /** Whether Sunbird trimmed the audio (>10min) */
  audio_trimmed: boolean
  /** Original audio duration in minutes, if reported */
  original_duration_minutes: number | null
  /** Full provider response preserved for debugging */
  raw_response: unknown
}

export interface SpeakerSegment {
  /** Speaker label: "Speaker 1", "Speaker 2", etc. */
  speaker: string
  /** Text spoken by this speaker */
  text: string
  /** Start timestamp in seconds, if available */
  start?: number
  /** End timestamp in seconds, if available */
  end?: number
}

export interface TranslationResult {
  /** Translated text (English) */
  translated_text: string
  /** Source language that was translated from */
  source_language: string
  /** Target language (always 'eng') */
  target_language: string
  /** Full provider response for debugging */
  raw_response: unknown
}

export type TranscriptionProvider = 'openai' | 'sunbird'

export interface TranscribeOptions {
  /** The audio file as a Blob */
  audioFile: Blob
  /** Source language: 'eng' or 'local' */
  language: string
  /** Original filename for the upload */
  filename?: string
}
