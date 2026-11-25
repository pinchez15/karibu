import 'server-only'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { rpc } from './db'
import { errorMessage, text } from './form'
import { t } from '@/i18n'

/** One handler for the ticket form's four buttons, used by both the office inbox and the L2 queue. */
export async function updateTicket(ticketId: string, path: string, form: FormData): Promise<never> {
  const intent = text(form, 'intent')
  let failure: string | null = null
  try {
    await rpc('office_ticket_update', {
      p_ticket_id: ticketId,
      p_note: text(form, 'note') || null,
      p_status: intent === 'resolve' ? 'resolved' : intent === 'reopen' ? 'in_progress' : null,
      p_escalate: intent === 'escalate',
    })
  } catch (e) {
    failure = errorMessage(e, t)
  }
  revalidatePath(path.split('?')[0])
  redirect(`${path}${path.includes('?') ? '&' : '?'}${new URLSearchParams(failure ? { error: failure } : { ok: t('common.saved') })}`)
}
