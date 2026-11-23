'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getOfficeScope } from '@/lib/auth'
import { extractCatalog, type CatalogKind } from '@/lib/ai/extract'
import { openAiVision } from '@/lib/ai/provider'
import { createClinicOrganization, deleteClinicOrganization, inviteToClinic, isSlugTaken, revokeClinicInvitation } from '@/lib/clinic-signin'
import { rpc, userClient } from '@/lib/db'
import { errorMessage, text } from '@/lib/form'
import { t } from '@/i18n'
import type { Onboarding } from './types'

function go(path: string, params: Record<string, string> = {}, hash = ''): never {
  const q = new URLSearchParams(params).toString()
  redirect(`${path}${q ? `?${q}` : ''}${hash}`)
}

const pathFor = (slug: string, id: string) => `/o/${slug}/clinics/${id}/onboarding`

async function run(slug: string, id: string, hash: string, fn: () => Promise<Record<string, string> | void>) {
  await getOfficeScope(slug)
  const path = pathFor(slug, id)
  let ok: Record<string, string> | void
  try {
    ok = await fn()
  } catch (e) {
    go(path, { error: errorMessage(e, t) }, hash)
  }
  revalidatePath(path)
  go(path, ok ?? { ok: t('common.saved') }, hash)
}

export async function startOnboardingAction(slug: string, id: string, form: FormData) {
  await run(slug, id, '#form', async () => {
    await rpc('office_onboarding_start', {
      p_account_id: id, p_champion_name: text(form, 'champion_name') || null, p_champion_phone: text(form, 'champion_phone') || null,
    })
    return {}
  })
}

export async function reviewReadinessAction(slug: string, id: string) {
  await run(slug, id, '#form', async () => { await rpc('office_readiness_review', { p_account_id: id }) })
}

/** Reads the parallel `field[]` inputs of the editable table back into rows, dropping rows with no name. */
function rowsFromForm(form: FormData, fields: string[]): Record<string, string>[] {
  const columns = fields.map((f) => form.getAll(`${f}[]`).map((v) => (typeof v === 'string' ? v.trim() : '')))
  const n = Math.max(0, ...columns.map((c) => c.length))
  const rows: Record<string, string>[] = []
  for (let i = 0; i < n; i++) {
    const row = Object.fromEntries(fields.map((f, j) => [f, columns[j][i] ?? '']))
    if (row.name) rows.push(row)
  }
  return rows
}

const FIELDS: Record<string, string[]> = {
  drugs: ['name', 'strength', 'formulation', 'unit_price', 'quantity'],
  services: ['name', 'kind', 'price'],
  staff: ['name', 'role', 'email', 'phone'],
}

export async function saveDraftAction(slug: string, id: string, kind: 'drugs' | 'services' | 'staff', form: FormData) {
  const approve = text(form, 'intent') === 'approve'
  await run(slug, id, `#${kind}`, async () => {
    await rpc('office_catalog_draft_save', {
      p_account_id: id, p_kind: kind, p_rows: rowsFromForm(form, FIELDS[kind]), p_source: text(form, 'source') || 'manual',
    })
    if (approve) await rpc('office_catalog_draft_approve', { p_account_id: id, p_kind: kind })
    return { ok: approve ? t('onboarding.approved') : t('onboarding.draftSaved') }
  })
}

const PHOTO_KIND: Record<CatalogKind, string> = { drugs: 'drug_list', services: 'price_list' }

export async function extractAction(slug: string, id: string, kind: CatalogKind) {
  await run(slug, id, `#${kind}`, async (): Promise<Record<string, string>> => {
    const data = await rpc<Onboarding>('office_onboarding_get', { p_account_id: id })
    const photos = (data.readiness?.photos ?? []).filter((p) => p.kind === PHOTO_KIND[kind])
    if (photos.length === 0) return { error: t('onboarding.noPhotos') }

    // Photos are read with the partner's own token: Storage policy decides access.
    const supabase = await userClient()
    const images = []
    for (const photo of photos.slice(0, 6)) {
      const { data: blob, error } = await supabase.storage.from('office-readiness').download(photo.path)
      if (error || !blob) continue
      images.push({ mime: blob.type || 'image/jpeg', base64: Buffer.from(await blob.arrayBuffer()).toString('base64') })
    }
    if (images.length === 0) return { error: t('onboarding.extractFailed') }

    let rows
    try {
      rows = await extractCatalog(openAiVision, kind, images)
    } catch {
      return { error: t('onboarding.extractFailed') }
    }
    if (rows.length === 0) return { error: t('onboarding.extractFailed') }
    await rpc('office_catalog_draft_save', {
      p_account_id: id, p_kind: kind, p_rows: rows, p_source: 'ai', p_source_photos: photos.map((p) => p.path),
    })
    return { ok: t('onboarding.extracting', { n: images.length }) }
  })
}

export async function provisionAction(slug: string, id: string, form: FormData) {
  await getOfficeScope(slug)
  const path = pathFor(slug, id)
  const clinicSlug = text(form, 'slug').toLowerCase()
  const name = text(form, 'name')
  const departments = form.getAll('departments').filter((v): v is string => typeof v === 'string')

  let organizationId: string
  try {
    organizationId = await createClinicOrganization(name, clinicSlug)
  } catch (e) {
    go(path, { error: isSlugTaken(e) ? t('errors.slugTaken') : t('errors.generic') }, '#provision')
  }
  try {
    await rpc('office_clinic_provision', {
      p_account_id: id, p_slug: clinicSlug, p_clerk_organization_id: organizationId, p_departments: departments.length ? departments : ['opd'],
    })
  } catch (e) {
    // Don't leave a sign-in organization behind for a clinic that was not created.
    await deleteClinicOrganization(organizationId)
    go(path, { error: errorMessage(e, t) }, '#provision')
  }
  revalidatePath(path)
  go(path, { ok: t('onboarding.provisioned') }, '#staff')
}

export async function inviteStaffAction(slug: string, id: string, form: FormData) {
  await getOfficeScope(slug)
  const path = pathFor(slug, id)
  const rows = rowsFromForm(form, FIELDS.staff)
  let organizationId: string | null
  try {
    // Keep what the partner typed, even for rows that can't be invited yet.
    await rpc('office_catalog_draft_save', { p_account_id: id, p_kind: 'staff', p_rows: rows, p_source: 'manual' })
    organizationId = await rpc<string | null>('office_clinic_signin_org', { p_account_id: id })
  } catch (e) {
    go(path, { error: errorMessage(e, t) }, '#staff')
  }
  if (!organizationId) go(path, { error: t('errors.NOT_PROVISIONED') }, '#staff')

  // Pressing the button again must not re-invite people who already have an invitation or a login.
  const current = await rpc<Onboarding>('office_onboarding_get', { p_account_id: id }).catch(() => null)
  const known = new Set([
    ...(current?.training.invited ?? []).map((i) => i.email.toLowerCase()),
  ])
  const joinedNames = new Set((current?.training.staff ?? []).map((s) => s.name.toLowerCase()))

  let sent = 0
  const failed: string[] = []
  for (const row of rows.filter((r) => r.email && !known.has(r.email.toLowerCase()) && !joinedNames.has(r.name.toLowerCase()))) {
    let invitationId: string | null = null
    try {
      invitationId = await inviteToClinic(organizationId, row.email.toLowerCase(), row.role)
      await rpc('office_staff_invite_record', {
        p_account_id: id, p_email: row.email, p_display_name: row.name, p_role: row.role, p_clerk_invitation_id: invitationId,
      })
      sent++
    } catch {
      if (invitationId) await revokeClinicInvitation(organizationId, invitationId)
      failed.push(row.name)
    }
  }
  revalidatePath(path)
  const params: Record<string, string> = {}
  if (sent > 0) params.ok = t('onboarding.invitesSent', { n: sent })
  if (failed.length > 0) params.error = t('onboarding.inviteFailed', { n: failed.length, names: failed.join(', ') })
  go(path, params, '#staff')
}
