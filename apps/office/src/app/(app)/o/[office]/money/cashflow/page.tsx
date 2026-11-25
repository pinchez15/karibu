import { Flash, PageHeader, Stat, Tabs } from '@/components/ui'
import { getOfficeScope } from '@/lib/auth'
import { forecast, type CashflowData } from '@/lib/cashflow'
import { monthLabel, shortDate } from '@/lib/dates'
import { rpc } from '@/lib/db'
import { fromMinor, money } from '@/lib/money'
import { getHome } from '@/lib/office'
import type { ClinicAccount } from '@/lib/types'
import { t } from '@/i18n'
import { removeCostAction, saveCostAction, setBalanceAction } from './actions'

type Props = { params: Promise<{ office: string }>; searchParams: Promise<{ ok?: string; error?: string; sign?: string }> }

const SIGN_OPTIONS = [0, 1, 2, 3]

// Six months of cash, from things the office already has. Nothing here is a
// bank feed and Karibu never touches the money: the partner types in what is
// in their accounts and what they spend, and the page does the arithmetic.
// When an input is missing the page asks for it rather than guessing.
export default async function CashflowPage({ params, searchParams }: Props) {
  const { office: slug } = await params
  const { sign: signRaw, ...flash } = await searchParams
  const scope = await getOfficeScope(slug)
  const [home, data, clinics] = await Promise.all([
    getHome(scope.office_id),
    rpc<CashflowData>('office_cashflow', { p_office_id: scope.office_id }),
    rpc<ClinicAccount[]>('office_clinics_list', { p_office_id: scope.office_id }),
  ])
  const base = `/o/${slug}/money`
  const here = `${base}/cashflow`
  const cur = home.office.currency
  const sign = SIGN_OPTIONS.includes(Number(signRaw)) ? Number(signRaw) : 0
  const thisMonth = `${new Date().toISOString().slice(0, 7)}-01`
  const f = forecast({
    thisMonth, country: home.office.country, clinics, data, signPerMonth: sign,
    partnerFee: home.office.fee_starts_on ? home.office.fee_amount : 0,
  })
  const peak = Math.max(1, ...f.months.flatMap((m) => [m.moneyIn, m.moneyOut]))
  const signed = (n: number) => `${n < 0 ? '−' : '+'}${money(Math.abs(n), cur)}`
  const costLabels = [...new Set(f.months.flatMap((m) => m.costs.map((c) => c.label)))]
  const label = (key: string) => (key === 'partner_fee' ? t('cash.partnerFee') : key)
  const hasNumbers = f.liveClinics > 0 || data.costs.length > 0 || data.open_invoices.length > 0
  const tight = f.tightest !== null ? f.months[f.tightest] : null
  const low = f.lowest !== null ? f.months[f.lowest] : null
  // With no costs entered, the only cost is the partner fee, and "you break even at 1 clinic" would be a lie.
  const breakEven = data.costs.length === 0 ? null : f.breakEvenClinics

  const rows: { label: string; cells: number[]; kind?: 'sum' | 'total'; signed?: boolean }[] = [
    { label: t('cash.rowSubscriptions'), cells: f.months.map((m) => m.subscriptions) },
    ...(f.months.some((m) => m.unpaid > 0) ? [{ label: t('cash.rowUnpaid'), cells: f.months.map((m) => m.unpaid) }] : []),
    ...(sign > 0 ? [{ label: t('cash.rowNew', { n: sign }), cells: f.months.map((m) => m.newClinics) }] : []),
    { label: t('cash.moneyIn'), cells: f.months.map((m) => m.moneyIn), kind: 'sum' as const },
    ...costLabels.map((key) => ({ label: label(key), cells: f.months.map((m) => m.costs.filter((c) => c.label === key).reduce((s, c) => s + c.amount, 0)) })),
    { label: t('cash.moneyOut'), cells: f.months.map((m) => m.moneyOut), kind: 'sum' as const },
    { label: t('cash.leftOver'), cells: f.months.map((m) => m.net), kind: 'total' as const, signed: true },
    ...(data.balance ? [{ label: t('cash.closing'), cells: f.months.map((m) => m.closing ?? 0), kind: 'total' as const }] : []),
  ]

  return (
    <div className="wide space-y-5">
      <PageHeader title={t('shell.cashflow')} sub={t('cash.sub')} action={<a href={`${base}/export`} className="btn-secondary btn-sm">{t('cash.export')}</a>} />
      <Tabs items={[
        { href: base, label: t('cash.tabInvoices'), badge: home.invoices.overdue + home.unmatched_payments },
        { href: here, label: t('cash.tabForecast'), on: true },
      ]} />
      <Flash {...flash} />

      {f.missing.length > 0 ? (
        <ul className="notice-info space-y-1">
          {f.missing.map((key) => <li key={key}>{t(`cash.missing.${key}`)}</li>)}
        </ul>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card space-y-2">
          <span className="block text-[13px] text-muted">{t('cash.balance')}</span>
          <span className="num block text-[22px] font-semibold leading-tight text-ink">{data.balance ? money(data.balance.amount, cur) : '—'}</span>
          <details>
            <summary className="list-none text-[13px] font-semibold text-coral">
              {data.balance ? t('cash.balanceUpdate', { when: shortDate(data.balance.at) }) : t('cash.balanceEnter')}
            </summary>
            <form action={setBalanceAction.bind(null, slug)} className="mt-2 flex gap-2">
              <input name="amount" inputMode="numeric" required className="input min-h-0 py-2" aria-label={t('cash.balanceLabel', { currency: cur })}
                defaultValue={data.balance ? fromMinor(data.balance.amount, cur) : ''} placeholder={t('cash.balanceLabel', { currency: cur })} />
              <button className="btn-secondary btn-xs shrink-0">{t('common.save')}</button>
            </form>
            <p className="mt-1.5 text-xs text-muted">{t('cash.balanceHint')}</p>
          </details>
        </div>
        <Stat
          label={t('cash.mrr')} value={money(f.mrr, cur)}
          note={f.liveClinics > 0 ? t('cash.mrrNote', { n: f.liveClinics, avg: money(f.avgPerClinic, cur) }) : t('today.noLive')}
        />
        <Stat
          label={t('cash.costs')} value={money(f.monthlyCosts, cur)}
          note={<a href="#costs" className="font-semibold text-coral">{data.costs.length === 0 ? t('cash.costsAdd') : t('cash.costsEdit', { n: data.costs.length })}</a>}
        />
        <Stat
          label={t('cash.breakEven')}
          value={breakEven === null ? '—' : breakEven === 1 ? t('today.pipeline1') : t('today.pipelineN', { n: breakEven })}
          tone={breakEven !== null && f.liveClinics < breakEven ? 'warn' : undefined}
          note={breakEven === null ? t('cash.breakEvenNone')
            : f.liveClinics === breakEven ? t('cash.breakEvenExact', { have: f.liveClinics })
            : f.liveClinics > breakEven ? t('cash.breakEvenOk', { have: f.liveClinics, spare: f.liveClinics - breakEven })
            : t('cash.breakEvenShort', { have: f.liveClinics, more: breakEven - f.liveClinics })}
        />
      </div>

      {hasNumbers ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <section className="card space-y-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[15px]">{t('cash.chart')}</h2>
                <span className="flex gap-3 text-xs text-muted">
                  <span><span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm bg-coral-bright" /> {t('cash.in')}</span>
                  <span><span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm bg-ink/25" /> {t('cash.out')}</span>
                </span>
              </div>
              <div className="grid grid-cols-6 gap-2">
                {f.months.map((m, i) => (
                  <div key={m.month} className={`flex flex-col items-center gap-1.5 rounded-xl px-1 py-2 ${m.net < 0 ? 'bg-red-soft/60' : i === f.tightest ? 'bg-amber-soft/50' : ''}`}>
                    <span role="img" aria-label={t('cash.monthAlt', { month: monthLabel(m.month), in: money(m.moneyIn, cur), out: money(m.moneyOut, cur) })} className="flex h-32 w-full items-end justify-center gap-1.5">
                      <span className="w-1/3 max-w-[28px] rounded-t bg-coral-bright" style={{ height: `${Math.max(1, (m.moneyIn / peak) * 100)}%` }} />
                      <span className="w-1/3 max-w-[28px] rounded-t bg-ink/25" style={{ height: `${Math.max(1, (m.moneyOut / peak) * 100)}%` }} />
                    </span>
                    <span className="text-[13px] font-semibold text-ink">{monthLabel(m.month).split(' ')[0]}</span>
                    <span className={`num text-[11px] font-semibold sm:text-xs ${m.net < 0 ? 'text-red' : 'text-green-ink'}`}>{signed(m.net)}</span>
                  </div>
                ))}
              </div>
              {tight || low ? (
                <p className={tight && tight.net < 0 ? 'notice-warning' : 'text-sm'}>
                  {tight ? (tight.net < 0
                    ? t('cash.tightNegative', { month: monthLabel(tight.month), amount: money(-tight.net, cur) })
                    : t('cash.tightPositive', { month: monthLabel(tight.month), amount: money(tight.net, cur) })) : null}
                  {low ? ` ${t('cash.lowest', { month: monthLabel(low.month), amount: money(low.closing ?? 0, cur) })}` : null}
                </p>
              ) : null}
            </section>

            <div className="table-wrap">
              <table className="table num min-w-[640px] [&_td]:px-3 [&_th]:px-3">
                <thead>
                  <tr>
                    <th scope="col">{cur}</th>
                    {f.months.map((m) => <th key={m.month} scope="col" className="text-right">{monthLabel(m.month).split(' ')[0]}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.label} className={r.kind === 'total' ? 'bg-background' : undefined}>
                      <th scope="row" className={`!bg-transparent !text-sm ${r.kind ? '!font-semibold !text-ink' : '!font-normal !text-body'}`}>{r.label}</th>
                      {r.cells.map((n, i) => (
                        <td key={i} className={`text-right ${r.kind ? 'font-semibold text-ink' : ''} ${r.signed && n < 0 ? '!text-red' : ''}`}>
                          {r.signed ? signed(n).replace(`${cur} `, '') : n === 0 ? '—' : money(n, cur).replace(`${cur} `, '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted">{t('cash.how')}</p>
          </div>

          <aside className="space-y-4">
            <section className="card space-y-2 border-coral/25 bg-coral-wash">
              <h2 className="text-[15px]">{t('cash.whatIf')}</h2>
              <p className="text-sm">{t('cash.whatIfBody')}</p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('cash.whatIf')}>
                {SIGN_OPTIONS.map((n) => (
                  <a key={n} href={n === 0 ? here : `${here}?sign=${n}`} aria-current={sign === n ? 'true' : undefined}
                    className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${sign === n ? 'bg-ink text-white' : 'border border-ink/20 bg-surface text-ink'}`}>
                    {n === 0 ? t('cash.signNone') : t('cash.signN', { n })}
                  </a>
                ))}
              </div>
              <p className="text-[13px]">{t('cash.whatIfHire')}</p>
            </section>

            {f.latePayers.length > 0 ? (
              <section className="card space-y-2">
                <h2 className="text-[15px]">{f.latePayers.length === 1 ? t('cash.late1') : t('cash.lateN', { n: f.latePayers.length })}</h2>
                <dl className="space-y-1.5 text-sm">
                  {f.latePayers.map((p) => (
                    <div key={p.clinic_account_id} className="flex items-baseline justify-between gap-3">
                      <dt><a href={`/o/${slug}/clinics/${p.clinic_account_id}`} className="text-ink hover:text-coral">{p.clinic_name}</a></dt>
                      <dd className="num font-semibold text-amber-ink">{t('cash.days', { n: p.avg_days })}</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-[13px]">{t('cash.lateBody')}</p>
              </section>
            ) : null}

            {data.open_invoices.length > 0 ? (
              <section className="card space-y-2">
                <h2 className="text-[15px]">{t('cash.unpaidTitle')}</h2>
                <ul className="space-y-1.5 text-sm">
                  {data.open_invoices.slice(0, 6).map((i) => (
                    <li key={i.id} className="flex items-baseline justify-between gap-3">
                      <a href={`${base}/invoices/${i.id}`} className="min-w-0 truncate text-ink hover:text-coral">{i.clinic_name} · {i.number}</a>
                      <span className="num shrink-0 font-semibold text-ink">{money(i.balance, cur)}</span>
                    </li>
                  ))}
                </ul>
                <a href={base} className="text-[13px] font-semibold text-coral">{t('cash.tabInvoices')} →</a>
              </section>
            ) : null}
          </aside>
        </div>
      ) : null}

      <section id="costs" className="scroll-mt-20 space-y-3">
        <div>
          <h2 className="text-[15px]">{t('cash.costsTitle')}</h2>
          <p className="text-sm">{t('cash.costsBody')}</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {data.costs.length === 0 ? <p className="card text-sm">{t('cash.costsEmpty')}</p> : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">{t('cash.costName')}</th>
                      <th scope="col">{t('cash.costWhen')}</th>
                      <th scope="col" className="text-right">{t('cash.costAmount')}</th>
                      <th scope="col"><span className="sr-only">{t('money.remove')}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.costs.map((c) => (
                      <tr key={c.id}>
                        <td className="font-semibold text-ink">{c.label}</td>
                        <td>
                          {c.cadence === 'once' ? t('cash.onceIn', { month: monthLabel(c.starts_on) })
                            : c.starts_on > thisMonth ? t('cash.monthlyFrom', { month: monthLabel(c.starts_on) }) : t('cash.monthly')}
                        </td>
                        <td className="num text-right font-semibold text-ink">{money(c.amount, cur)}</td>
                        <td className="text-right">
                          <form action={removeCostAction.bind(null, slug)}>
                            <input type="hidden" name="cost_id" value={c.id} />
                            <button className="btn-quiet btn-xs" aria-label={`${t('money.remove')}: ${c.label}`}>{t('money.remove')}</button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <form action={saveCostAction.bind(null, slug)} className="card space-y-3">
            <h3 className="text-[15px]">{t('cash.costAdd')}</h3>
            <label className="field"><span>{t('cash.costName')}</span><input name="label" required className="input" placeholder={t('cash.costNameHint')} /></label>
            <label className="field"><span>{t('money.amount', { currency: cur })}</span><input name="amount" inputMode="numeric" required className="input" /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="field"><span>{t('cash.costHow')}</span>
                <select name="cadence" className="input"><option value="monthly">{t('cash.monthly')}</option><option value="once">{t('cash.once')}</option></select></label>
              <label className="field"><span>{t('cash.costFrom')}</span><input name="starts_on" type="month" defaultValue={thisMonth.slice(0, 7)} className="input" /></label>
            </div>
            <button className="btn-primary w-full">{t('cash.costAdd')}</button>
          </form>
        </div>
      </section>
    </div>
  )
}
