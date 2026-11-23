import { TicketView } from '@/components/TicketView'
import { Flash, PageHeader } from '@/components/ui'
import { getOfficeScope } from '@/lib/auth'
import { rpc } from '@/lib/db'
import { updateTicket } from '@/lib/ticket-action'
import type { Ticket } from '@/lib/tickets'
import { t } from '@/i18n'

type Props = { params: Promise<{ office: string; id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }

export default async function TicketPage({ params, searchParams }: Props) {
  const { office: slug, id } = await params
  const flash = await searchParams
  await getOfficeScope(slug)
  const ticket = await rpc<Ticket>('office_ticket_get', { p_ticket_id: id })
  const path = `/o/${slug}/support/${id}`

  async function action(form: FormData) {
    'use server'
    await getOfficeScope(slug)
    await updateTicket(id, path, form)
  }

  return (
    <>
      <PageHeader title={ticket.clinic_name ?? t('support.title')} back={`/o/${slug}/support`} />
      <Flash {...flash} />
      <TicketView ticket={ticket} action={action} canEscalate />
      {ticket.clinic_account_id ? <a href={`/o/${slug}/clinics/${ticket.clinic_account_id}`} className="btn-secondary w-full">{t('common.open')}: {ticket.clinic_name}</a> : null}
    </>
  )
}
