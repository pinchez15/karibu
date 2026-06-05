'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import Link from 'next/link'
import type { ReviewSuggestion } from './ReviewQuestionBanner'
import { ReviewQuestionBanner } from './ReviewQuestionBanner'

interface AiNotesTimelineProps {
  suggestions: ReviewSuggestion[]
}

/**
 * Collapsed “AI notes” stack on the visit timeline (docs/ai-clinical-assist.md).
 * Each note expands in place; parent already filters to timeline tier + unsigned visit.
 */
export function AiNotesTimeline({ suggestions }: AiNotesTimelineProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (suggestions.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-amber" />
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          AI notes
        </h3>
        <span className="text-xs text-muted-foreground">({suggestions.length})</span>
      </div>
      {suggestions.map((s) => {
        const open = expandedId === s.id
        return (
          <div
            key={s.id}
            className="bg-card border border-border rounded-lg overflow-hidden"
          >
            <button
              type="button"
              className="w-full flex items-start gap-2 p-3 text-left hover:bg-muted/40"
              onClick={() => setExpandedId(open ? null : s.id)}
            >
              {open ? (
                <ChevronUp className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
              )}
              <span className="text-sm font-medium text-ink line-clamp-2">{s.question}</span>
            </button>
            {open && (
              <div className="px-3 pb-3 border-t border-border">
                <ReviewQuestionBanner suggestion={s} compact />
              </div>
            )}
          </div>
        )
      })}
      <p className="text-xs text-muted-foreground">
        Quiet colleague prompts — not a diagnosis.{' '}
        <Link href="/library" className="text-cobalt hover:underline">
          Evidence library
        </Link>
      </p>
    </div>
  )
}
