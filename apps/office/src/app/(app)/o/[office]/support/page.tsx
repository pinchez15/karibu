import { TicketView } from '@/components/TicketView'
import { Empty, Flash, HealthChip, PageHeader, StageChip, Tabs, WhatsAppButton } from '@/components/ui'
import { getOfficeScope } from '@/lib/auth'
import { relativeDay } from '@/lib/dates'
import { rpc } from '@/lib/db'
import { updateTicket } from '@/lib/ticket-action'
import { TICKET_CHIP, type Ticket } from '@/lib/tickets'
import type { ClinicAccount } from '@/lib/types'
import { t } from '@/i18n'

type Props = { params: Promise<{ office: string }>; searchParams: Promise<{ all?: string; t?: string; ok?: string; error?: string }> }

// The inbox. On a laptop: requests on the left, the conversation in the
// middle, and what the office knows about that clinic on the right, so a reply
// never starts with "which clinic are you again?". On a phone: the list, then
// one request at a time.
export default async function SupportPage({ params, searchParams }: Props) {
  const { office: slug } = await params
  const { all, t: chosen, ...flash } = await searchParams
  const scope = await getOfficeScope(slug)
  const [tickets, clinics] = await Promise.all([
    rpc<Ticket[]>('office_tickets_list', { p_office_id: scope.office_id, p_open_only: all !== '1' }),
    rpc<ClinicAccount[]>('office_clinics_list', { p_office_id: scope.office_id }),
  ])
  const base = `/o/${slug}/support`
  const q = (id?: string) => `${base}?${new URLSearchParams({ ...(all === '1' ? { all: '1' } : {}), ...(id ? { t: id } : {}) })}`
  // A laptop always shows a conversation; a phone only once one is chosen.
  const selectedId = chosen ?? tickets[0]?.id
  const ticket = selectedId ? await rpc<Ticket>('office_ticket_get', { p_ticket_id: selectedId }).catch(() => null) : null
  const clinic = ticket?.clinic_account_id ? clinics.find((c) => c.id === ticket.clinic_account_id) ?? null : null
  const others = ticket ? tickets.filter((tk) => tk.id !== ticket.id && tk.clinic_account_id && tk.clinic_account_id === ticket.clinic_account_id) : []
  const phone = clinic?.champion_phone ?? clinic?.contact_phone ?? null
  const withKaribu = tickets.filter((tk) => tk.escalated_to_karibu).length

  async function action(form: FormData) {
    'use server'
    await getOfficeScope(slug)
    if (selectedId) await updateTicket(selectedId, q(selectedId), form)
  }

  return (
    <div className="wide space-y-5">
      <PageHeader title={t('support.title')} sub={t('inbox.sub')} />
      <Tabs items={[
        { href: base, label: t('inbox.open'), on: all !== '1' },
        { href: `${base}?all=1`, label: t('inbox.all'), on: all === '1' },
      ]} />

      {tickets.length === 0 ? (
        <Empty title={t('support.empty')} body={t('support.emptyHint')} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface lg:grid lg:grid-cols-[19rem_minmax(0,1fr)_17rem]">
          <ul className={`divide-y divide-line-soft lg:block lg:border-r lg:border-line ${chosen ? 'hidden' : ''}`}>
            {tickets.map((tk) => {
              const on = tk.id === selectedId
              return (
                <li key={tk.id}>
                  <a href={q(tk.id)} aria-current={on ? 'true' : undefined} className={`block space-y-1 px-4 py-3 hover:bg-background ${on ? 'lg:bg-coral-wash lg:shadow-[inset_3px_0_0_rgb(var(--ko-coral-bright))]' : ''}`}>
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate font-semibold text-ink">{tk.clinic_name}</span>
                      <span className="shrink-0 text-xs text-muted">{relativeDay(tk.created_at, t)}</span>
                    </span>
                    <span className="line-clamp-2 block text-[13px] text-ink">{tk.body}</span>
                    <span className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-muted">{tk.raised_by?.name}</span>
                      <span className="flex shrink-0 gap-1">
                        {tk.escalated_to_karibu ? <span className="chip-neutral">{t('support.escalated')}</span> : null}
                        <span className={TICKET_CHIP[tk.status]}>{t(`support.status.${tk.status}`)}</span>
                      </span>
                    </span>
                  </a>
                </li>
              )
            })}
          </ul>

          <section aria-label={t('inbox.conversation')} className={`space-y-4 p-4 lg:block lg:p-5 ${chosen ? '' : 'hidden'}`}>
            {ticket ? (
              <>
                <a href={q()} className="text-sm font-medium text-coral lg:hidden">← {t('support.title')}</a>
                <h2 className="text-lg">{ticket.clinic_name ?? t('support.title')}</h2>
                <Flash {...flash} />
                <TicketView ticket={ticket} action={action} canEscalate />
              </>
            ) : <p className="text-sm">{t('inbox.gone')}</p>}
          </section>

          <aside aria-label={t('inbox.about')} className={`space-y-4 border-t border-line bg-background p-4 text-sm lg:block lg:border-l lg:border-t-0 ${chosen ? '' : 'hidden'}`}>
            {clinic ? (
              <>
                <div className="space-y-1.5">
                  <a href={`/o/${slug}/clinics/${clinic.id}`} className="text-[15px] font-semibold text-coral">{clinic.name}</a>
                  <p className="text-[13px]">{[clinic.district, clinic.facility_level].filter(Boolean).join(' · ')}</p>
                  <p className="flex flex-wrap gap-1.5">
                    {clinic.health ? <HealthChip score={clinic.health.score} /> : null}
                    <StageChip stage={clinic.stage} />
                  </p>
                </div>
                {ticket?.raised_by ? (
                  <div>
                    <p className="font-semibold text-ink">{t('inbox.who')}</p>
                    <p>{ticket.raised_by.name}, {ticket.raised_by.role.replace(/_/g, ' ')}</p>
                  </div>
                ) : null}
                {phone ? (
                  <div className="space-y-1.5">
                    <p className="font-semibold text-ink">{t('inbox.reach', { name: clinic.champion_name ?? clinic.contact_name ?? clinic.name })}</p>
                    <div className="flex flex-wrap gap-1.5">
                      <WhatsAppButton className="btn-whatsapp btn-xs" phone={phone} label={t('support.replyWhatsApp')} text="" />
                      <a href={`tel:${phone}`} className="btn-secondary btn-xs">{t('common.call')}</a>
                    </div>
                  </div>
                ) : null}
                {others.length > 0 ? (
                  <div className="space-y-1">
                    <p className="font-semibold text-ink">{t('inbox.others')}</p>
                    {others.slice(0, 4).map((tk) => (
                      <a key={tk.id} href={q(tk.id)} className="block truncate text-coral">{tk.body}</a>
                    ))}
                  </div>
                ) : null}
                <a href={`/o/${slug}/clinics/${clinic.id}`} className="btn-secondary btn-xs">{t('inbox.console')}</a>
              </>
            ) : <p>{t('inbox.noClinic')}</p>}
            <p className="rounded-xl bg-line-soft px-3 py-2 text-[13px]">
              {withKaribu > 0 ? t('inbox.withKaribu', { n: withKaribu }) : t('inbox.stuck')}
            </p>
          </aside>
        </div>
      )}
    </div>
  )
}
