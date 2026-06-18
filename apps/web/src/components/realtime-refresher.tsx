'use client'

import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'

/**
 * Drop-in, renders nothing. Place inside any server-rendered page that should
 * live-update: it subscribes to the clinic refresh broadcast and re-fetches on
 * mutation (plus a visibility/interval poll fallback). Pass the page's clinicId.
 */
export function RealtimeRefresher({ clinicId }: { clinicId: string }) {
  useRealtimeRefresh(clinicId)
  return null
}
