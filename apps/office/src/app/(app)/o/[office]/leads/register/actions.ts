'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { rpc } from '@/lib/db'
import { getOfficeScope } from '@/lib/auth'
import { errorMessage, text } from '@/lib/form'
import { t } from '@/i18n'

type Result = { status: 'created' | 'duplicate' | 'conflict' | 'error'; name?: string }

/** Adds the ticked facilities (or the one whose own button was pressed) to the pipeline as leads. */
export async function addFacilitiesAction(slug: string, form: FormData) {
  const scope = await getOfficeScope(slug)
  // Come back to the same search, so the partner keeps their place in the list.
  const asked = text(form, 'return_to')
  const back = asked.startsWith(`/o/${slug}/leads/register`) ? asked : `/o/${slug}/leads/register`
  const sep = back.includes('?') ? '&' : '?'
  const one = text(form, 'one')
  const ids = one ? [one] : form.getAll('id').filter((v): v is string => typeof v === 'string' && v.length > 0)
  if (ids.length === 0) redirect(`${back}${sep}${new URLSearchParams({ error: t('register.pickSome') })}`)

  let results: Result[]
  try {
    results = await rpc<Result[]>('office_facilities_add', { p_office_id: scope.office_id, p_facility_ids: ids.slice(0, 50) })
  } catch (e) {
    redirect(`${back}${sep}${new URLSearchParams({ error: errorMessage(e, t) })}`)
  }
  revalidatePath(`/o/${slug}/leads`)
  revalidatePath(`/o/${slug}/pipeline`)
  const n = (s: Result['status']) => results.filter((r) => r.status === s).length
  const parts = [
    n('created') > 0 ? t('register.added', { n: n('created') }) : null,
    n('duplicate') > 0 ? t('register.already', { n: n('duplicate') }) : null,
    n('conflict') > 0 ? t('register.heldResult', { n: n('conflict') }) : null,
    n('error') > 0 ? t('register.failed', { n: n('error') }) : null,
  ].filter(Boolean).join(' ')
  redirect(`${back}${sep}${new URLSearchParams(n('created') > 0 ? { ok: parts } : { error: parts || t('errors.generic') })}`)
}
