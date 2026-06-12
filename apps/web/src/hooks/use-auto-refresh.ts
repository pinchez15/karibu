'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Lightweight queue polling: calls router.refresh() on an interval so server
 * components re-fetch and revalidated props flow into the client. Pauses
 * while the tab is hidden (visibilitychange) and refreshes immediately when
 * the tab becomes visible again. No realtime channels.
 */
export function useAutoRefresh(intervalMs = 45_000) {
  const router = useRouter()

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null

    const start = () => {
      if (timer === null) {
        timer = setInterval(() => router.refresh(), intervalMs)
      }
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
        router.refresh()
        start()
      }
    }

    if (document.visibilityState !== 'hidden') start()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [router, intervalMs])
}
