'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Sparkles, ExternalLink, Loader2 } from 'lucide-react'
import {
  ACTIONABLE_AI_SUGGESTION_TYPES,
  stripCitationArtifacts,
  type VisitAiReviewSuggestion,
} from '@/lib/ai-review-helpers'
import { recordReviewResponse } from './review-actions'

/**
 * AI review question. Surfaces only when the AI would disagree with the
 * clinician with high confidence, citing a real chunk from the public
 * /library evidence corpus.
 *
 * The clinician is the medical authority. This is a question, not a verdict.
 */

export type ReviewSuggestion = VisitAiReviewSuggestion

interface ReviewQuestionBannerProps {
  suggestion: ReviewSuggestion
  /** Render inside AiNotesTimeline expander (no outer card chrome). */
  compact?: boolean
  onIncorporate?: (suggestion: ReviewSuggestion) => void
}

export function ReviewQuestionBanner({
  suggestion,
  compact = false,
  onIncorporate,
}: ReviewQuestionBannerProps) {
  const [pending, startTransition] = useTransition()
  const [dismissed, setDismissed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (dismissed) return null

  const mohSilent =
    suggestion.citation_ids.length === 0 &&
    (!suggestion.citations || suggestion.citations.length === 0)
  const canIncorporate = ACTIONABLE_AI_SUGGESTION_TYPES.has(suggestion.suggestion_type)

  function respond(
    response: 'considered_proceeded' | 'reopened_note' | 'dismissed',
    afterSuccess?: () => void,
  ) {
    setError(null)
    startTransition(async () => {
      const r = await recordReviewResponse(suggestion.id, response)
      if (!r.success) {
        setError(r.error)
        return
      }
      setDismissed(true)
      afterSuccess?.()
    })
  }

  const body = (
    <>
      {!compact && (
        <div className="flex items-start gap-2">
          <Sparkles className="h-5 w-5 text-amber mt-0.5 shrink-0" />
          <div>
            <p className="text-base font-semibold text-ink leading-snug">{suggestion.question}</p>
          </div>
        </div>
      )}
      {compact && (
        <p className="text-sm text-body leading-relaxed">
          {stripCitationArtifacts(suggestion.reasoning)}
        </p>
      )}
      {!compact && (
        <p className="text-sm text-body mt-2 leading-relaxed">
          {stripCitationArtifacts(suggestion.reasoning)}
        </p>
      )}

      {mohSilent && (
        <p className="text-xs text-muted-foreground">
          No Uganda guideline on file — general clinical suggestion.
        </p>
      )}

      {suggestion.citations && suggestion.citations.length > 0 && (
        <div className="bg-card border border-border rounded-md p-3">
          <div className="kh-meta mb-1.5">SOURCE</div>
          <ul className="text-sm space-y-1">
            {suggestion.citations.map((c) => {
              const href = c.section_anchor
                ? `/library/${c.document_slug}#${c.section_anchor}`
                : `/library/${c.document_slug}`
              return (
                <li key={c.id}>
                  <Link
                    href={href}
                    className="text-cobalt hover:text-cobalt-deep inline-flex items-center gap-1 text-sm"
                    target="_blank"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {c.document_title}
                    {c.section ? ` — ${c.section}` : ''}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {error && <div className="text-xs text-destructive">{error}</div>}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {canIncorporate && (
          <button
            type="button"
            onClick={() =>
              respond('reopened_note', () => onIncorporate?.(suggestion))
            }
            disabled={pending}
            className="bg-amber text-amber-ink rounded-md px-3.5 py-2 text-sm font-semibold disabled:opacity-60 inline-flex items-center gap-1.5"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Incorporate
          </button>
        )}
        <button
          type="button"
          onClick={() => respond('considered_proceeded')}
          disabled={pending}
          className="bg-card border border-border text-body rounded-md px-3.5 py-2 text-sm font-medium disabled:opacity-60"
        >
          Acknowledge
        </button>
        <button
          type="button"
          onClick={() => respond('dismissed')}
          disabled={pending}
          className="text-sm text-muted-foreground underline disabled:opacity-60"
        >
          Dismiss
        </button>
      </div>
    </>
  )

  if (compact) {
    return <div className="pt-2 space-y-3">{body}</div>
  }

  return (
    <div className="bg-amber-soft border border-amber/40 rounded-xl p-5 space-y-3">
      {body}
    </div>
  )
}
