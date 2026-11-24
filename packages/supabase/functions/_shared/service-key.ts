// The key edge functions use for their service (RLS-bypassing) Supabase client.
//
// Supabase is retiring the legacy `anon` / `service_role` JWT keys. The
// auto-injected SUPABASE_SERVICE_ROLE_KEY still carries the legacy key, so it
// stops working the day legacy keys are disabled. The new secret keys
// (`sb_secret_...`) are injected as SUPABASE_SECRET_KEYS, a JSON object of
// name -> key. Prefer those; fall back to the legacy variable so this code is
// safe to deploy before the project is switched over.

function secretKeys(): string[] {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const named = typeof parsed.default === 'string' ? [parsed.default] : []
    const rest = Object.values(parsed).filter((v): v is string => typeof v === 'string' && v !== parsed.default)
    return [...named, ...rest].filter(Boolean)
  } catch {
    return []
  }
}

/** Every key that identifies a trusted service caller: new secret keys, then the legacy one. */
export function serviceKeys(): string[] {
  const single = Deno.env.get('SUPABASE_SECRET_KEY') || ''
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  return [...secretKeys(), single, legacy].filter(Boolean)
}

/** The key to build the service client with. Throws when none is configured. */
export function serviceKey(): string {
  const key = serviceKeys()[0]
  if (!key) throw new Error('No Supabase secret key in the function environment')
  return key
}
