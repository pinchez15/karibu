'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase'
import {
  getCoordinatorScope,
  requireOutbreakAccess,
  scopeCoversDiocese,
} from '@/lib/auth'

// Generic so cholera / marburg / mpox slot in later; ebola is the live one.
const PROTOCOLS = ['ebola', 'cholera', 'marburg', 'mpox'] as const
type Protocol = (typeof PROTOCOLS)[number]

function asText(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value.trim() : ''
}

function assertProtocol(value: FormDataEntryValue | null): Protocol {
  const p = typeof value === 'string' ? value : ''
  if (!(PROTOCOLS as readonly string[]).includes(p)) {
    throw new Error('Invalid protocol')
  }
  return p as Protocol
}

/**
 * Resolve the diocese that governs a scope target, for the authorization check.
 * A 'diocese' target governs itself; a 'district' target is governed by the
 * diocese of the clinics sitting in it.
 */
async function governingDiocese(
  scopeType: 'district' | 'diocese',
  scopeValue: string,
): Promise<string | null> {
  if (scopeType === 'diocese') return scopeValue

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('clinics')
    .select('diocese')
    .eq('district', scopeValue)
    .not('diocese', 'is', null)
    .limit(1)
    .maybeSingle()

  return (data?.diocese as string | null) ?? null
}

export async function setRegionProtocolAction(formData: FormData) {
  const actor = await requireOutbreakAccess()

  const protocol = assertProtocol(formData.get('protocol'))
  const scopeType = asText(formData.get('scope_type')) as 'district' | 'diocese'
  const scopeValue = asText(formData.get('scope_value'))
  const note = asText(formData.get('note')) || null
  // Toggle button posts the value it wants to set ('on' to activate).
  const active = asText(formData.get('active')) === 'on'

  if (scopeType !== 'district' && scopeType !== 'diocese') {
    throw new Error('Invalid scope type')
  }
  if (!scopeValue) {
    throw new Error('A district or diocese is required')
  }

  const diocese = await governingDiocese(scopeType, scopeValue)
  if (!scopeCoversDiocese(actor.scope, diocese)) {
    throw new Error(`Not authorized to manage ${protocol} for ${scopeType} ${scopeValue}`)
  }

  const supabase = createServiceClient()
  const now = new Date().toISOString()

  // Read existing row so we only stamp activated/deactivated on a real transition.
  const { data: existing } = await supabase
    .from('region_protocols')
    .select('id, active, note, activated_by, activated_at, deactivated_by, deactivated_at')
    .eq('protocol', protocol)
    .eq('scope_type', scopeType)
    .eq('scope_value', scopeValue)
    .maybeSingle()

  const turningOn = active && !(existing?.active ?? false)
  const turningOff = !active && (existing?.active ?? false)

  const { error } = await supabase.from('region_protocols').upsert(
    {
      protocol,
      scope_type: scopeType,
      scope_value: scopeValue,
      active,
      note: note ?? existing?.note ?? null,
      activated_by: turningOn ? actor.userId : existing?.activated_by ?? null,
      activated_at: turningOn ? now : existing?.activated_at ?? now,
      deactivated_by: turningOff ? actor.userId : existing?.deactivated_by ?? null,
      deactivated_at: turningOff ? now : existing?.deactivated_at ?? null,
      updated_at: now,
    },
    { onConflict: 'protocol,scope_type,scope_value' },
  )

  if (error) throw error

  revalidatePath('/dashboard/outbreaks')
}

/**
 * Region shortcut — activate/deactivate a protocol across every district of a
 * diocese in one action (district-scoped rows, so individual districts can
 * still be turned off afterward).
 */
export async function setRegionProtocolForDioceseAction(formData: FormData) {
  const actor = await requireOutbreakAccess()

  const protocol = assertProtocol(formData.get('protocol'))
  const diocese = asText(formData.get('diocese'))
  const active = asText(formData.get('active')) === 'on'
  const note = asText(formData.get('note')) || null

  if (!diocese) throw new Error('A diocese is required')
  if (!scopeCoversDiocese(actor.scope, diocese)) {
    throw new Error(`Not authorized to manage ${protocol} for ${diocese}`)
  }

  const supabase = createServiceClient()
  const now = new Date().toISOString()

  const { data: districts } = await supabase
    .from('clinics')
    .select('district')
    .eq('diocese', diocese)
    .not('district', 'is', null)

  const unique = Array.from(
    new Set((districts ?? []).map((r) => r.district as string).filter(Boolean)),
  )

  if (unique.length === 0) {
    throw new Error(`No districts found for ${diocese}`)
  }

  const rows = unique.map((district) => ({
    protocol,
    scope_type: 'district' as const,
    scope_value: district,
    active,
    note,
    activated_by: active ? actor.userId : null,
    activated_at: now,
    deactivated_by: active ? null : actor.userId,
    deactivated_at: active ? null : now,
    updated_at: now,
  }))

  const { error } = await supabase
    .from('region_protocols')
    .upsert(rows, { onConflict: 'protocol,scope_type,scope_value' })

  if (error) throw error

  revalidatePath('/dashboard/outbreaks')
}

// ── Superadmin-only: manage who the diocese coordinators are ───────────────

export async function addDioceseCoordinatorAction(formData: FormData) {
  const scope = await getCoordinatorScope()
  if (scope !== 'all') {
    throw new Error('Only superadmins can manage coordinators')
  }

  const clerkUserId = asText(formData.get('clerk_user_id'))
  const email = asText(formData.get('email')).toLowerCase()
  const displayName = asText(formData.get('display_name')) || email.split('@')[0]
  const diocese = asText(formData.get('diocese'))

  if (!clerkUserId || !email || !diocese) {
    throw new Error('Clerk user id, email, and diocese are required')
  }

  const supabase = createServiceClient()
  const { error } = await supabase.from('diocese_coordinators').upsert(
    {
      clerk_user_id: clerkUserId,
      email,
      display_name: displayName,
      diocese,
      is_active: true,
    },
    { onConflict: 'clerk_user_id,diocese' },
  )

  if (error) throw error
  revalidatePath('/dashboard/outbreaks')
}

export async function setDioceseCoordinatorActiveAction(formData: FormData) {
  const scope = await getCoordinatorScope()
  if (scope !== 'all') {
    throw new Error('Only superadmins can manage coordinators')
  }

  const id = asText(formData.get('id'))
  const active = asText(formData.get('active')) === 'on'
  if (!id) throw new Error('Missing coordinator id')

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('diocese_coordinators')
    .update({ is_active: active })
    .eq('id', id)

  if (error) throw error
  revalidatePath('/dashboard/outbreaks')
}
