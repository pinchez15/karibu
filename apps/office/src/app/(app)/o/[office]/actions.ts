'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { rpc } from '@/lib/db'
import { getOfficeScope } from '@/lib/auth'
import { errorMessage, text } from '@/lib/form'
import { t } from '@/i18n'

function back(path: string, params: Record<string, string>): never {
  const q = new URLSearchParams(params).toString()
  redirect(q ? `${path}?${q}` : path)
}

export async function addTaskAction(slug: string, form: FormData) {
  const scope = await getOfficeScope(slug)
  const title = text(form, 'title')
  const accountId = text(form, 'account_id') || null
  const returnTo = text(form, 'return_to') || `/o/${slug}`
  if (!title) back(returnTo, {})
  try {
    await rpc('office_task_create', { p_office_id: scope.office_id, p_title: title, p_account_id: accountId })
  } catch (e) {
    back(returnTo, { error: errorMessage(e, t) })
  }
  revalidatePath(returnTo)
  back(returnTo, {})
}

export async function closeTaskAction(slug: string, form: FormData) {
  await getOfficeScope(slug)
  const returnTo = text(form, 'return_to') || `/o/${slug}`
  try {
    await rpc('office_task_close', { p_task_id: text(form, 'task_id'), p_status: text(form, 'status') || 'done' })
  } catch (e) {
    back(returnTo, { error: errorMessage(e, t) })
  }
  revalidatePath(returnTo)
  back(returnTo, {})
}

export async function setLowDataAction(slug: string, form: FormData) {
  const on = text(form, 'on') === '1'
  const jar = await cookies()
  jar.set('ko_lowdata', on ? '1' : '0', { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
  redirect(`/o/${slug}/more`)
}
