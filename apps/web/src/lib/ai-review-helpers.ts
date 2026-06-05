/** Timeline-tier AI notes (docs/ai-clinical-assist.md). Interruptive alerts use visit_critical_alerts. */

export type AiReviewSuggestionLike = {
  clinician_response: string | null
  display_tier?: string | null
  phase?: string | null
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
