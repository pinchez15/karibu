import { PageHeader } from '@/components/ui'
import { getOfficeScope } from '@/lib/auth'
import { relativeDay } from '@/lib/dates'
import { rpc } from '@/lib/db'
import { TICKET_CHIP, type Ticket } from '@/lib/tickets'
import { t } from '@/i18n'

type Props = { params: Promise<{ office: string }>; searchParams: Promise<{ all?: string }> }

export default async function SupportPage({ params, searchParams }: Props) {
  const { office: slug } = await params
  const { all } = await searchParams
  const scope = await getOfficeScope(slug)
  const tickets = await rpc<Ticket[]>('office_tickets_list', { p_office_id: scope.office_id, p_open_only: all !== '1' })
  const base = `/o/${slug}/support`

  return (
    <>
      <PageHeader title={t('support.title')} />
      {tickets.length === 0 ? (
        <div className="card space-y-1">
          <p className="font-semibold text-ink">{t('support.empty')}</p>
          <p className="text-sm">{t('support.emptyHint')}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {tickets.map((tk) => (
            <li key={tk.id}>
              <a href={`${base}/${tk.id}`} className="card block space-y-1.5 active:bg-line-soft">
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0 font-semibold text-ink">{tk.clinic_name}</span>
                  <span className="flex shrink-0 gap-1">
                    {tk.escalated_to_karibu ? <span className="chip-info">{t('support.escalated')}</span> : null}
                    <span className={TICKET_CHIP[tk.status]}>{t(`support.status.${tk.status}`)}</span>
                  </span>
                </span>
                <span className="line-clamp-2 block text-sm text-ink">{tk.body}</span>
                <span className="meta">{tk.raised_by?.name} · {relativeDay(tk.created_at, t)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <a href={all === '1' ? base : `${base}?all=1`} className="btn-quiet w-full">{all === '1' ? t('support.showOpen') : t('support.showAll')}</a>
    </>
  )
}
