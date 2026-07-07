import type { NoteSectionKey } from '@/lib/clinical-note-sections'

/** Timeline-tier AI notes (docs/ai-clinical-assist.md). Interruptive alerts use visit_critical_alerts. */

export type AiReviewSuggestionLike = {
  clinician_response: string | null
  display_tier?: string | null
  phase?: string | null
}

export type VisitAiReviewSuggestion = {
  id: string
  suggestion_type: string
  question: string
  reasoning: string
  citation_ids: number[]
  confidence: 'high' | 'medium' | 'low'
  clinician_response: 'considered_proceeded' | 'reopened_note' | 'dismissed' | null
  citations?: Array<{
    id: number
    document_title: string
    document_slug: string
    section: string | null
    section_anchor: string | null
  }>
}

export const ACTIONABLE_AI_SUGGESTION_TYPES = new Set([
  'ask_lab',
  'ask_med',
  'ask_dx',
  'ask_history',
  'ask_red_flag',
])

export type DictationIncorporate = {
  suggestionId: string
  section: NoteSectionKey
  prefill: string
  openLabPicker: boolean
  openRxPicker: boolean
}

export function filterTimelineAiNotes<T extends AiReviewSuggestionLike>(
  suggestions: T[],
): T[] {
  return suggestions
    .filter(
      (s) =>
        !s.clinician_response &&
        (s.display_tier ?? 'timeline') === 'timeline' &&
        (s.phase === 'draft' || s.phase === 'lab' || s.phase == null),
    )
    .slice(0, 3)
}

/** Map an AI suggestion to editor prefill (mirrors Android incorporationFor). */
export function incorporationFor(suggestion: Pick<VisitAiReviewSuggestion, 'id' | 'suggestion_type' | 'question'>): DictationIncorporate {
  const section: NoteSectionKey = (() => {
    switch (suggestion.suggestion_type) {
      case 'ask_lab':
        return 'TestsOrdered'
      case 'ask_dx':
        return 'Diagnosis'
      case 'ask_med':
        return 'Medications'
      case 'ask_history':
        return 'Hpi'
      case 'ask_red_flag':
        return 'PhysicalExam'
      default:
        return 'AssessmentPlan'
    }
  })()

  return {
    suggestionId: suggestion.id,
    section,
    prefill: `Consider: ${suggestion.question.trim()}`,
    openLabPicker: suggestion.suggestion_type === 'ask_lab',
    openRxPicker: suggestion.suggestion_type === 'ask_med',
  }
}

export function stripCitationArtifacts(reasoning: string): string {
  return reasoning.replace(/\[chunk_id=\d+]/g, '').replace(/\s{2,}/g, ' ').trim()
}
