// CORS configuration for edge functions
// Restricts origins to the app's actual domains

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

  // For service-to-service calls (edge function → edge function), there's no origin
  // Allow these through since they're authenticated via service role key
  const isServiceCall = !origin && req.headers.get('authorization')?.includes('service_role')

  const allowedOrigin = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : isServiceCall
      ? '*'
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
