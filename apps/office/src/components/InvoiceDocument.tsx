import { shortDate } from '@/lib/dates'
import { money } from '@/lib/money'
import { t } from '@/i18n'

export interface InvoiceDoc {
  number: string
  clinic_name: string
  issue_date: string
  due_date: string
  lines: { description: string; quantity: number; amount: number }[]
  amount: number
  amount_paid: number
  currency: string
  efris_reference: string | null
}

export interface InvoiceSeller {
  name: string
  legal_name: string | null
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
  payout_details: { momo_mtn?: string; airtel?: string; bank?: string; account_name?: string }
}

/**
 * The invoice as the clinic sees it. The seller is the office: its public name,
 * its registered name, its payout details. Karibu appears only in the footer,
 * as the software, never as the party being paid (spec §7.G).
 */
export function InvoiceDocument({ invoice: i, seller }: { invoice: InvoiceDoc; seller: InvoiceSeller }) {
  const balance = i.amount - i.amount_paid
  const pay = seller.payout_details ?? {}
  return (
    <article className="space-y-5 rounded-2xl border border-line bg-white p-5 print:rounded-none print:border-0 print:p-0">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="meta">{t('invoice.from')}</p>
          <p className="text-lg font-semibold text-ink">{seller.name}</p>
          {seller.legal_name ? <p className="text-sm">{t('invoice.registeredAs', { name: seller.legal_name })}</p> : null}
          <p className="text-sm">{[seller.contact_phone, seller.contact_email].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-sm font-semibold text-ink">{i.number}</p>
          <p className="text-sm">{t('invoice.issued', { date: shortDate(i.issue_date) })}</p>
          <p className="text-sm font-medium text-ink">{t('invoice.due', { date: shortDate(i.due_date) })}</p>
        </div>
      </header>

      <div>
        <p className="meta">{t('invoice.billTo')}</p>
        <p className="font-semibold text-ink">{i.clinic_name}</p>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left">
            <th className="py-2 font-medium text-muted">{t('invoice.description')}</th>
            <th className="w-12 py-2 text-right font-medium text-muted">{t('invoice.qty')}</th>
            <th className="w-32 py-2 text-right font-medium text-muted">{t('invoice.amount')}</th>
          </tr>
        </thead>
        <tbody>
          {i.lines.map((l, n) => (
            <tr key={n} className="border-b border-line-soft align-top">
              <td className="py-2 pr-2 text-ink">{l.description}</td>
              <td className="py-2 text-right">{l.quantity}</td>
              <td className="py-2 text-right text-ink">{money(l.amount, i.currency)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td colSpan={2} className="pt-3 text-right">{t('invoice.total')}</td><td className="pt-3 text-right font-semibold text-ink">{money(i.amount, i.currency)}</td></tr>
          {i.amount_paid > 0 ? <tr><td colSpan={2} className="text-right">{t('invoice.paid')}</td><td className="text-right text-ink">{money(i.amount_paid, i.currency)}</td></tr> : null}
          <tr><td colSpan={2} className="pt-1 text-right font-semibold text-ink">{t('invoice.balance')}</td><td className="pt-1 text-right text-base font-semibold text-ink">{money(balance, i.currency)}</td></tr>
        </tfoot>
      </table>

      {balance > 0 ? (
        <div className="rounded-xl bg-line-soft p-4 text-sm">
          <p className="meta mb-1">{t('invoice.payTo')}</p>
          {pay.account_name ? <p className="font-semibold text-ink">{pay.account_name}</p> : null}
          {pay.momo_mtn ? <p>{t('money.mtn')}: <span className="font-mono text-ink">{pay.momo_mtn}</span></p> : null}
          {pay.airtel ? <p>{t('money.airtel')}: <span className="font-mono text-ink">{pay.airtel}</span></p> : null}
          {pay.bank ? <p>{t('money.methodName.bank')}: <span className="text-ink">{pay.bank}</span></p> : null}
          <p className="mt-2">{t('invoice.payNote', { office: seller.name, phone: seller.contact_phone ?? '' })}</p>
        </div>
      ) : null}

      {i.efris_reference ? <p className="text-xs">{t('invoice.efris')}: <span className="font-mono">{i.efris_reference}</span></p> : null}
      <p className="border-t border-line-soft pt-3 text-xs text-muted">{t('invoice.poweredBy', { office: seller.name })}</p>
    </article>
  )
}
