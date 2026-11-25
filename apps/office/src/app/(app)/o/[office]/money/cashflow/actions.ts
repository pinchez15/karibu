'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { rpc } from '@/lib/db'
import { getOfficeScope } from '@/lib/auth'
import { errorMessage, text } from '@/lib/form'
import { toMinor } from '@/lib/money'
import { getHome } from '@/lib/office'
import { t } from '@/i18n'

function done(slug: string, failure: string | null, hash = ''): never {
  const path = `/o/${slug}/money/cashflow`
  revalidatePath(path)
  revalidatePath(`/o/${slug}`)
  redirect(`${path}?${new URLSearchParams(failure ? { error: failure } : { ok: t('common.saved') })}${hash}`)
}

/** "2,150,000" or "2150000" -> minor units. Null when it is not a number. */
function amount(raw: string, currency: string): number | null {
  const n = Number(raw.replace(/[,\s]/g, ''))
  return raw !== '' && Number.isFinite(n) && n >= 0 ? toMinor(n, currency) : null
}

export async function setBalanceAction(slug: string, form: FormData) {
  const scope = await getOfficeScope(slug)
  const home = await getHome(scope.office_id)
  const value = amount(text(form, 'amount'), home.office.currency)
  if (value === null) done(slug, t('cash.badAmount'))
  let failure: string | null = null
  try {
    await rpc('office_cash_balance_set', { p_office_id: scope.office_id, p_amount: value })
  } catch (e) {
    failure = errorMessage(e, t)
  }
  done(slug, failure)
}

export async function saveCostAction(slug: string, form: FormData) {
  const scope = await getOfficeScope(slug)
  const home = await getHome(scope.office_id)
  const value = amount(text(form, 'amount'), home.office.currency)
  if (value === null || value === 0 || !text(form, 'label')) done(slug, t('cash.badCost'), '#costs')
  const month = text(form, 'starts_on') // "2027-02" from <input type="month">
  let failure: string | null = null
  try {
    await rpc('office_cost_save', {
      p_office_id: scope.office_id,
      p_fields: {
        label: text(form, 'label'),
        amount: String(value),
        cadence: text(form, 'cadence') === 'once' ? 'once' : 'monthly',
        starts_on: /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : '',
      },
    })
  } catch (e) {
    failure = errorMessage(e, t)
  }
  done(slug, failure, '#costs')
}

export async function removeCostAction(slug: string, form: FormData) {
  await getOfficeScope(slug)
  let failure: string | null = null
  try {
    await rpc('office_cost_remove', { p_cost_id: text(form, 'cost_id') })
  } catch (e) {
    failure = errorMessage(e, t)
  }
  done(slug, failure, '#costs')
}
