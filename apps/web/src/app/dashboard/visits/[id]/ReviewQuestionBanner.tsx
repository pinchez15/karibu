'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Sparkles, ExternalLink, Loader2 } from 'lucide-react'
import { recordReviewResponse } from './review-actions'

/**
 * AI review question. Surfaces only when the AI would disagree with the
 * clinician with high confidence, citing a real chunk from the public
 * /library evidence corpus. Two responses:
 *   - "Already considered, proceed" → logs response, banner dismisses
 *   - "Re-open note" → opens the editor for the clinician to edit
 *
 * The clinician is the medical authority. This is a question, not a
 * verdict. Most visits show no banner.
 */

export interface ReviewSuggestion {
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

interface ReviewQuestionBannerProps {
  suggestion: ReviewSuggestion
}

export function ReviewQuestionBanner({ suggestion }: ReviewQuestionBannerProps) {
  const [pending, startTransition] = useTransition()
  const [dismissed, setDismissed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (dismissed) return null

  function respond(response: 'considered_proceeded' | 'reopened_note') {
    setError(null)
    startTransition(async () => {
      const r = await recordReviewResponse(suggestion.id, response)
      if (!r.success) {
        setError(r.error)
        return
      }
      setDismissed(true)
      // The "Re-open note" path is handled by the parent listening to
      // dismissed via DOM events; for now, the clinician scrolls up to
      // the Clinician Note card and clicks Edit.
    })
  }

  return (
    <div className="bg-amber-soft border border-amber/40 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2 text-amber-ink kh-meta">
        <Sparkles className="h-4 w-4 text-amber" />
        A QUESTION BEFORE YOU PROCEED
      </div>

      <div>
        <p className="text-base font-semibold text-ink leading-snug">{suggestion.question}</p>
        <p className="text-sm text-body mt-2 leading-relaxed">{suggestion.reasoning}</p>
      </div>

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

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={() => respond('reopened_note')}
          disabled={pending}
          className="bg-amber text-amber-ink rounded-md px-3.5 py-2 text-sm font-semibold disabled:opacity-60 inline-flex items-center gap-1.5"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Re-open note
        </button>
        <button
          type="button"
          onClick={() => respond('considered_proceeded')}
          disabled={pending}
          className="bg-card border border-border text-body rounded-md px-3.5 py-2 text-sm font-medium disabled:opacity-60"
        >
          Already considered, proceed
        </button>
      </div>
    </div>
  )
}
