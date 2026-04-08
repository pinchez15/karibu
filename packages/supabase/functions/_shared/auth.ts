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
