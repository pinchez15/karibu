// Isomorphic realtime constants — safe to import from both server actions
// (broadcast send) and client hooks (subscribe). No server-only deps here.

/**
 * One Supabase Realtime broadcast channel per clinic. Server actions send a
 * lightweight "data changed" signal after a mutation; open client views
 * subscribe and call router.refresh(). Broadcast (not postgres_changes) is used
 * deliberately: it does not require an RLS-authorized Supabase session, which
 * the web client lacks (auth is Clerk, not Supabase Auth).
 */
export function clinicRefreshChannel(clinicId: string): string {
  return `clinic-refresh:${clinicId}`
}

export const CLINIC_REFRESH_EVENT = 'data_changed'
