'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { rpc } from '@/lib/db'
import { getOfficeScope } from '@/lib/auth'
import { clinicRowsFromCsv } from '@/lib/csv'
import { errorMessage, text } from '@/lib/form'
import { t } from '@/i18n'

type ClaimResult = { status: 'created' | 'duplicate' | 'conflict' | 'error'; account_id?: string; name?: string; message?: string }

function go(path: string, params: Record<string, string> = {}): never {
  const q = new URLSearchParams(params).toString()
  redirect(q ? `${path}?${q}` : path)
}

export async function createClinicAction(slug: string, form: FormData) {
  const scope = await getOfficeScope(slug)
  const base = `/o/${slug}/clinics`
  let result: ClaimResult
  try {
    result = await rpc<ClaimResult>('office_clinic_create', {
      p_office_id: scope.office_id,
      p_fields: {
        name: text(form, 'name'),
        district: text(form, 'district'),
        facility_level: text(form, 'facility_level'),
        contact_name: text(form, 'contact_name'),
        contact_phone: text(form, 'contact_phone'),
        tier: text(form, 'tier'),
        staff_count: text(form, 'staff_count'),
        notes: text(form, 'notes'),
      },
    })
  } catch (e) {
    go(`${base}/new`, { error: errorMessage(e, t) })
  }
  revalidatePath(base)
  if (result.status === 'conflict') go(`${base}/new`, { conflict: result.name ?? '' })
  if (result.status === 'duplicate') go(`${base}/${result.account_id}`, { ok: t('clinics.duplicate') })
  go(`${base}/${result.account_id}`, { ok: t('clinics.created') })
}

export async function importClinicsAction(slug: string, form: FormData) {
  const scope = await getOfficeScope(slug)
  const base = `/o/${slug}/clinics/import`
  const file = form.get('file')
  let csv = text(form, 'pasted')
  if (file instanceof File && file.size > 0) {
    if (file.size > 512_000) go(base, { error: t('errors.generic') })
    csv = await file.text()
  }

  let results: ClaimResult[]
  try {
    const rows = clinicRowsFromCsv(csv)
    if (rows.length === 0) go(base, { error: t('clinics.importHint') })
    results = await rpc<ClaimResult[]>('office_clinics_import', { p_office_id: scope.office_id, p_rows: rows })
  } catch (e) {
    if (e instanceof Error && e.message === 'NO_NAME_COLUMN') go(base, { error: t('clinics.importHint') })
    if (e && typeof e === 'object' && 'digest' in e) throw e // redirect() from go()
    go(base, { error: errorMessage(e, t) })
  }
  revalidatePath(`/o/${slug}/clinics`)
  // Row-by-row results travel in the URL so the page needs no client state.
  const compact = results.map((r) => `${r.status}:${(r.name ?? '').replace(/[|:]/g, ' ').slice(0, 40)}`).join('|')
  go(base, { results: compact.slice(0, 3500) })
}

export async function updateClinicAction(slug: string, accountId: string, form: FormData) {
  await getOfficeScope(slug)
  const path = `/o/${slug}/clinics/${accountId}`
  const patch: Record<string, string> = {}
  for (const key of ['facility_level', 'contact_name', 'contact_phone', 'champion_name', 'champion_phone', 'tier', 'next_action', 'next_action_at', 'notes', 'go_live_mode', 'billing_starts_on']) {
    if (form.has(key)) patch[key] = text(form, key)
  }
  try {
    await rpc('office_clinic_update', { p_account_id: accountId, p_patch: patch })
  } catch (e) {
    go(path, { error: errorMessage(e, t) })
  }
  revalidatePath(path)
  go(path, { ok: t('common.saved') })
}

export async function setStageAction(slug: string, accountId: string, form: FormData) {
  await getOfficeScope(slug)
  const path = `/o/${slug}/clinics/${accountId}`
  // The pipeline board moves a clinic and stays on the board.
  const asked = text(form, 'return_to')
  const returnTo = asked.startsWith(`/o/${slug}/`) ? asked : null
  try {
    await rpc('office_clinic_set_stage', { p_account_id: accountId, p_stage: text(form, 'stage'), p_note: text(form, 'note') || null })
  } catch (e) {
    go(returnTo ?? path, { error: errorMessage(e, t) })
  }
  revalidatePath(path)
  if (returnTo) revalidatePath(returnTo)
  go(returnTo ?? (text(form, 'stage') === 'churned' ? `/o/${slug}/clinics` : path), { ok: t('common.saved') })
}

/** Called by the visit log form, online or when the phone's queue flushes. Idempotent on `id`. */
export async function logSiteVisitAction(input: { id: string; accountId: string; kind: string; notes: string; at: string }) {
  try {
    await rpc('office_site_visit_log', {
      p_id: input.id, p_account_id: input.accountId, p_kind: input.kind, p_notes: input.notes, p_at: input.at,
    })
    return { ok: true as const }
  } catch (e) {
    return { ok: false as const, message: errorMessage(e, t) }
  }
}
