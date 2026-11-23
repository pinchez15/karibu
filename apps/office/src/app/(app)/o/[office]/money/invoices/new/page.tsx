import { ANNUAL_MONTHS_CHARGED, EDITIONS, EDITION_IDS, PRICE_BOOKS, formatMoney } from '@karibu/shared'
import { Flash, PageHeader } from '@/components/ui'
import { getOfficeScope } from '@/lib/auth'
import { rpc } from '@/lib/db'
import { getHome } from '@/lib/office'
import { t } from '@/i18n'
import { createInvoiceAction } from '../../actions'
import type { Money } from '../../types'

type Props = { params: Promise<{ office: string }>; searchParams: Promise<{ clinic?: string; error?: string }> }

export default async function NewInvoicePage({ params, searchParams }: Props) {
  const { office: slug } = await params
  const { clinic, error } = await searchParams
  const scope = await getOfficeScope(slug)
  const [{ office }, data] = await Promise.all([getHome(scope.office_id), rpc<Money>('office_money', { p_office_id: scope.office_id })])
  const book = PRICE_BOOKS[office.country]
  const selected = data.billable.find((b) => b.id === clinic)
  const isLive = selected ? ['live', 'steady', 'billed'].includes(selected.stage) : false

  return (
    <>
      <PageHeader title={t('invoice.newTitle')} back={clinic ? `/o/${slug}/clinics/${clinic}` : `/o/${slug}/money`} />
      <Flash error={error} />
      {data.billable.length === 0 ? <p className="notice-info">{t('invoice.noBillable')}</p> : (
        <form action={createInvoiceAction.bind(null, slug)} className="space-y-4">
          <label className="field"><span>{t('invoice.clinic')}</span>
            <select name="account_id" required defaultValue={clinic ?? ''} className="input">
              <option value="">{t('invoice.chooseClinic')}</option>
              {data.billable.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select></label>

          {/* Prices are the country price book. The partner picks lines; amounts are not typed. */}
          <fieldset className="card space-y-3">
            <label className="flex min-h-touch items-center gap-3 font-semibold text-ink">
              <input type="checkbox" name="subscription" defaultChecked={isLive} className="h-5 w-5" />{t('invoice.subscription')}
            </label>
            <label className="field"><span>{t('invoice.plan')}</span>
              <select name="tier" defaultValue={selected?.tier ?? 'full'} className="input">
                {EDITION_IDS.map((id) => <option key={id} value={id}>{EDITIONS[id].name} · {formatMoney(book.monthly[id], book.currency)}</option>)}
              </select></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="field"><span>{t('invoice.month')}</span>
                <input type="month" name="month" defaultValue={new Date().toISOString().slice(0, 7)} className="input" /></label>
              <label className="field"><span>{t('invoice.months')}</span>
                <select name="term" className="input">
                  <option value="month">1</option>
                  <option value="annual">{t('invoice.annual', { charged: ANNUAL_MONTHS_CHARGED })}</option>
                </select></label>
            </div>
          </fieldset>

          <fieldset className="card space-y-3">
            <label className="flex min-h-touch items-center gap-3 font-semibold text-ink">
              <input type="checkbox" name="setup" defaultChecked={!isLive} className="h-5 w-5" />
              {t('invoice.setup')} · {formatMoney(book.setup, book.currency)}
            </label>
            <label className="field"><span>{t('invoice.trainingDays')} · {formatMoney(book.extraTrainingDay, book.currency)}</span>
              <input name="training_days" type="number" inputMode="numeric" min={0} max={30} defaultValue={0} className="input" /></label>
          </fieldset>

          <fieldset className="card space-y-3">
            <h3>{t('invoice.other')} ({t('common.optional')})</h3>
            <label className="field"><span>{t('invoice.otherDescription')}</span><input name="other_description" className="input" /></label>
            <label className="field"><span>{t('invoice.otherAmount', { currency: book.currency })}</span><input name="other_amount" inputMode="numeric" className="input" /></label>
          </fieldset>

          <label className="field"><span>{t('invoice.dueDate')} ({t('common.optional')})</span><input type="date" name="due_date" className="input" /></label>
          <button className="btn-primary w-full">{t('invoice.create')}</button>
        </form>
      )}
    </>
  )
}
