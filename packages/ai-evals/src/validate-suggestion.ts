import { z } from 'zod'

/**
 * Validation logic mirrored from apps/web/src/inngest/functions/review-clinician-note.ts.
 * Keeps eval assertions aligned with production suggestion filtering.
 */

export const SUGGESTION_TYPES = [
  'ask_lab',
  'ask_dx',
  'ask_med',
  'ask_history',
  'ask_red_flag',
] as const

export type SuggestionType = (typeof SUGGESTION_TYPES)[number]

export const VALID_TYPES = new Set<string>(SUGGESTION_TYPES)

export const VALID_CONFIDENCES = new Set(['high', 'medium', 'low'])

export const SYSTEM_PROMPT = `You are a quiet senior colleague at a Health Centre III in Uganda — a tap on the shoulder, not a lecture. The clinician is almost always on the right track; they may simply not have documented the next step yet. Only ask a short question when something might change management if overlooked. Do NOT restructure the note. Do NOT comment on style.

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

export const STRUCTURING_MODEL = process.env.OPENAI_STRUCTURING_MODEL || 'gpt-4o-mini'

export interface RetrievedChunk {
  id: number
  document_id: number
  document_title: string
  document_slug: string
  source_org: string | null
  source_year: number | null
  section: string | null
  section_anchor: string | null
  content: string
  distance: number
}

export interface RawSuggestion {
  type?: string
  question?: string
  reasoning?: string
  citation_ids?: unknown[]
  confidence?: string
}

export interface ValidatedSuggestion {
  type: SuggestionType
  question: string
  reasoning: string
  citation_ids: number[]
  confidence: 'high' | 'medium' | 'low'
}

const modelResponseSchema = z.object({
  suggestions: z
    .array(
      z.object({
        type: z.string().optional(),
        question: z.string().optional(),
        reasoning: z.string().optional(),
        citation_ids: z.array(z.unknown()).optional(),
        confidence: z.string().optional(),
      }),
    )
    .optional(),
})

export function stripChunkCitations(text: string): string {
  return text.replace(/\[chunk_id=\d+]/g, '').replace(/\s{2,}/g, ' ').trim()
}

function questionSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.split(/\s+/).filter((w) => w.length > 2))
  const wordsB = new Set(b.split(/\s+/).filter((w) => w.length > 2))
  if (wordsA.size === 0 || wordsB.size === 0) return 0
  let intersection = 0
  for (const w of wordsA) if (wordsB.has(w)) intersection++
  return intersection / (wordsA.size + wordsB.size - intersection)
}

export function dedupeSuggestions(items: ValidatedSuggestion[]): ValidatedSuggestion[] {
  const kept: ValidatedSuggestion[] = []
  for (const candidate of items) {
    const normQ = candidate.question
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const duplicate = kept.some((existing) => {
      const normExisting = existing.question
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      return existing.type === candidate.type && questionSimilarity(normExisting, normQ) >= 0.72
    })
    if (!duplicate) kept.push(candidate)
  }
  return kept
}

export interface ValidateSuggestionsOptions {
  allowedChunkIds: Set<number>
  /** Production keeps only high-confidence suggestions at launch. */
  minConfidence?: 'high' | 'medium' | 'low'
  maxSuggestions?: number
  onDrop?: (reason: string, suggestion: RawSuggestion) => void
}

export function validateSuggestions(
  raw: RawSuggestion[],
  opts: ValidateSuggestionsOptions,
): ValidatedSuggestion[] {
  const { allowedChunkIds, minConfidence = 'high', maxSuggestions = 3, onDrop } = opts
  const validated: ValidatedSuggestion[] = []

  for (const s of raw) {
    if (!s.type || !VALID_TYPES.has(s.type)) {
      onDrop?.('invalid type', s)
      continue
    }
    if (!s.question || typeof s.question !== 'string' || s.question.trim().length < 5) {
      onDrop?.('invalid question', s)
      continue
    }
    if (!s.reasoning || typeof s.reasoning !== 'string') {
      onDrop?.('invalid reasoning', s)
      continue
    }
    if (!s.confidence || !VALID_CONFIDENCES.has(s.confidence)) {
      onDrop?.('invalid confidence', s)
      continue
    }
    if (minConfidence === 'high' && s.confidence !== 'high') {
      onDrop?.('confidence below threshold', s)
      continue
    }
    if (minConfidence === 'medium' && s.confidence === 'low') {
      onDrop?.('confidence below threshold', s)
      continue
    }

    const citationIds = Array.isArray(s.citation_ids)
      ? (s.citation_ids
          .map((x) => (typeof x === 'number' ? x : Number(x)))
          .filter((n) => Number.isFinite(n)) as number[])
      : []
    const validCitations = citationIds.filter((id) => allowedChunkIds.has(id))
    if (validCitations.length === 0) {
      onDrop?.('no valid citations', s)
      continue
    }

    validated.push({
      type: s.type as SuggestionType,
      question: s.question.trim(),
      reasoning: stripChunkCitations(s.reasoning.trim()),
      citation_ids: validCitations,
      confidence: s.confidence as ValidatedSuggestion['confidence'],
    })
  }

  return dedupeSuggestions(validated).slice(0, maxSuggestions)
}

export function formatChunksForPrompt(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return 'No relevant guideline excerpts retrieved.'
  return chunks
    .map(
      (c) =>
        `[chunk_id=${c.id}] ${c.document_title}${c.section ? ` — ${c.section}` : ''}${c.source_year ? ` (${c.source_year})` : ''}\n${c.content}`,
    )
    .join('\n\n---\n\n')
}

export function parseModelResponse(raw: string): RawSuggestion[] {
  const parsed = JSON.parse(raw) as unknown
  const result = modelResponseSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(`model returned invalid JSON shape: ${result.error.message}`)
  }
  return result.data.suggestions ?? []
}
