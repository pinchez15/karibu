// CORS configuration for edge functions.
// Strict allow-list — no wildcard fallback. Service-to-service calls have no
// Origin header at all and don't need a CORS response (CORS is a browser
// concern); they pass through with empty allowed-origin which the browser
// would reject, but the browser isn't involved in those calls.

const ALLOWED_ORIGINS = [
  Deno.env.get('WEB_URL'),
  'https://karibu.health',
  'https://www.karibu.health',
].filter(Boolean) as string[]

// In development, also allow localhost
if (Deno.env.get('ENVIRONMENT') !== 'production') {
  ALLOWED_ORIGINS.push('http://localhost:3000', 'http://localhost:54321')
}

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || ''

  // Echo back the origin only if it's in the allow-list. Browsers reject
  // responses where Access-Control-Allow-Origin doesn't match the request
  // origin, so unauthorized origins get blocked client-side.
  //
  // For service-to-service calls (no Origin header), we still emit the
  // first allow-list entry — harmless because there's no browser involved.
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0] || ''

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

export function handleCorsPreflightOrError(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) })
  }
  return null
}
