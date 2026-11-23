'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { PRICE_BOOKS, type CountryCode } from '@karibu/shared'
import { requireCentral } from '@/lib/auth'
import { rpc } from '@/lib/db'
import { errorMessage, text } from '@/lib/form'
import { t } from '@/i18n'

function go(path: string, params: Record<string, string> = {}): never {
  const q = new URLSearchParams(params).toString()
  redirect(q ? `${path}?${q}` : path)
}

async function run(path: string, fn: () => Promise<unknown>, okParams: Record<string, string> = { ok: t('common.saved') }) {
  await requireCentral()
  try {
    await fn()
  } catch (e) {
    go(path, { error: errorMessage(e, t) })
  }
  revalidatePath('/foundation', 'layout')
  go(path, okParams)
}

export async function createOfficeAction(form: FormData) {
  await requireCentral()
  const country = text(form, 'country') as CountryCode
  const book = PRICE_BOOKS[country]
  if (!book) go('/foundation/offices/new', { error: t('errors.generic') })
  let id: string
  try {
    // The fee comes from the country price book, never from a form field.
    const office = await rpc<{ id: string }>('office_admin_office_save', {
      p_office_id: null,
      p_fields: {
        slug: text(form, 'slug'), name: text(form, 'name'), country, currency: book.currency,
        territory: text(form, 'territory'), fee_amount: book.partnerFeeMonthly,
        invoice_prefix: text(form, 'invoice_prefix'), inquiry_email: text(form, 'inquiry_email'),
      },
    })
    id = office.id
  } catch (e) {
    go('/foundation/offices/new', { error: errorMessage(e, t) })
  }
  revalidatePath('/foundation', 'layout')
  go(`/foundation/offices/${id}`)
}

export async function saveOfficeAction(officeId: string, form: FormData) {
  const fields: Record<string, string | boolean> = {}
  for (const key of ['status', 'stage_override', 'fee_starts_on']) if (form.has(key)) fields[key] = text(form, key)
  if (form.has('certified')) fields.certified = text(form, 'certified') === 'true'
  await run(`/foundation/offices/${officeId}`, () => rpc('office_admin_office_save', { p_office_id: officeId, p_fields: fields }))
}

export async function markFeeAction(officeId: string, form: FormData) {
  await run(`/foundation/offices/${officeId}`, () => rpc('office_admin_fee_mark', {
    p_office_id: officeId,
    p_months: Number(text(form, 'months') || '1'),
    p_reference: text(form, 'reference'),
    p_status: text(form, 'status') === 'waived' ? 'waived' : 'paid',
  }))
}

export async function inviteOwnerAction(officeId: string, form: FormData) {
  await requireCentral()
  const path = `/foundation/offices/${officeId}`
  let token: string
  try {
    const res = await rpc<{ token: string }>('office_member_invite', {
      p_office_id: officeId, p_role: 'owner', p_display_name: text(form, 'display_name'), p_phone: text(form, 'phone') || null,
    })
    token = res.token
  } catch (e) {
    go(path, { error: errorMessage(e, t) })
  }
  revalidatePath('/foundation', 'layout')
  // Shown once. The token is not readable again after this page.
  go(path, { join: token, phone: text(form, 'phone') })
}

export async function resolveConflictAction(form: FormData) {
  await run('/foundation', () => rpc('office_admin_conflict_resolve', {
    p_conflict_id: text(form, 'conflict_id'), p_decision: text(form, 'decision'), p_note: text(form, 'note') || null,
  }))
}

export async function releaseMilestoneAction(form: FormData) {
  await run('/foundation', () => rpc('office_admin_milestone_release', {
    p_milestone_id: text(form, 'milestone_id'), p_reference: text(form, 'reference') || null,
  }))
}

export async function linkClinicAction(slug: string, accountId: string, form: FormData) {
  await run(`/o/${slug}/clinics/${accountId}/onboarding`, () => rpc('office_admin_clinic_link', {
    p_account_id: accountId, p_clinic_id: text(form, 'clinic_id'),
  }))
}

export async function transferClinicAction(slug: string, accountId: string, form: FormData) {
  await requireCentral()
  const from = `/o/${slug}/clinics/${accountId}`
  const toOffice = text(form, 'to_office_id')
  const toSlug = text(form, `slug_${toOffice}`)
  try {
    await rpc('office_admin_clinic_transfer', { p_account_id: accountId, p_to_office_id: toOffice, p_reason: text(form, 'reason') })
  } catch (e) {
    go(from, { error: errorMessage(e, t) })
  }
  revalidatePath('/', 'layout')
  go(toSlug ? `/o/${toSlug}/clinics/${accountId}` : '/foundation', { ok: t('common.saved') })
}
