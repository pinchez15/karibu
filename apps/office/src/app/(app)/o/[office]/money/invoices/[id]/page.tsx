import { InvoiceDocument } from '@/components/InvoiceDocument'
import { Flash, PageHeader, Section, WhatsAppButton } from '@/components/ui'
import { getOfficeScope } from '@/lib/auth'
import { shortDate } from '@/lib/dates'
import { rpc } from '@/lib/db'
import { fromMinor, money } from '@/lib/money'
import { getHome } from '@/lib/office'
import { officeUrl } from '@/lib/share'
import { t } from '@/i18n'
import { invoiceAction, recordManualAction } from '../../actions'
import { STATUS_CHIP, type Invoice } from '../../types'

type Detail = Invoice & {
  contact_phone: string | null
  contact_name: string | null
  payments: { id: string; amount: number; method: 'momo_mtn' | 'airtel' | 'cash' | 'bank'; reference: string | null; paid_at: string; confirmed: boolean }[]
}

type Props = { params: Promise<{ office: string; id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }

export default async function InvoicePage({ params, searchParams }: Props) {
  const { office: slug, id } = await params
  const flash = await searchParams
  const scope = await getOfficeScope(slug)
  const [{ office }, i] = await Promise.all([getHome(scope.office_id), rpc<Detail>('office_invoice_get', { p_invoice_id: id })])
  const url = officeUrl(`/i/${i.public_token}`)
  const balance = i.amount - i.amount_paid
  const open = ['sent', 'part_paid', 'overdue'].includes(i.status)
  const here = `/o/${slug}/money/invoices/${id}`
  const vars = { name: i.contact_name ?? '', number: i.number, office: office.name, clinic: i.clinic_name, date: shortDate(i.due_date), url }
  const act = invoiceAction.bind(null, slug, id)

  return (
    <>
      <PageHeader title={t('invoice.number', { number: i.number })} back={`/o/${slug}/money`} action={<span className={STATUS_CHIP[i.status]}>{t(`money.status.${i.status}`)}</span>} />
      <Flash {...flash} />
      {i.status === 'void' ? <p className="notice-warning">{i.void_reason}</p> : null}

      <InvoiceDocument invoice={i} seller={office} />

      {i.status !== 'void' && i.status !== 'paid' ? (
        <Section title={t('common.send')}>
          <div className="card space-y-3">
            <WhatsAppButton
              className="btn-whatsapp w-full" phone={i.contact_phone}
              label={open ? t('invoice.reminder') : t('invoice.send')}
              text={open
                ? t('invoice.reminderMessage', { ...vars, amount: money(balance, i.currency) })
                : t('invoice.message', { ...vars, amount: money(i.amount, i.currency) })}
            />
            {i.status === 'draft' ? (
              <form action={act} className="space-y-3">
                <p className="text-sm">{t('invoice.sentHint')}</p>
                <label className="field"><span>{t('invoice.efris')} ({t('common.optional')})</span>
                  <input name="efris_reference" className="input" autoComplete="off" />
                  <span className="mt-1 block text-xs text-muted">{t('invoice.efrisHint')}</span></label>
                <button name="intent" value="send" className="btn-primary w-full">{t('invoice.markSent')}</button>
              </form>
            ) : <p className="break-all font-mono text-xs">{url}</p>}
          </div>
        </Section>
      ) : null}

      {i.payments.length > 0 ? (
        <Section title={t('invoice.payments')}>
          <ul className="card divide-y divide-line-soft py-1 text-sm">
            {i.payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-2.5">
                <span>{t(`money.methodName.${p.method}`)} · {shortDate(p.paid_at)}{p.reference ? ` · ${p.reference}` : ''}{p.confirmed ? '' : ` · ${t('invoice.unconfirmed')}`}</span>
                <span className="font-semibold text-ink">{money(p.amount, i.currency)}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {open ? (
        <Section title={t('money.record')}>
          <form action={recordManualAction.bind(null, slug)} className="card space-y-3">
            <input type="hidden" name="invoice_id" value={id} />
            <input type="hidden" name="return_to" value={here} />
            <div className="grid grid-cols-2 gap-2">
              <label className="field"><span>{t('money.amount', { currency: i.currency })}</span>
                <input name="amount" inputMode="numeric" required defaultValue={fromMinor(balance, i.currency)} className="input" /></label>
              <label className="field"><span>{t('money.method')}</span>
                <select name="method" className="input">
                  {(['cash', 'momo_mtn', 'airtel', 'bank'] as const).map((m) => <option key={m} value={m}>{t(`money.methodName.${m}`)}</option>)}
                </select></label>
            </div>
            <label className="field"><span>{t('money.reference')} ({t('common.optional')})</span><input name="reference" className="input" autoComplete="off" /></label>
            <button className="btn-secondary w-full">{t('money.recordCash')}</button>
          </form>
        </Section>
      ) : null}

      {i.status !== 'void' && i.status !== 'paid' ? (
        <details className="card">
          <summary className="cursor-pointer font-semibold text-red">{t('invoice.void')}</summary>
          <form action={act} className="mt-3 space-y-3">
            <label className="field"><span>{t('invoice.voidReason')}</span><input name="reason" required className="input" /></label>
            <button name="intent" value="void" className="btn-danger w-full">{t('invoice.void')}</button>
          </form>
        </details>
      ) : null}
    </>
  )
}
