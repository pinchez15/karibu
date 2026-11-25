import { Flash, Meter, Stat, WhatsAppButton } from '@/components/ui'
import { getOfficeScope } from '@/lib/auth'
import { forecast, type CashflowData } from '@/lib/cashflow'
import { monthLabel } from '@/lib/dates'
import { rpc } from '@/lib/db'
import { money } from '@/lib/money'
import { getHome } from '@/lib/office'
import { portfolio } from '@/lib/portfolio'
import type { ClinicAccount } from '@/lib/types'
import { worklist, type WorkKind } from '@/lib/worklist'
import { t } from '@/i18n'
import { addTaskAction, closeTaskAction } from './actions'
import type { Money } from './money/types'

type Props = { params: Promise<{ office: string }>; searchParams: Promise<{ ok?: string; error?: string; show?: string }> }

const KIND_CHIP: Record<WorkKind, string> = {
  risk: 'chip-danger', money: 'chip-warning', watch: 'chip-warning', sales: 'chip-info',
  onboarding: 'chip-neutral', support: 'chip-neutral', karibu: 'chip-neutral', todo: 'chip-neutral',
}

// Home answers two questions in one screen: how is the business doing, and
// what needs me today. Numbers first, then one ranked list with one action per row.
export default async function HomePage({ params, searchParams }: Props) {
  const { office: slug } = await params
  const { show, ...flash } = await searchParams
  const scope = await getOfficeScope(slug)
  const base = `/o/${slug}`
  // Money and cash flow are owner and support only; other roles simply don't get those tiles.
  const [home, clinics, moneyData, cash] = await Promise.all([
    getHome(scope.office_id),
    rpc<ClinicAccount[]>('office_clinics_list', { p_office_id: scope.office_id }),
    rpc<Money>('office_money', { p_office_id: scope.office_id }).catch(() => null),
    rpc<CashflowData>('office_cashflow', { p_office_id: scope.office_id }).catch(() => null),
  ])
  const now = Date.now()
  const cur = home.office.currency
  const p = portfolio(clinics, home.office.country, now)
  const all = worklist({ base, tasks: home.tasks, payments: moneyData?.unconfirmed_payments ?? [], clinics, now, t })
  const kinds = [...new Set(all.map((i) => i.kind))]
  const items = show && kinds.includes(show as WorkKind) ? all.filter((i) => i.kind === show) : all

  const thisMonth = `${new Date(now).toISOString().slice(0, 7)}-01`
  const month = moneyData?.by_month.find((m) => m.month === thisMonth)
  const f = cash
    ? forecast({ thisMonth, country: home.office.country, clinics, data: cash, partnerFee: home.office.fee_starts_on ? home.office.fee_amount : 0, months: 3 })
    : null
  const liveCount = p.live.length
  const openCount = p.sales.length + p.onboarding.length
  const funnel: [string, number, string][] = [
    [t('clinics.stage.lead'), clinics.filter((c) => c.stage === 'lead').length, 'bg-coral-bright/40'],
    [t('clinics.stage.contacted'), clinics.filter((c) => c.stage === 'contacted').length, 'bg-coral-bright/40'],
    [t('clinics.stage.demo'), clinics.filter((c) => c.stage === 'demo').length, 'bg-coral-bright/70'],
    [t('shell.onboarding'), p.onboarding.length, 'bg-coral-bright'],
    [t('clinics.stage.live'), liveCount, 'bg-green'],
  ]
  const funnelPeak = Math.max(1, ...funnel.map(([, n]) => n))

  return (
    <div className="wide flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] text-muted">
            {new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Kampala' }).format(now)}
          </p>
          <h1 className="lg:text-[26px]">
            {all.length === 0 ? t('today.title0') : all.length === 1 ? t('today.title1') : t('today.titleN', { n: all.length })}
          </h1>
          {all.length === 0 ? <p className="mt-1 text-[15px]">{t('today.sub0')}</p> : null}
        </div>
        <div className="flex gap-2">
          <a href={`${base}/leads/register`} className="btn-secondary btn-sm">{t('today.findClinics')}</a>
          <a href={`${base}/clinics/new`} className="btn-secondary btn-sm">{t('clinics.add')}</a>
        </div>
      </div>

      <Flash {...flash} />

      {home.office.status === 'pending' ? <p className="notice-info">{t('home.pending')}</p> : null}
      {home.fee_status === 'lapsed' ? (
        <a href={`${base}/more/account`} className="notice-danger block">
          <strong>{t('home.feeLapsed')}</strong>
          <span className="mt-0.5 block">{t('home.feeLapsedBody')}</span>
        </a>
      ) : home.fee_status === 'due' ? (
        <a href={`${base}/more/account`} className="notice-warning block font-semibold">{t('home.feeDue')}</a>
      ) : null}

      <div className="order-last grid gap-3 sm:grid-cols-2 lg:order-none xl:grid-cols-4">
        <Stat
          href={`${base}/analytics`} label={t('today.mrr')} value={money(p.mrr, cur)}
          note={p.liveWithoutPlan > 0
            ? <span className="font-semibold text-amber-ink">{t('today.mrrNoPlan', { n: p.liveWithoutPlan })}</span>
            : liveCount > 0 ? t('today.mrrNote', { n: liveCount }) : t('today.mrrNone')}
        />
        {moneyData ? (
          <Stat
            href={`${base}/money`} label={t('today.collected', { month: monthLabel(thisMonth) })} value={money(month?.collected ?? 0, cur)}
            note={
              <>
                {month && month.billed > 0 ? (
                  <>
                    <Meter label={t('today.collectedOf', { pct: Math.round((month.collected / month.billed) * 100), billed: money(month.billed, cur) })} parts={[{ value: month.collected, className: 'bg-coral-bright' }, { value: Math.max(0, month.billed - month.collected), className: 'bg-line' }]} />
                    <span className="mt-1.5 block">{t('today.collectedOf', { pct: Math.round((month.collected / month.billed) * 100), billed: money(month.billed, cur) })}</span>
                  </>
                ) : t('today.collectedNone')}
                {home.invoices.overdue > 0 ? <span className="block font-semibold text-amber-ink">{t('today.overdue', { n: home.invoices.overdue })}</span> : null}
              </>
            }
          />
        ) : null}
        <Stat
          href={`${base}/clinics`} label={t('today.live')} value={liveCount}
          note={liveCount > 0 ? (
            <>
              <Meter label={t('today.healthMix', p.health)} parts={[{ value: p.health.green, className: 'bg-green' }, { value: p.health.amber, className: 'bg-amber' }, { value: p.health.red, className: 'bg-red' }, { value: p.health.unknown, className: 'bg-line' }]} />
              <span className="mt-1.5 block">{t('today.healthMix', p.health)}</span>
            </>
          ) : t('today.noLive')}
        />
        <Stat
          href={`${base}/pipeline`} label={t('shell.pipeline')} value={openCount === 1 ? t('today.pipeline1') : t('today.pipelineN', { n: openCount })}
          note={
            <>
              {p.pipelineValue > 0 ? <span className="block">{t('today.pipelineValue', { amount: money(p.pipelineValue, cur) })}</span> : null}
              {p.followUpsOverdue.length > 0 ? <span className="block font-semibold text-amber-ink">{t('today.followUps', { n: p.followUpsOverdue.length })}</span> : null}
              {p.pipelineValue === 0 && p.followUpsOverdue.length === 0 ? t('today.pipelineEmpty') : null}
            </>
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section aria-label={t('today.needs')} className="space-y-3 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base">{t('today.needs')}</h2>
            {kinds.length > 1 ? (
              <div className="flex flex-wrap gap-1.5">
                <a href={base} className={`rounded-full px-3 py-1 text-[13px] font-semibold ${!show ? 'bg-ink text-white' : 'border border-line text-body'}`}>{t('clinics.filterAll')} {all.length}</a>
                {kinds.map((k) => (
                  <a key={k} href={`${base}?show=${k}`} className={`rounded-full px-3 py-1 text-[13px] font-semibold ${show === k ? 'bg-ink text-white' : 'border border-line text-body'}`}>
                    {t(`today.kind.${k}`)} {all.filter((i) => i.kind === k).length}
                  </a>
                ))}
              </div>
            ) : null}
          </div>

          {items.length === 0 ? (
            <div className="card space-y-3">
              <p className="text-sm">{t('home.allClearHint')}</p>
              <div className="flex flex-wrap gap-2">
                <a href={`${base}/clinics/new`} className="btn-primary btn-sm">{t('clinics.add')}</a>
                <a href={`${base}/clinics/import`} className="btn-secondary btn-sm">{t('clinics.import')}</a>
                <a href={`${base}/more/share`} className="btn-secondary btn-sm">{t('more.share')}</a>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-line-soft overflow-hidden rounded-2xl border border-line bg-surface">
              {items.map((item) => (
                <li key={item.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
                  <span className={`${KIND_CHIP[item.kind]} lg:w-28 lg:justify-center`}>{t(`today.kind.${item.kind}`)}</span>
                  <a href={item.href ?? '#'} className="min-w-0 flex-1 basis-64">
                    <span className="block text-[15px] font-semibold leading-snug text-ink">{item.title}</span>
                    {item.detail ? <span className="block text-sm">{item.detail}</span> : null}
                    {item.overdue ? <span className="mt-0.5 inline-block text-xs font-semibold text-amber-ink">{t('common.overdue')}</span> : null}
                  </a>
                  <span className="flex gap-2">
                    {item.phone ? (
                      <WhatsAppButton
                        className="btn-whatsapp btn-xs" phone={item.phone} text=""
                        label="WhatsApp" title={item.contact ?? undefined}
                      />
                    ) : null}
                    {item.href ? <a href={item.href} className="btn-secondary btn-xs">{t('common.open')}</a> : null}
                    {item.taskId ? (
                      <form action={closeTaskAction.bind(null, slug)}>
                        <input type="hidden" name="task_id" value={item.taskId} />
                        <button className="btn-quiet btn-xs" aria-label={`${t('common.done')}: ${item.title}`}>{t('common.done')}</button>
                      </form>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <form action={addTaskAction.bind(null, slug)} className="flex gap-2">
            <input name="title" className="input rounded-full px-4" placeholder={t('today.addPlaceholder')} aria-label={t('home.addTask')} />
            <button className="btn-secondary shrink-0">{t('common.add')}</button>
          </form>
        </section>

        <aside className="space-y-4">
          {f ? (
            <section className="card space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-[15px]">{t('today.cash')}</h2>
                <a href={`${base}/money/cashflow`} className="text-[13px] font-semibold text-coral">{t('today.cashOpen')}</a>
              </div>
              {f.missing.includes('balance') || f.missing.includes('costs') ? (
                <p className="text-sm">{t('today.cashEmpty')}</p>
              ) : (
                <>
                  <ul className="space-y-1.5 text-sm">
                    {f.months.map((m) => (
                      <li key={m.month} className="flex items-baseline justify-between gap-3">
                        <span>{monthLabel(m.month)}</span>
                        <span className="num text-right">
                          <span className={`font-semibold ${m.net < 0 ? 'text-red' : 'text-green-ink'}`}>{m.net < 0 ? '−' : '+'}{money(Math.abs(m.net), cur)}</span>
                          {m.closing !== null ? <span className="block text-xs text-muted">{t('today.cashClosing', { amount: money(m.closing, cur) })}</span> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {f.breakEvenClinics !== null ? (
                    <p className={f.liveClinics >= f.breakEvenClinics ? 'text-[13px]' : 'notice-warning text-[13px]'}>
                      {f.liveClinics >= f.breakEvenClinics
                        ? t('today.breakEvenOk', { need: f.breakEvenClinics, have: f.liveClinics })
                        : t('today.breakEvenShort', { need: f.breakEvenClinics, have: f.liveClinics })}
                    </p>
                  ) : null}
                </>
              )}
            </section>
          ) : null}

          <section className="card space-y-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-[15px]">{t('today.funnel')}</h2>
              <a href={`${base}/pipeline`} className="text-[13px] font-semibold text-coral">{t('shell.pipeline')}</a>
            </div>
            {funnel.map(([label, n, bar]) => (
              <div key={label} className="flex items-center gap-2.5 text-[13px]">
                <span className="w-24 shrink-0">{label}</span>
                <span className="h-2 flex-1 rounded-full bg-line-soft"><span className={`block h-2 rounded-full ${bar}`} style={{ width: `${(n / funnelPeak) * 100}%` }} /></span>
                <span className="num w-6 shrink-0 text-right font-semibold text-ink">{n}</span>
              </div>
            ))}
          </section>

          {!home.office.certified_at ? (
            <div className="card">
              <p className="font-semibold text-ink">{t('home.notCertified')}</p>
              <p className="text-sm">{t('home.notCertifiedBody')}</p>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
