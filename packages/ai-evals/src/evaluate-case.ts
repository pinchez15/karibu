import OpenAI from 'openai'
import type { GoldenCase } from './golden-cases.js'
import { DEFAULT_DRUGS, DEFAULT_LABS, MOCK_CORPUS_CHUNKS } from './mock-corpus.js'
import {
  STRUCTURING_MODEL,
  SYSTEM_PROMPT,
  formatChunksForPrompt,
  parseModelResponse,
  validateSuggestions,
  type RetrievedChunk,
  type ValidatedSuggestion,
} from './validate-suggestion.js'

export interface EvaluateCaseInput {
  goldenCase: GoldenCase
  chunks?: RetrievedChunk[]
  labsAvailable?: string[]
  drugsAvailable?: string[]
}

export interface EvaluateCaseResult {
  suggestions: ValidatedSuggestion[]
  rawResponse: string
}

function formatVitalsLine(vitals: GoldenCase['vitals']): string {
  const v = vitals
  return `T ${v.temp_c ?? '—'}°C, BP ${v.bp_systolic ?? '—'}/${v.bp_diastolic ?? '—'}, HR ${v.pulse_bpm ?? '—'}, RR ${v.resp_rate ?? '—'}, SpO2 ${v.spo2_pct ?? '—'}%, Wt ${v.weight_kg ?? '—'}kg, Ht ${v.height_cm ?? '—'}cm`
}

function buildUserMessage(input: EvaluateCaseInput, chunks: RetrievedChunk[]): string {
  const { goldenCase } = input
  const labs = input.labsAvailable ?? DEFAULT_LABS
  const drugs = input.drugsAvailable ?? DEFAULT_DRUGS

  return [
    `Patient: ${goldenCase.patientSex ?? 'unknown sex'}, age ${goldenCase.patientAgeYears ?? 'unknown'} years.`,
    `Chief complaint: ${goldenCase.chiefComplaint}.`,
    formatVitalsLine(goldenCase.vitals),
    '',
    'Clinician note:',
    goldenCase.clinicianNote,
    '',
    'Available labs at this clinic:',
    labs.length > 0 ? labs.map((l) => `- ${l}`).join('\n') : '(none recorded)',
    '',
    'Available drugs at this clinic:',
    drugs.length > 0 ? drugs.map((d) => `- ${d}`).join('\n') : '(none recorded)',
    '',
    'Retrieved guideline excerpts:',
    formatChunksForPrompt(chunks),
  ].join('\n')
}

/**
 * Run one golden case through the same prompt + validation path as review-clinician-note.ts.
 */
export async function evaluateCase(
  openai: OpenAI,
  input: EvaluateCaseInput,
): Promise<EvaluateCaseResult> {
  const chunks = input.chunks ?? MOCK_CORPUS_CHUNKS
  const allowedChunkIds = new Set(chunks.map((c) => c.id))

  const response = await openai.chat.completions.create({
    model: STRUCTURING_MODEL,
    response_format: { type: 'json_object' },
    temperature: 0.2,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserMessage(input, chunks) },
    ],
  })

  const raw = response.choices[0]?.message?.content
  if (!raw) {
    throw new Error('evaluateCase: empty response from model')
  }

  const parsed = parseModelResponse(raw)
  const suggestions = validateSuggestions(parsed, { allowedChunkIds })

  return { suggestions, rawResponse: raw }
}

export interface AssertionResult {
  pass: boolean
  message: string
}

export function assertCaseExpectations(
  goldenCase: GoldenCase,
  suggestions: ValidatedSuggestion[],
): AssertionResult {
  if (goldenCase.expectedTypes === 'none') {
    if (suggestions.length > 0) {
      return {
        pass: false,
        message: `Expected no suggestions but got ${suggestions.length}: ${suggestions.map((s) => s.type).join(', ')}`,
      }
    }
    return { pass: true, message: 'No suggestions (as expected)' }
  }

  if (suggestions.length === 0) {
    return {
      pass: false,
      message: `Expected one of [${goldenCase.expectedTypes.join(', ')}] but model returned no high-confidence cited suggestions`,
    }
  }

  const actualTypes = new Set(suggestions.map((s) => s.type))
  const matched = goldenCase.expectedTypes.some((t) => actualTypes.has(t as ValidatedSuggestion['type']))
  if (!matched) {
    return {
      pass: false,
      message: `Expected one of [${goldenCase.expectedTypes.join(', ')}] but got [${[...actualTypes].join(', ')}]`,
    }
  }

  if (goldenCase.requireCitation) {
    const hasCitation = suggestions.some((s) => s.citation_ids.length > 0)
    if (!hasCitation) {
      return { pass: false, message: 'Expected at least one suggestion with valid citation_ids' }
    }
  }

  return {
    pass: true,
    message: `Matched expected type(s); got [${[...actualTypes].join(', ')}]`,
  }
}
