'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabase } from '@/lib/supabase-browser'
import { clinicRefreshChannel, CLINIC_REFRESH_EVENT } from '@/lib/realtime'

/**
 * Live-refresh a server-rendered view. Two mechanisms, layered:
 *
 *  1. Realtime broadcast — instant refresh when any web server action mutates
 *     clinic data and calls broadcastClinicRefresh(clinicId). Cross-tab and
 *     cross-user within the clinic.
 *  2. Visibility + interval poll — safety net that also catches changes which
 *     never hit a web action (e.g. Android offline dispense syncing via RPC).
 *
 * Pass the caller's clinicId to enable broadcast; omit it for poll-only.
 */
export function useRealtimeRefresh(clinicId?: string | null, intervalMs = 120_000) {
  const router = useRouter()

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null
    const start = () => {
      if (timer === null) timer = setInterval(() => router.refresh(), intervalMs)
    }
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer)
        timer = null
      }
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') stop()
      else {
        router.refresh()
        start()
      }
    }
    if (document.visibilityState !== 'hidden') start()
    document.addEventListener('visibilitychange', onVisibilityChange)

    let channel: ReturnType<ReturnType<typeof getBrowserSupabase>['channel']> | null = null
    if (clinicId) {
      const supabase = getBrowserSupabase()
      channel = supabase
        .channel(clinicRefreshChannel(clinicId))
        .on('broadcast', { event: CLINIC_REFRESH_EVENT }, () => router.refresh())
        .subscribe()
    }

    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      if (channel) getBrowserSupabase().removeChannel(channel)
    }
  }, [router, intervalMs, clinicId])
}
