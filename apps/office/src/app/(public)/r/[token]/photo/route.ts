// Receives one photo from the login-free readiness form and stores it.
// The upload runs as `anon`: the Storage policy only accepts paths under a
// live readiness check, and office_readiness_add_photo re-checks the token.
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { rpcPublic, RpcError } from '@/lib/db'

const KINDS = new Set(['price_list', 'drug_list', 'staff_roster', 'signal'])
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const MAX_BYTES = 3 * 1024 * 1024

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const form = await req.formData().catch(() => null)
  const file = form?.get('photo')
  const kind = String(form?.get('kind') ?? '')
  if (!(file instanceof File) || !KINDS.has(kind) || !TYPES[file.type] || file.size === 0 || file.size > MAX_BYTES) {
    return Response.json({ error: 'bad_request' }, { status: 400 })
  }

  let checkId: string
  try {
    const info = await rpcPublic<{ check_id: string; locked: boolean }>('office_readiness_form', { p_token: token })
    if (info.locked) return Response.json({ error: 'locked' }, { status: 409 })
    checkId = info.check_id
  } catch {
    return Response.json({ error: 'invalid_link' }, { status: 404 })
  }

  const path = `${checkId}/${kind}-${randomUUID()}.${TYPES[file.type]}`
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await supabase.storage.from('office-readiness').upload(path, file, { contentType: file.type, upsert: false })
  if (error) return Response.json({ error: 'upload_failed' }, { status: 502 })

  try {
    await rpcPublic('office_readiness_add_photo', { p_token: token, p_kind: kind, p_path: path })
  } catch (e) {
    return Response.json({ error: e instanceof RpcError ? e.message : 'failed' }, { status: 409 })
  }
  return Response.json({ ok: true })
}
