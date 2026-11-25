import type { ReactNode } from 'react'
import { Icon } from '@/components/icons'
import { Bars, Flash, HealthChip, PageHeader } from '@/components/ui'
import { getOfficeScope } from '@/lib/auth'
import { shortDate } from '@/lib/dates'
import { rpc } from '@/lib/db'
import { money } from '@/lib/money'
import { getHome } from '@/lib/office'
import { panels, rankClinics, readyCount, type AnalyticsData, type PanelKey, type Unit } from '@/lib/analytics'
import { monthlyValue } from '@/lib/portfolio'
import { t } from '@/i18n'
import { pauseAnalyticsAction } from './actions'

type Props = { params: Promise<{ office: string }>; searchParams: Promise<{ ok?: string; error?: string }> }
type Status = 'collecting' | 'ready' | 'stale' | 'paused'

const STATUS_CHIP: Record<Status, string> = { collecting: 'chip-neutral', ready: 'chip-success', stale: 'chip-warning', paused: 'chip-neutral' }

/** "Starting": what the panel is waiting for and how far along it is. */
function Collecting({ have, need, unit }: { have: number; need: number; unit: Unit }) {
  return (
    <div className="space-y-2">
      <p className="text-sm">{t(`analytics.wait.${unit}`, { need })}</p>
      <div className="flex items-center gap-3">
        <span className="h-2 flex-1 rounded-full bg-line-soft" role="img" aria-label={t('analytics.progress', { have, need })}>
          <span className="block h-2 rounded-full bg-coral-bright/60" style={{ width: `${Math.min(100, (have / need) * 100)}%` }} />
        </span>
        <span className="num text-[13px] font-semibold text-ink">{t('analytics.progress', { have, need })}</span>
      </div>
    </div>
  )
}

// Counts across the office's clinics, turned into a few things worth knowing.
// Each panel starts on its own once there is enough behind it, says so while
// it is still collecting, holds back when the recent data dries up, and can be
// paused by the owner. The rules are in lib/analytics.ts.
export default async function AnalyticsPage({ params, searchParams }: Props) {
  const { office: slug } = await params
  const flash = await searchParams
  const scope = await getOfficeScope(slug)
  const [home, data] = await Promise.all([
    getHome(scope.office_id),
    rpc<AnalyticsData>('office_analytics', { p_office_id: scope.office_id }),
  ])
  const base = `/o/${slug}`
  const cur = home.office.currency
  const canPause = home.role === 'owner'
  const p = panels(data, Date.now())
  const { usage, staff, funnel, payments, support } = p
  const ready = readyCount(p)
  const paused = data.paused.length
  const rows = rankClinics(data.clinics)

  function Panel({ k, wide, children }: { k: PanelKey; wide?: boolean; children: ReactNode }) {
    const status: Status = p[k].status
    return (
      <section className={`card flex flex-col gap-3 ${wide ? 'lg:col-span-2' : ''} ${status === 'paused' ? 'bg-background' : ''}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-[15px]">{t(`analytics.panel.${k}.title`)}</h2>
            <p className="text-[13px] text-muted">{t(`analytics.panel.${k}.about`)}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={STATUS_CHIP[status]}>{t(`analytics.status.${status}`)}</span>
            {canPause ? (
              <form action={pauseAnalyticsAction.bind(null, slug)}>
                <input type="hidden" name="panel" value={k} />
                <input type="hidden" name="paused" value={status === 'paused' ? '0' : '1'} />
                <button className="btn-secondary btn-xs" aria-label={`${status === 'paused' ? t('analytics.resume') : t('analytics.pause')}: ${t(`analytics.panel.${k}.title`)}`}>
                  <Icon name={status === 'paused' ? 'play' : 'pause'} size={13} />
                  {status === 'paused' ? t('analytics.resume') : t('analytics.pause')}
                </button>
              </form>
            ) : null}
          </div>
        </div>
        {status === 'paused' ? <p className="text-sm">{t('analytics.pausedBody')}</p> : children}
      </section>
    )
  }

  return (
    <div className="wide space-y-5">
      <PageHeader
        title={t('shell.analytics')}
        sub={`${ready === 0 ? t('analytics.sub0') : ready === 5 ? t('analytics.subAll') : t('analytics.subSome', { n: ready })}${paused > 0 ? ` ${t('analytics.subPaused', { n: paused })}` : ''} ${t('analytics.privacy')}`}
      />
      <Flash {...flash} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel k="usage" wide>
          {usage.status === 'collecting' ? <Collecting {...usage} /> : null}
          {usage.status === 'stale' ? (
            <p className="notice-warning">
              {t('analytics.usageStale', { n: usage.quietWeeks, when: usage.lastWeekWithVisits ? shortDate(usage.lastWeekWithVisits) : '—' })}
              {' '}<a href={`${base}/clinics?show=live`} className="font-semibold underline">{t('guide.open.live')}</a>
            </p>
          ) : null}
          {usage.status === 'ready' ? (
            <>
              <p className="text-sm">
                <span className="num text-[22px] font-semibold text-ink">{usage.lastWeek.toLocaleString('en-US')}</span>{' '}
                {t('analytics.usageLastWeek')}
                {usage.trendPct !== null ? (
                  <span className={`ml-2 font-semibold ${usage.trendPct < 0 ? 'text-red' : 'text-green-ink'}`}>
                    {usage.trendPct >= 0 ? '+' : '−'}{Math.abs(usage.trendPct)}% {t('analytics.usageTrend')}
                  </span>
                ) : <span className="ml-2 text-muted">{t('analytics.usageNoTrend')}</span>}
              </p>
              <Bars
                height={128} highlightLast
                label={t('analytics.usageAlt', { first: usage.weeks[0].visits, last: usage.lastWeek, n: usage.weeks.length })}
                values={usage.weeks.map((w) => ({ value: w.visits, title: `${shortDate(w.week)}: ${w.visits}` }))}
              />
              <div className="flex justify-between text-xs text-muted">
                <span>{t('analytics.weekOf', { date: shortDate(usage.weeks[0].week) })}</span>
                <span>{t('analytics.weekOf', { date: shortDate(usage.weeks[usage.weeks.length - 1].week) })}</span>
              </div>
              {usage.moreClinicsReporting && usage.trendPct !== null && usage.trendPct > 0 ? <p className="text-[13px]">{t('analytics.usageNewClinics')}</p> : null}
            </>
          ) : null}
        </Panel>

        <Panel k="funnel">
          {funnel.status === 'collecting' || funnel.status === 'ready' ? (
            <>
              {funnel.status === 'collecting' ? <Collecting have={funnel.have} need={funnel.need} unit={funnel.unit} /> : null}
              <div className="space-y-2">
                {funnel.steps.map((s) => (
                  <div key={s.key} className="flex items-center gap-3 text-[13px]">
                    <span className="w-24 shrink-0 font-medium text-ink">{t(`analytics.step.${s.key}`)}</span>
                    <span className="h-5 flex-1 rounded bg-line-soft">
                      <span
                        className={`num flex h-5 items-center rounded px-2 text-xs font-semibold text-white ${funnel.status === 'ready' && funnel.weakest === s.key ? 'bg-amber-ink' : 'bg-coral'}`}
                        style={{ width: `${Math.max(10, (s.n / Math.max(1, funnel.steps[0].n)) * 100)}%` }}
                      >{s.n}</span>
                    </span>
                    <span className="num w-12 shrink-0 text-right text-muted">{s.pct !== null ? `${s.pct}%` : ''}</span>
                  </div>
                ))}
              </div>
              {funnel.status === 'ready' ? (
                <p className="text-sm">
                  {funnel.weakest ? t('analytics.funnelWeakest', {
                    from: t(`analytics.step.${funnel.steps[funnel.steps.findIndex((s) => s.key === funnel.weakest) - 1].key}`),
                    to: t(`analytics.step.${funnel.weakest}`),
                  }) : t('analytics.funnelEven')}
                  {funnel.daysToLive !== null ? ` ${t('analytics.funnelDays', { n: funnel.daysToLive })}` : ''}
                </p>
              ) : null}
            </>
          ) : null}
        </Panel>

        <Panel k="staff">
          {staff.status === 'collecting' ? <Collecting {...staff} /> : null}
          {staff.status === 'stale' ? <p className="notice-warning">{t('analytics.staffStale', { when: staff.asOf ? shortDate(staff.asOf) : '—' })}</p> : null}
          {staff.status === 'ready' ? (
            <>
              <p className="text-sm"><span className="num text-[22px] font-semibold text-ink">{t('analytics.staffOf', { active: staff.active, total: staff.total })}</span> {t('analytics.staffUsing')}</p>
              <span className="block h-2 rounded-full bg-line-soft" role="img" aria-label={`${staff.pct}%`}>
                <span className="block h-2 rounded-full bg-coral-bright" style={{ width: `${staff.pct}%` }} />
              </span>
              <p className="text-sm">{staff.idle === 0 ? t('analytics.staffAll') : t('analytics.staffIdle', { n: staff.idle })}</p>
            </>
          ) : null}
        </Panel>

        <Panel k="payments">
          {payments.status === 'collecting' ? <Collecting {...payments} /> : null}
          {payments.status === 'ready' ? (
            <dl className="grid grid-cols-2 gap-4">
              <div><dt className="text-[13px] text-muted">{t('analytics.payWithin30')}</dt><dd className="num text-[22px] font-semibold text-ink">{payments.within30Pct}%</dd></div>
              <div><dt className="text-[13px] text-muted">{t('analytics.payMedian')}</dt><dd className="num text-[22px] font-semibold text-ink">{t('cash.days', { n: payments.medianDays })}</dd></div>
              <p className="col-span-2 text-[13px]">{t('analytics.payBasis', { n: payments.paid })}</p>
            </dl>
          ) : null}
        </Panel>

        <Panel k="support">
          {support.status === 'collecting' ? <Collecting {...support} /> : null}
          {support.status === 'ready' ? (
            <dl className="grid grid-cols-3 gap-4">
              <div><dt className="text-[13px] text-muted">{t('analytics.supRequests')}</dt><dd className="num text-[22px] font-semibold text-ink">{support.requests}</dd></div>
              <div><dt className="text-[13px] text-muted">{t('analytics.supReply')}</dt><dd className="num text-[22px] font-semibold text-ink">{support.medianReplyMinutes !== null ? t('analytics.minutes', { n: support.medianReplyMinutes }) : '—'}</dd></div>
              <div><dt className="text-[13px] text-muted">{t('analytics.supAlone')}</dt><dd className="num text-[22px] font-semibold text-ink">{support.solvedAlonePct !== null ? `${support.solvedAlonePct}%` : '—'}</dd></div>
              {support.medianReplyMinutes === null || support.solvedAlonePct === null ? <p className="col-span-3 text-[13px] text-muted">{t('analytics.supThin')}</p> : null}
            </dl>
          ) : null}
        </Panel>
      </div>

      {rows.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-[15px]">{t('analytics.clinicsTitle')}</h2>
          <div className="table-wrap">
            <table className="table num min-w-[820px]">
              <thead>
                <tr>
                  <th scope="col">{t('clinics.col.clinic')}</th>
                  <th scope="col">{t('clinics.col.health')}</th>
                  <th scope="col">{t('analytics.colVisits')}</th>
                  <th scope="col">{t('analytics.colStaff')}</th>
                  <th scope="col" className="text-right">{t('analytics.colPay')}</th>
                  <th scope="col" className="text-right">{t('analytics.colRequests')}</th>
                  <th scope="col" className="text-right">{t('analytics.colValue')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const usual = r.baseline_visits_per_day
                  const low = usual !== null && usual >= 1 && r.visits_per_day !== null && r.visits_per_day / usual < 0.5
                  const value = monthlyValue(r, home.office.country)
                  const idle = r.staff_total !== null && r.active_staff_7d !== null && r.staff_total > 0 && r.active_staff_7d / r.staff_total < 0.7
                  return (
                    <tr key={r.id} className="hover:bg-background">
                      <td>
                        <a href={`${base}/clinics/${r.id}`} className="font-semibold text-ink hover:text-coral">{r.name}</a>
                        <span className="block text-[13px] text-muted">{r.district}</span>
                      </td>
                      <td>{r.score ? <HealthChip score={r.score} /> : <span className="text-muted">{t('analytics.noScore')}</span>}</td>
                      <td className="whitespace-nowrap">
                        {r.visits_per_day !== null ? (
                          <>
                            <span className={`font-semibold ${low ? 'text-red' : 'text-ink'}`}>{r.visits_per_day}</span>
                            {usual !== null && usual >= 1 ? <span className="text-muted"> {t('analytics.usually', { n: usual })}</span> : null}
                          </>
                        ) : <span className="text-muted">—</span>}
                      </td>
                      <td className={`whitespace-nowrap ${idle ? 'font-semibold text-amber-ink' : ''}`}>
                        {r.staff_total !== null && r.active_staff_7d !== null ? t('analytics.staffOf', { active: Math.min(r.active_staff_7d, r.staff_total), total: r.staff_total }) : '—'}
                      </td>
                      <td className={`text-right ${r.avg_days_to_pay !== null && r.avg_days_to_pay > 21 ? 'font-semibold text-amber-ink' : ''}`}>{r.avg_days_to_pay ?? '—'}</td>
                      <td className="text-right">{r.requests_30d}</td>
                      <td className="text-right font-semibold text-ink">{value !== null ? money(value, cur).replace(`${cur} `, '') : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">{t('analytics.clinicsNote', { currency: cur })}</p>
        </section>
      ) : null}
    </div>
  )
}
