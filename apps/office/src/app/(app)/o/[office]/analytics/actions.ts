'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { rpc } from '@/lib/db'
import { getOfficeScope } from '@/lib/auth'
import { errorMessage, text } from '@/lib/form'
import { t } from '@/i18n'

export async function pauseAnalyticsAction(slug: string, form: FormData) {
  const scope = await getOfficeScope(slug)
  const path = `/o/${slug}/analytics`
  let failure: string | null = null
  try {
    await rpc('office_analytics_pause', {
      p_office_id: scope.office_id, p_panel: text(form, 'panel'), p_paused: text(form, 'paused') === '1',
    })
  } catch (e) {
    failure = errorMessage(e, t)
  }
  revalidatePath(path)
  redirect(failure ? `${path}?${new URLSearchParams({ error: failure })}` : path)
}
