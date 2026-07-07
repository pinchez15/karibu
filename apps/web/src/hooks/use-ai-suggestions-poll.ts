'use client'

import { useEffect, useState } from 'react'
import type { VisitAiReviewSuggestion } from '@/lib/ai-review-helpers'
import { fetchVisitAiSuggestions } from '@/app/dashboard/visits/[id]/review-actions'

const DEFAULT_INTERVAL_MS = 25_000

/**
 * Lightweight poll for new AI review suggestions on an open unsigned visit.
 * Does not call router.refresh() — only refetches suggestion rows.
 */
export function useAiSuggestionsPoll(
  visitId: string,
  enabled: boolean,
  initial: VisitAiReviewSuggestion[],
  intervalMs = DEFAULT_INTERVAL_MS,
): VisitAiReviewSuggestion[] {
  const [suggestions, setSuggestions] = useState(initial)

  useEffect(() => {
    setSuggestions(initial)
  }, [initial])

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null

    const refresh = async () => {
      const result = await fetchVisitAiSuggestions(visitId)
      if (!cancelled && result.success) {
        setSuggestions(result.suggestions)
      }
    }

    const start = () => {
      if (timer === null) timer = setInterval(() => void refresh(), intervalMs)
    }
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer)
        timer = null
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        stop()
      } else {
        void refresh()
        start()
      }
    }

    if (document.visibilityState !== 'hidden') start()
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelled = true
      stop()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [visitId, enabled, intervalMs])

  return suggestions
}
