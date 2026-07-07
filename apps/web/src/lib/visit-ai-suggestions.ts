import 'server-only'

import { createServiceClient } from '@/lib/supabase'
import { filterTimelineAiNotes, type VisitAiReviewSuggestion } from '@/lib/ai-review-helpers'

export type { VisitAiReviewSuggestion }

/**
 * Load unanswered AI review suggestions for a visit with citation metadata.
 * Shared by the visit page (SSR) and lightweight client polling.
 */
export async function loadVisitAiReviewSuggestions(
  visitId: string,
  clinicId: string,
  options?: { documentationComplete?: boolean },
): Promise<VisitAiReviewSuggestion[]> {
  const supabase = createServiceClient()
  const docComplete = options?.documentationComplete ?? false

  const { data: suggestionRows } = await supabase
    .from('ai_review_suggestions')
    .select(
      'id, suggestion_type, question, reasoning, citation_ids, confidence, clinician_response, phase, display_tier',
    )
    .eq('visit_id', visitId)
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: true })

  const allCitationIds = Array.from(
    new Set((suggestionRows ?? []).flatMap((s) => (s.citation_ids as number[] | null) ?? [])),
  )

  const citationsById = new Map<
    number,
    {
      id: number
      document_title: string
      document_slug: string
      section: string | null
      section_anchor: string | null
    }
  >()

  if (allCitationIds.length > 0) {
    const { data: chunks } = await supabase
      .from('medical_corpus')
      .select('id, section, section_anchor, document:medical_documents(slug, title)')
      .in('id', allCitationIds)
    for (const c of chunks ?? []) {
      const doc = (c as unknown as { document?: { slug?: string; title?: string } }).document
      citationsById.set((c as { id: number }).id, {
        id: (c as { id: number }).id,
        document_title: doc?.title ?? 'Reference',
        document_slug: doc?.slug ?? '',
        section: (c as { section?: string | null }).section ?? null,
        section_anchor: (c as { section_anchor?: string | null }).section_anchor ?? null,
      })
    }
  }

  const allSuggestions: VisitAiReviewSuggestion[] = (suggestionRows ?? []).map((s) => ({
    id: s.id as string,
    suggestion_type: s.suggestion_type as string,
    question: s.question as string,
    reasoning: s.reasoning as string,
    citation_ids: (s.citation_ids as number[] | null) ?? [],
    confidence: s.confidence as 'high' | 'medium' | 'low',
    clinician_response: s.clinician_response as
      | 'considered_proceeded'
      | 'reopened_note'
      | 'dismissed'
      | null,
    citations: ((s.citation_ids as number[] | null) ?? [])
      .map((id) => citationsById.get(id))
      .filter((c): c is NonNullable<typeof c> => c !== undefined),
  }))

  return docComplete ? [] : filterTimelineAiNotes(allSuggestions)
}
