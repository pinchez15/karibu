// Edge function authentication helper.
//
// Accepts EITHER:
//   1. Service-to-service: `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`
//      (used by Next.js server actions and edge-to-edge fan-out)
//   2. Clerk session JWT: `Authorization: Bearer <clerk_session_token>`
//      (used by browser and Android clients — they ALSO send the public anon
//      key in the `apikey` header so Supabase's platform gateway accepts the
//      request, but the function-level authorization check happens here.)
//
// The Supabase platform's `verify_jwt` gate alone is NOT real auth — the anon
// key is `NEXT_PUBLIC_SUPABASE_ANON_KEY`, exposed in the web bundle. Every
// edge function that does anything expensive (LLM calls, paid APIs) MUST call
// `requireAuth` to gate access.

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'https://esm.sh/jose@5.9.6'

const CLERK_ISSUER = Deno.env.get('CLERK_ISSUER') || ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null
function getJWKS() {
  if (!CLERK_ISSUER) return null
  if (!jwksCache) {
    jwksCache = createRemoteJWKSet(new URL(`${CLERK_ISSUER}/.well-known/jwks.json`))
  }
  return jwksCache
}

export type AuthContext =
  | { type: 'service' }
  | { type: 'clerk'; userId: string; payload: JWTPayload }

export class AuthError extends Error {
  status: number
  constructor(message: string, status = 401) {
    super(message)
    this.status = status
  }
}

export async function requireAuth(req: Request): Promise<AuthContext> {
  const auth = req.headers.get('authorization') || ''
  if (!auth.startsWith('Bearer ')) {
    throw new AuthError('Missing Authorization header')
  }
  const token = auth.slice('Bearer '.length).trim()
  if (!token) {
    throw new AuthError('Empty bearer token')
  }

  // Service-to-service: exact-match service role key. Constant-time-ish via
  // length check first; this token never reaches Clerk verification.
  if (SERVICE_ROLE_KEY && token.length === SERVICE_ROLE_KEY.length && token === SERVICE_ROLE_KEY) {
    return { type: 'service' }
  }

  // Otherwise, verify as a Clerk session JWT.
  const jwks = getJWKS()
  if (!jwks) {
    throw new AuthError('CLERK_ISSUER is not configured', 500)
  }
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: CLERK_ISSUER })
    if (!payload.sub) {
      throw new AuthError('Token missing subject')
    }
    return { type: 'clerk', userId: payload.sub, payload }
  } catch (err) {
    throw new AuthError(`Token verification failed: ${(err as Error).message}`)
  }
}

/**
 * Tenant check: verify that a Clerk-authenticated caller is an active staff
 * member of the visit's clinic. Service role calls bypass this check (they're
 * trusted server-to-server).
 *
 * Call this AFTER fetching the visit (you need its clinic_id) and BEFORE
 * doing any expensive work. Closes the cross-tenant authorization gap that
 * Clerk-JWT auth alone leaves open: a valid Clerk token from clinic A would
 * otherwise be sufficient to trigger paid LLM calls on a clinic B visit_id.
 *
 * @param supabase  service-role Supabase client
 * @param authCtx   result of requireAuth()
 * @param visitClinicId  the visit's clinic_id
 * @throws AuthError(403) if the Clerk user is not an active staff member of that clinic
 */
// deno-lint-ignore no-explicit-any
export async function requireStaffForClinic(
  supabase: any,
  authCtx: AuthContext,
  visitClinicId: string,
): Promise<void> {
  if (authCtx.type === 'service') return // service-to-service bypass

  const { data: staff, error } = await supabase
    .from('staff')
    .select('clinic_id')
    .eq('clerk_user_id', authCtx.userId)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    throw new AuthError(`Staff lookup failed: ${error.message}`, 500)
  }
  if (!staff) {
    throw new AuthError('No active staff record for this user', 403)
  }
  if (staff.clinic_id !== visitClinicId) {
    throw new AuthError('Visit does not belong to your clinic', 403)
  }
}

export function authErrorResponse(
  err: unknown,
  corsHeaders: Record<string, string>,
): Response {
  const isAuthErr = err instanceof AuthError
  const status = isAuthErr ? err.status : 401
  const message = isAuthErr ? err.message : 'Unauthorized'
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}
