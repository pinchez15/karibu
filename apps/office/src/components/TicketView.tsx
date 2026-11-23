import { Section } from '@/components/ui'
import { relativeDay, shortDate } from '@/lib/dates'
import { TICKET_CHIP, type Ticket } from '@/lib/tickets'
import { t } from '@/i18n'

/** Shared by the office support inbox and Karibu central's L2 queue. */
export function TicketView({ ticket: tk, action, canEscalate }: {
  ticket: Ticket
  action: (form: FormData) => Promise<void>
  canEscalate: boolean
}) {
  const closed = tk.status === 'resolved' || tk.status === 'closed'
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className={TICKET_CHIP[tk.status]}>{t(`support.status.${tk.status}`)}</span>
        {tk.category ? <span className="chip-neutral">{t(`support.category.${tk.category}`)}</span> : null}
        {tk.escalated_to_karibu ? <span className="chip-info">{t('support.escalated')}</span> : null}
      </div>

      <div className="card space-y-2">
        <p className="meta">
          {t('support.from', { name: tk.raised_by?.name ?? '?', clinic: tk.clinic_name ?? '?' })}
          {tk.raised_by?.role ? ` · ${tk.raised_by.role.replace(/_/g, ' ')}` : ''} · {t('support.raised', { when: relativeDay(tk.created_at, t) })}
        </p>
        <p className="whitespace-pre-wrap text-ink">{tk.body}</p>
        {Object.keys(tk.context ?? {}).length > 0 ? (
          <p className="font-mono text-xs text-muted">{Object.entries(tk.context).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>
        ) : null}
      </div>
      <p className="text-xs text-muted">{t('support.privacy')}</p>

      {tk.notes && tk.notes.length > 0 ? (
        <Section title={t('support.notes')}>
          <ul className="card divide-y divide-line-soft py-1">
            {tk.notes.map((n, i) => (
              <li key={i} className="py-2.5">
                <span className="meta">{n.author_name ?? n.author_kind} · {shortDate(n.at)}</span>
                <span className="mt-0.5 block whitespace-pre-wrap text-sm text-ink">{n.body}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <form action={action} className="card space-y-3">
        <label className="field"><span>{t('support.note')}</span>
          <textarea name="note" rows={3} className="input" placeholder={t('support.notePlaceholder')} /></label>
        <div className="grid grid-cols-2 gap-2">
          <button name="intent" value="note" className="btn-secondary">{t('support.addNote')}</button>
          {closed
            ? <button name="intent" value="reopen" className="btn-secondary">{t('support.reopen')}</button>
            : <button name="intent" value="resolve" className="btn-primary">{t('support.resolve')}</button>}
        </div>
        {canEscalate && !closed && !tk.escalated_to_karibu ? (
          <>
            <button name="intent" value="escalate" className="btn-secondary w-full">{t('support.escalate')}</button>
            <p className="text-xs text-muted">{t('support.escalateHint')}</p>
          </>
        ) : null}
      </form>
    </>
  )
}
