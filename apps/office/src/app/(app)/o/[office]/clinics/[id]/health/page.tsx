import { HealthChip, PageHeader, Section, WhatsAppButton } from '@/components/ui'
import { getOfficeScope } from '@/lib/auth'
import { rpc } from '@/lib/db'
import type { ClinicAccount, HealthScore } from '@/lib/types'
import { t } from '@/i18n'

type Health =
  | { live: false }
  | {
      live: true
      score: HealthScore
      reasons: ('no_sync' | 'usage_drop' | 'training_incomplete')[]
      metrics: {
        last_activity_at: string | null; hours_since_activity: number | null
        active_staff_7d: number; active_staff_30d: number
        registrations_per_day: number; visits_per_day: number; baseline_visits_per_day: number
        drop_pct: number; training_pct: number; untrained: number; staff_total: number
      }
      history: { day: string; score: HealthScore }[]
      daily: { day: string; visits: number; registrations: number }[]
    }

type Props = { params: Promise<{ office: string; id: string }> }

const DOT: Record<HealthScore, string> = { green: 'bg-green', amber: 'bg-amber', red: 'bg-red' }

export default async function HealthPage({ params }: Props) {
  const { office: slug, id } = await params
  await getOfficeScope(slug)
  const [h, detail] = await Promise.all([
    rpc<Health>('office_clinic_health', { p_account_id: id }),
    rpc<{ account: ClinicAccount }>('office_clinic_get', { p_account_id: id }),
  ])
  const c = detail.account
  const back = `/o/${slug}/clinics/${id}`

  if (!h.live) {
    return (<><PageHeader title={`${t('health.title')}: ${c.name}`} back={back} /><p className="card text-sm">{t('health.notLive')}</p></>)
  }
  const m = h.metrics
  const peak = Math.max(1, ...h.daily.map((d) => d.visits))
  const hours = m.hours_since_activity
  const reasonVars = { hours: hours ?? 0, pct: m.drop_pct, n: m.untrained }

  return (
    <>
      <PageHeader title={`${t('health.title')}: ${c.name}`} back={back} action={<HealthChip score={h.score} />} />

      {/* Lead with what is wrong and what to do, not with numbers. */}
      {h.reasons.length === 0 ? <p className="notice-success">{t('health.allGood')}</p> : (
        <ul className="space-y-2">
          {h.reasons.map((r) => (
            <li key={r} className={r === 'no_sync' ? 'notice-danger' : 'notice-warning'}>{t(`health.reason.${r}`, reasonVars)}</li>
          ))}
        </ul>
      )}
      {h.score !== 'green' && (c.champion_phone || c.contact_phone) ? (
        <WhatsAppButton className="btn-whatsapp w-full" phone={c.champion_phone ?? c.contact_phone} label={t('health.whatsappChampion')}
          text={t('health.checkIn', { name: c.champion_name ?? c.contact_name ?? '', clinic: c.name })} />
      ) : null}

      <Section title={t('health.chart')}>
        <div className="card">
          <div className="flex h-24 items-end gap-1" role="img" aria-label={`${t('health.chart')}: ${h.daily.map((d) => d.visits).join(', ')}`}>
            {h.daily.map((d) => (
              <div key={d.day} className="flex-1 rounded-t bg-cobalt/80" style={{ height: `${Math.max(3, (d.visits / peak) * 100)}%` }} title={`${d.day}: ${d.visits}`} />
            ))}
          </div>
          <div className="mt-2 flex gap-1" aria-hidden>
            {h.daily.map((d) => {
              const day = h.history.find((x) => x.day === d.day.slice(0, 10))
              return <span key={d.day} className={`h-1.5 flex-1 rounded-full ${day ? DOT[day.score] : 'bg-line'}`} />
            })}
          </div>
        </div>
      </Section>

      <dl className="card divide-y divide-line-soft py-1 text-sm">
        {([
          [t('health.lastActivity'), hours === null ? t('health.never') : hours < 1 ? t('health.justNow') : t('health.hoursAgo', { n: hours })],
          [t('health.visitsPerDay'), t('health.visitsValue', { now: m.visits_per_day, before: m.baseline_visits_per_day })],
          [t('health.registrations'), String(m.registrations_per_day)],
          [t('health.activeStaff'), t('health.activeStaffValue', { week: m.active_staff_7d, month: m.active_staff_30d })],
          [t('health.training'), t('onboarding.trainingCount', { trained: m.staff_total - m.untrained, total: m.staff_total })],
        ] as const).map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 py-2.5">
            <dt>{label}</dt><dd className="text-right font-medium text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted">{t('health.approx')}</p>
      {m.untrained > 0 ? <a href={`${back}/onboarding#staff`} className="btn-secondary w-full">{t('onboarding.step4')}</a> : null}
    </>
  )
}
