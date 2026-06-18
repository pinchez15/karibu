import 'server-only'

import { createServiceClient } from './supabase'
import { clinicRefreshChannel, CLINIC_REFRESH_EVENT } from './realtime'

/**
 * Signal every open client view in a clinic to re-fetch. Call after any
 * server-action mutation (dispense, stock change, order submit, vitals, etc.).
 * Best-effort: a realtime failure must never break the mutation that triggered
 * it, so errors are swallowed with a warning.
 */
export async function broadcastClinicRefresh(clinicId: string): Promise<void> {
  try {
    const supabase = createServiceClient()
    const channel = supabase.channel(clinicRefreshChannel(clinicId))
    await channel.send({ type: 'broadcast', event: CLINIC_REFRESH_EVENT, payload: {} })
    await supabase.removeChannel(channel)
  } catch (e) {
    console.warn('broadcastClinicRefresh failed', e)
  }
}
