import { TicketView } from '@/components/TicketView'
import { Flash, PageHeader } from '@/components/ui'
import { requireCentral } from '@/lib/auth'
import { relativeDay } from '@/lib/dates'
import { rpc } from '@/lib/db'
import { updateTicket } from '@/lib/ticket-action'
import type { Ticket } from '@/lib/tickets'
import { t } from '@/i18n'

type Props = { searchParams: Promise<{ id?: string; ok?: string; error?: string }> }

export default async function L2Page({ searchParams }: Props) {
  const { id, ...flash } = await searchParams
  const tickets = await rpc<Ticket[]>('office_admin_tickets')
  const open = id ? await rpc<Ticket>('office_ticket_get', { p_ticket_id: id }).catch(() => null) : null

  async function action(form: FormData) {
    'use server'
    await requireCentral()
    await updateTicket(id!, `/foundation/tickets`, form)
  }

  if (open) {
    return (
      <>
        <PageHeader title={`${open.clinic_name ?? '?'} · ${open.office_name ?? 'no office'}`} back="/foundation/tickets" />
        <Flash {...flash} />
        <TicketView ticket={open} action={action} canEscalate={false} />
      </>
    )
  }

  return (
    <>
      <PageHeader title={t('support.l2Title')} back="/foundation" />
      <Flash {...flash} />
      {tickets.length === 0 ? <p className="card text-sm">{t('support.l2Empty')}</p> : (
        <ul className="space-y-2">
          {tickets.map((tk) => (
            <li key={tk.id}>
              <a href={`/foundation/tickets?id=${tk.id}`} className="card block space-y-1.5">
                <span className="block font-semibold text-ink">{tk.clinic_name} · {tk.office_name ?? 'no office'}</span>
                <span className="line-clamp-2 block text-sm text-ink">{tk.body}</span>
                {tk.escalation_note ? <span className="block text-sm">{tk.escalation_note}</span> : null}
                <span className="meta">{relativeDay(tk.created_at, t)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
