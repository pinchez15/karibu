// The service-role client bypasses RLS entirely. It must never be bundled
// into client components — 'server-only' makes any client-side import a
// build-time error.
import 'server-only'

import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Use any for database types since we don't have generated types
type Database = any

// Server-side client with service role for admin operations.
// IMPORTANT: RLS is bypassed — every query/mutation MUST be scoped by the
// caller's staff.clinic_id.
export function createServiceClient(): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )
}
