// Database access for Karibu Office.
//
// There is no service-role client in this app, on purpose. Every call goes to
// Supabase with the anon key plus the signed-in user's Clerk session token, so
// the database decides what the caller may see. The `office` schema is not
// exposed through the API; the only way in is the public.office_* RPCs.
import 'server-only'

import { auth } from '@clerk/nextjs/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export class RpcError extends Error {
  constructor(
    message: string,
    public code?: string,
    public hint?: string,
  ) {
    super(message)
    this.name = 'RpcError'
  }
}

function client(token: string | null): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
    },
  )
}

async function call<T>(supabase: SupabaseClient, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new RpcError(error.message, error.code, error.hint ?? undefined)
  return data as T
}

/** Call an office_* RPC as the signed-in user. */
export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { getToken } = await auth()
  const token = await getToken()
  if (!token) throw new RpcError('Authentication required', '28000')
  return call<T>(client(token), fn, args)
}

/** Call one of the few RPCs open to people without a login (token-gated forms). */
export async function rpcPublic<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  return call<T>(client(null), fn, args)
}

/** A Supabase client carrying the user's token, for Storage reads of readiness photos. */
export async function userClient(): Promise<SupabaseClient> {
  const { getToken } = await auth()
  const token = await getToken()
  if (!token) throw new RpcError('Authentication required', '28000')
  return client(token)
}
