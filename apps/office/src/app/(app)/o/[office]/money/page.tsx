import { Flash, PageHeader, Section } from '@/components/ui'
import { getOfficeScope } from '@/lib/auth'
import { monthLabel, shortDate } from '@/lib/dates'
import { rpc } from '@/lib/db'
import { money } from '@/lib/money'
import { getHome } from '@/lib/office'
import { t } from '@/i18n'
import { generateMonthAction, importStatementAction, matchPaymentAction, recordManualAction, recordSmsAction } from './actions'
import { STATUS_CHIP, type Money } from './types'

type Props = { params: Promise<{ office: string }>; searchParams: Promise<{ ok?: string; error?: string }> }

export default async function MoneyPage({ params, searchParams }: Props) {
  const { office: slug } = await params
  const flash = await searchParams
  const scope = await getOfficeScope(slug)
  const [home, data] = await Promise.all([getHome(scope.office_id), rpc<Money>('office_money', { p_office_id: scope.office_id })])
  const cur = home.office.currency
  const base = `/o/${slug}/money`
  const thisMonth = monthLabel(new Date().toISOString())

  return (
    <>
      <PageHeader title={t('money.title')} action={<a href={`${base}/invoices/new`} className="btn-primary shrink-0">{t('money.newInvoice')}</a>} />
      {/* Both can be set: a monthly run that created some invoices and skipped others. */}
      {flash.ok ? <Flash ok={flash.ok} /> : null}
      {flash.error ? <Flash error={flash.error} /> : null}
      {data.invoices.length === 0 ? <p className="notice-info">{t('money.locked')}</p> : null}

      <div className="wide grid grid-cols-3 gap-2 lg:gap-4">
        {(['billed', 'collected', 'outstanding'] as const).map((k) => (
          <div key={k} className="card px-3 py-3">
            <span className="meta block">{t(`money.${k}`)}</span>
            <span className={`mt-1 block text-[15px] font-semibold ${k === 'outstanding' && data.totals[k] > 0 ? 'text-amber-ink' : 'text-ink'}`}>
              {money(data.totals[k], cur)}
            </span>
          </div>
        ))}
      </div>

      {data.unconfirmed_payments.length > 0 ? (
        <Section title={t('money.toConfirm')}>
          <ul className="space-y-2">
            {data.unconfirmed_payments.map((p) => (
              <li key={p.id} className="card space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <span>
                    <span className="block font-semibold text-ink">{money(p.amount, p.currency)}</span>
                    <span className="block text-sm">{[t(`money.methodName.${p.method}`), p.payer_name, p.payer_phone].filter(Boolean).join(' · ')}</span>
                    <span className="meta">{shortDate(p.paid_at)}{p.reference ? ` · ${p.reference}` : ''}</span>
                  </span>
                </div>
                <p className={`text-sm ${p.suggested_invoice ? 'text-ink' : 'text-muted'}`}>
                  {p.suggested_invoice ? t('money.suggested', { number: p.suggested_invoice.number, clinic: p.suggested_invoice.clinic_name }) : t('money.noSuggestion')}
                </p>
                <form action={matchPaymentAction.bind(null, slug)} className="space-y-2">
                  <input type="hidden" name="payment_id" value={p.id} />
                  <select name="invoice_id" defaultValue={p.suggested_invoice_id ?? ''} className="input" aria-label={t('money.chooseInvoice')}>
                    <option value="">{t('money.chooseInvoice')}</option>
                    {data.open_invoices.map((i) => <option key={i.id} value={i.id}>{i.number} · {i.clinic_name} · {money(i.balance, cur)}</option>)}
                  </select>
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <button name="intent" value="match" className="btn-primary">{t('money.confirm')}</button>
                    <button name="intent" value="remove" className="btn-secondary">{t('money.remove')}</button>
                  </div>
                </form>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <div className="wide grid gap-5 lg:grid-cols-5 lg:gap-8">
      <div id="record" className="scroll-mt-20 space-y-5 lg:order-2 lg:col-span-2">
      <Section title={t('money.record')}>
        <p className="text-sm text-muted">{t('money.disclaimer')}</p>
        <form action={recordSmsAction.bind(null, slug)} className="card space-y-3">
          <label className="field"><span>{t('money.paste')}</span>
            <textarea name="sms" rows={4} required className="input text-sm" placeholder="You have received UGX 130,000 from …" /></label>
          <p className="text-xs text-muted">{t('money.pasteHint')}</p>
          <label className="field"><span>{t('money.network')}</span>
            <select name="network" className="input"><option value="momo_mtn">{t('money.mtn')}</option><option value="airtel">{t('money.airtel')}</option></select></label>
          <button className="btn-primary w-full">{t('money.readSms')}</button>
        </form>

        <details className="card">
          <summary className="cursor-pointer font-semibold text-ink">{t('money.cash')}</summary>
          <form action={recordManualAction.bind(null, slug)} className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="field"><span>{t('money.amount', { currency: cur })}</span><input name="amount" inputMode="numeric" required className="input" /></label>
              <label className="field"><span>{t('money.method')}</span>
                <select name="method" className="input">
                  {(['cash', 'bank', 'momo_mtn', 'airtel'] as const).map((m) => <option key={m} value={m}>{t(`money.methodName.${m}`)}</option>)}
                </select></label>
            </div>
            <label className="field"><span>{t('money.reference')} ({t('common.optional')})</span><input name="reference" className="input" autoComplete="off" /></label>
            <label className="field"><span>{t('money.forInvoice')}</span>
              <select name="invoice_id" className="input">
                <option value="">{t('money.noInvoice')}</option>
                {data.open_invoices.map((i) => <option key={i.id} value={i.id}>{i.number} · {i.clinic_name} · {money(i.balance, cur)}</option>)}
              </select></label>
            <button className="btn-secondary w-full">{t('money.recordCash')}</button>
          </form>
        </details>

        <details className="card">
          <summary className="cursor-pointer font-semibold text-ink">{t('money.statement')}</summary>
          <form action={importStatementAction.bind(null, slug)} className="mt-3 space-y-3">
            <p className="text-sm">{t('money.statementHint')}</p>
            <input type="file" name="file" accept=".csv,text/csv" required className="input" />
            <select name="method" className="input" aria-label={t('money.method')}>
              {(['bank', 'momo_mtn', 'airtel'] as const).map((m) => <option key={m} value={m}>{t(`money.methodName.${m}`)}</option>)}
            </select>
            <button className="btn-secondary w-full">{t('money.importStatement')}</button>
          </form>
        </details>
      </Section>
      </div>

      <div className="space-y-5 lg:col-span-3">
      <Section title={t('money.invoices')}>
        <form action={generateMonthAction.bind(null, slug)}>
          <button className="btn-secondary w-full">{t('money.runMonth', { month: thisMonth })}</button>
        </form>
        {data.invoices.length === 0 ? <p className="card text-sm">{t('money.noInvoices')}</p> : (
          <ul className="space-y-2">
            {data.invoices.map((i) => (
              <li key={i.id}>
                <a href={`${base}/invoices/${i.id}`} className="card flex items-center justify-between gap-3 active:bg-line-soft">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-ink">{i.clinic_name}</span>
                    <span className="meta">{i.number} · {t('common.due', { date: shortDate(i.due_date) })}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold text-ink">{money(i.amount, i.currency)}</span>
                    <span className={STATUS_CHIP[i.status]}>{t(`money.status.${i.status}`)}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {data.by_clinic.length > 0 ? (
        <Section title={t('money.byClinic')}>
          <ul className="card divide-y divide-line-soft py-1 text-sm">
            {data.by_clinic.map((c) => (
              <li key={c.clinic_account_id} className="flex items-center justify-between gap-2 py-2.5">
                <span className="min-w-0 truncate text-ink">{c.clinic_name}</span>
                <span className="shrink-0 text-right">
                  <span className="block text-ink">{money(c.collected, cur)} / {money(c.billed, cur)}</span>
                  {c.outstanding > 0 ? <span className="text-xs text-amber-ink">{money(c.outstanding, cur)} {t('money.outstanding').toLowerCase()}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {data.by_month.length > 0 ? (
        <Section title={t('money.byMonth')}>
          <ul className="card divide-y divide-line-soft py-1 text-sm">
            {data.by_month.map((m) => (
              <li key={m.month} className="flex items-center justify-between gap-2 py-2.5">
                <span className="text-ink">{monthLabel(m.month)}</span>
                <span className="text-ink">{money(m.collected, cur)} / {money(m.billed, cur)}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <a href={`${base}/export`} className="btn-secondary w-full sm:w-auto">{t('money.export')}</a>
      </div>
      </div>
    </>
  )
}
