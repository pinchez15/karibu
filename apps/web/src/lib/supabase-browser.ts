'use client'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Browser-side Supabase client used ONLY for Realtime broadcast subscriptions
// (see lib/realtime.ts). It carries the public anon key and no Clerk session,
// so it must never be used for RLS-protected reads/writes — those go through
// server actions with the service-role client. Broadcast channels do not
// require an authorized session, so this is safe for refresh signalling.
let client: SupabaseClient | null = null

export function getBrowserSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { realtime: { params: { eventsPerSecond: 2 } } },
    )
  }
  return client
}
