import { EDITIONS, EDITION_IDS } from '@karibu/shared'
import { VisitLogForm } from '@/components/VisitLogForm'
import { Bars, Flash, HealthChip, StageChip, StageTrack, WhatsAppButton } from '@/components/ui'
import { transferClinicAction } from '@/app/(app)/foundation/actions'
import { getMe, getOfficeScope } from '@/lib/auth'
import { relativeDay, shortDate } from '@/lib/dates'
import { rpc } from '@/lib/db'
import { money } from '@/lib/money'
import { getHome } from '@/lib/office'
import { LIVE_STAGES, monthlyValue } from '@/lib/portfolio'
import { taskHref, taskTitle } from '@/lib/tasks'
import { MANUAL_STAGES, type ClinicAccount, type ClinicStage, type HealthScore, type Task } from '@/lib/types'
import { t } from '@/i18n'
import { closeTaskAction } from '../../actions'
import { logSiteVisitAction, setStageAction, updateClinicAction } from '../actions'

type Detail = {
  account: ClinicAccount
  events: { from: ClinicStage | null; to: ClinicStage; source: 'manual' | 'auto'; note: string | null; at: string }[]
  tasks: Task[]
  site_visits: { id: string; kind: string; notes: string | null; at: string; member: string | null }[]
}

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
      daily: { day: string; visits: number; registrations: number }[]
      training: {
        staff: { staff_id: string; name: string; role: string; modules_done: number; modules_total: number; trained: boolean }[]
        invited: { invitation_id: string; name: string; email: string; role: string; invited_at: string }[]
      }
    }

type Props = { params: Promise<{ office: string; id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }

const KINDS = ['call', 'sales', 'onboarding', 'go_live', 'support', 'collection', 'check_in'] as const
const BANNER: Record<HealthScore, string> = { green: 'notice-success', amber: 'notice-warning', red: 'notice-danger' }

// One clinic, on one screen: what is wrong and what to do about it, how much
// it is using Karibu, who works there and how their training stands, the
// account, and everything that has happened. This is where remote support
// starts. Counts, timestamps and staff names only: no patient is ever shown.
export default async function ClinicPage({ params, searchParams }: Props) {
  const { office: slug, id } = await params
  const flash = await searchParams
  const scope = await getOfficeScope(slug)
  const [{ account: c, events, tasks, site_visits }, home, me] = await Promise.all([
    rpc<Detail>('office_clinic_get', { p_account_id: id }),
    getHome(scope.office_id),
    getMe(),
  ])
  const base = `/o/${slug}`
  const here = `${base}/clinics/${id}`
  const isLive = LIVE_STAGES.includes(c.stage)
  const h = isLive ? await rpc<Health>('office_clinic_health', { p_account_id: id }).catch(() => null) : null
  const health = h && h.live ? h : null
  const update = updateClinicAction.bind(null, slug, id)
  const otherOffices = me?.is_central ? me.all_offices.filter((o) => o.office_id !== c.office_id && o.status === 'active') : []
  const cur = home.office.currency
  const value = monthlyValue(c, home.office.country)
  const billable = Boolean(c.readiness_cleared_at || c.clinic_id)
  const onboardingStarted = isLive || MANUAL_STAGES.indexOf(c.stage) >= 3
  const reachPhone = c.champion_phone ?? c.contact_phone
  const reachName = c.champion_name ?? c.contact_name
  const m = health?.metrics
  const hours = m?.hours_since_activity ?? null

  const timeline = [
    ...events.map((e) => ({ at: e.at, title: t(`clinics.stage.${e.to}`), body: e.note, tag: e.source === 'auto' ? t('console.byKaribu') : null })),
    ...site_visits.map((v) => ({ at: v.at, title: t(`clinic.kind.${v.kind as (typeof KINDS)[number]}`), body: v.notes, tag: v.member })),
  ].sort((a, b) => b.at.localeCompare(a.at))

  return (
    <div className="wide space-y-5">
      <div className="space-y-2">
        <a href={`${base}/clinics`} className="text-sm font-medium text-coral">← {t('clinics.title')}</a>
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="break-words lg:text-[26px]">{c.name}</h1>
              {c.health ? <HealthChip score={c.health.score} /> : null}
              <StageChip stage={c.stage} />
            </div>
            <p className="text-sm">
              {[c.district, c.facility_level, c.tier ? EDITIONS[c.tier].name : null, reachName ? t('console.reach', { name: reachName }) : null].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {reachPhone ? (
              <>
                <WhatsAppButton className="btn-whatsapp btn-sm" text="" phone={reachPhone} label="WhatsApp" />
                <a href={`tel:${reachPhone}`} className="btn-secondary btn-sm">{t('common.call')}</a>
              </>
            ) : null}
            <a href={`${here}/onboarding`} className="btn-secondary btn-sm">{onboardingStarted ? t('clinic.onboarding') : t('clinic.startOnboarding')}</a>
            {billable ? <a href={`${base}/money/invoices/new?clinic=${id}`} className="btn-secondary btn-sm">{t('money.newInvoice')}</a> : null}
          </div>
        </div>
        {!isLive && c.stage !== 'churned' ? <StageTrack stage={c.stage} /> : null}
      </div>

      <Flash {...flash} />

      {/* Lead with what is wrong and what to do, not with numbers. */}
      {health ? (
        health.reasons.length === 0 ? <p className="notice-success">{t('health.allGood')}</p> : (
          <section aria-label={t('console.whatToDo')} className={`${BANNER[health.score]} flex flex-wrap items-start justify-between gap-4`}>
            <ul className="min-w-0 flex-1 basis-80 space-y-1.5">
              {health.reasons.map((r) => (
                <li key={r}>
                  <span className="block font-semibold">{t(`health.reason.${r}`, { hours: hours ?? 0, pct: m!.drop_pct, n: m!.untrained })}</span>
                  <span className="block">{t(`console.advice.${r}`)}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              {reachPhone ? (
                <WhatsAppButton className="btn-whatsapp btn-sm" phone={reachPhone} label={t('health.whatsappChampion')}
                  text={t('health.checkIn', { name: reachName ?? '', clinic: c.name })} />
              ) : null}
              {health.reasons.includes('training_incomplete') ? <a href={`${here}/onboarding#staff`} className="btn-secondary btn-sm">{t('onboarding.step4')}</a> : null}
            </div>
          </section>
        )
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card space-y-2">
            <h2 className="text-[15px]">{t('clinic.nextAction')}</h2>
            <form action={update} className="flex flex-wrap gap-2">
              <input name="next_action" defaultValue={c.next_action ?? ''} className="input min-w-0 flex-1 basis-56" placeholder={t('clinic.nextActionPlaceholder')} aria-label={t('clinic.nextAction')} />
              <input name="next_action_at" type="date" defaultValue={c.next_action_at?.slice(0, 10) ?? ''} className="input w-auto" aria-label={t('console.dueDate')} />
              <button className="btn-secondary shrink-0">{t('common.save')}</button>
            </form>
            {tasks.length > 0 ? (
              <ul className="divide-y divide-line-soft border-t border-line-soft pt-1">
                {tasks.map((task) => {
                  const { title } = taskTitle({ ...task, clinic_account_id: id }, t)
                  const href = taskHref(base, { ...task, clinic_account_id: id })
                  return (
                    <li key={task.id} className="flex items-center gap-2 py-2">
                      <a href={href && href !== here ? href : '#'} className="min-w-0 flex-1 text-sm font-semibold text-ink">{title}</a>
                      <form action={closeTaskAction.bind(null, slug)}>
                        <input type="hidden" name="task_id" value={task.id} />
                        <input type="hidden" name="return_to" value={here} />
                        <button className="btn-quiet btn-xs">{t('common.done')}</button>
                      </form>
                    </li>
                  )
                })}
              </ul>
            ) : null}
          </section>

          {health && m ? (
            <>
              <section className="card space-y-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-[15px]">{t('console.usage')}</h2>
                  <a href={`${here}/health`} className="text-[13px] font-semibold text-coral">{t('console.moreHealth')}</a>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                  {([
                    [t('health.lastActivity'), hours === null ? t('health.never') : hours < 1 ? t('health.justNow') : t('health.hoursAgo', { n: hours }), health.reasons.includes('no_sync')],
                    [t('health.visitsPerDay'), t('health.visitsValue', { now: m.visits_per_day, before: m.baseline_visits_per_day }), health.reasons.includes('usage_drop')],
                    [t('health.activeStaff'), t('health.activeStaffValue', { week: m.active_staff_7d, month: m.active_staff_30d }), false],
                    [t('health.training'), t('onboarding.trainingCount', { trained: m.staff_total - m.untrained, total: m.staff_total }), m.untrained > 0],
                  ] as const).map(([label, val, bad]) => (
                    <div key={label}>
                      <dt className="text-[13px] text-muted">{label}</dt>
                      <dd className={`num text-[15px] font-semibold ${bad ? 'text-red' : 'text-ink'}`}>{val}</dd>
                    </div>
                  ))}
                </dl>
                <Bars
                  label={`${t('health.chart')}: ${health.daily.map((d) => d.visits).join(', ')}`}
                  values={health.daily.map((d) => ({ value: d.visits, title: `${shortDate(d.day)}: ${d.visits}`, className: d.visits === 0 ? 'bg-red/60' : undefined }))}
                />
                <p className="text-xs text-muted">{t('console.usageNote')}</p>
              </section>

              <section className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-[15px]">{t('console.staff')}</h2>
                  <a href={`${here}/onboarding#staff`} className="text-[13px] font-semibold text-coral">{t('console.inviteStaff')}</a>
                </div>
                {health.training.staff.length + health.training.invited.length === 0 ? <p className="card text-sm">{t('console.noStaff')}</p> : (
                  <div className="table-wrap">
                    <table className="table min-w-[520px]">
                      <thead>
                        <tr>
                          <th scope="col">{t('console.colName')}</th>
                          <th scope="col">{t('console.colRole')}</th>
                          <th scope="col">{t('health.training')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {health.training.staff.map((s) => (
                          <tr key={s.staff_id}>
                            <td className="font-semibold text-ink">{s.name}</td>
                            <td className="first-letter:uppercase">{s.role.replace(/_/g, ' ')}</td>
                            <td>
                              {s.trained
                                ? <span className="chip-success">{t('console.trained')}</span>
                                : <span className="chip-warning">{t('console.lessons', { done: s.modules_done, total: s.modules_total })}</span>}
                            </td>
                          </tr>
                        ))}
                        {health.training.invited.map((s) => (
                          <tr key={s.invitation_id}>
                            <td className="font-semibold text-ink">{s.name}</td>
                            <td>{s.role.replace(/_/g, ' ')}</td>
                            <td><span className="chip-warning">{t('console.invited', { when: relativeDay(s.invited_at, t) })}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          ) : null}

          {!isLive && c.stage !== 'churned' ? (
            <section className="grid gap-3 sm:grid-cols-2">
              <a href={`${here}/onboarding`} className="card block space-y-1 hover:border-ink/30">
                <span className="block font-semibold text-ink">{onboardingStarted ? t('clinic.onboarding') : t('clinic.startOnboarding')} →</span>
                <span className="block text-sm">{onboardingStarted ? t('clinic.onboardingOpenHint') : t('clinic.onboardingHint')}</span>
              </a>
              <div className="card space-y-1 bg-background">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-muted">{t('clinic.health')}</span>
                  <span className="chip-neutral">{t('clinic.notYet')}</span>
                </span>
                <span className="block text-sm text-muted">{t('health.notLive')}</span>
              </div>
            </section>
          ) : null}

          <section className="space-y-3">
            <h2 className="text-[15px]">{t('clinic.logContact')}</h2>
            <VisitLogForm
              accountId={id}
              send={logSiteVisitAction}
              labels={{
                kinds: Object.fromEntries(KINDS.map((k) => [k, t(`clinic.kind.${k}`)])),
                placeholder: t('clinic.notesPlaceholder'),
                submit: t('clinic.logContact'),
                logged: t('clinic.logged'),
                queued: t('clinic.queued'),
              }}
            />
          </section>

          <section className="space-y-2">
            <h2 className="text-[15px]">{t('console.timeline')}</h2>
            <ol className="card divide-y divide-line-soft py-1">
              {timeline.map((e, i) => (
                <li key={i} className="flex gap-3 py-2.5 text-sm">
                  <span className="num w-24 shrink-0 text-[13px] text-muted">{shortDate(e.at)}</span>
                  <span className="min-w-0">
                    <span className="font-semibold text-ink">{e.title}</span>
                    {e.tag ? <span className="text-muted"> · {e.tag}</span> : null}
                    {e.body ? <span className="mt-0.5 block whitespace-pre-wrap">{e.body}</span> : null}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="card space-y-2">
            <h2 className="text-[15px]">{t('console.account')}</h2>
            <dl className="space-y-1.5 text-sm">
              {([
                [t('clinics.form.tier'), c.tier ? EDITIONS[c.tier].name : t('clinics.form.tierNone')],
                [t('console.monthly'), value !== null ? money(value, cur) : '—'],
                [t('console.billingFrom'), c.billing_starts_on ? shortDate(c.billing_starts_on) : '—'],
                [t('console.added'), shortDate(c.created_at)],
                [t('clinics.col.owner'), c.assigned_member ?? '—'],
              ] as const).map(([label, val]) => (
                <div key={label} className="flex items-baseline justify-between gap-3">
                  <dt>{label}</dt><dd className="num text-right font-semibold text-ink">{val}</dd>
                </div>
              ))}
            </dl>
            {billable ? <a href={`${base}/money/invoices/new?clinic=${id}`} className="btn-secondary btn-sm w-full">{t('money.newInvoice')}</a> : <p className="text-[13px] text-muted">{t('invoice.noBillable')}</p>}
          </section>

          <section className="card space-y-3">
            <h2 className="text-[15px]">{t('console.people')}</h2>
            {([[t('clinic.contact'), c.contact_name, c.contact_phone], [t('clinic.champion'), c.champion_name, c.champion_phone]] as const).map(([role, name, phone]) => (
              <div key={role} className="text-sm">
                <span className="block text-[13px] text-muted">{role}</span>
                {name || phone ? (
                  <>
                    <span className="block font-semibold text-ink">{name ?? '—'}</span>
                    {phone ? <a href={`tel:${phone}`} className="num text-coral">{phone}</a> : null}
                  </>
                ) : <span className="text-muted">{t('common.notSet')}</span>}
              </div>
            ))}
          </section>

          <details className="card">
            <summary className="list-none text-[15px] font-semibold text-ink">{t('console.edit')}</summary>
            <form action={update} className="mt-3 space-y-3">
              <label className="field"><span>{t('clinics.form.contactName')}</span><input name="contact_name" defaultValue={c.contact_name ?? ''} className="input" /></label>
              <label className="field"><span>{t('clinics.form.contactPhone')}</span><input name="contact_phone" type="tel" inputMode="tel" defaultValue={c.contact_phone ?? ''} className="input" /></label>
              <label className="field"><span>{t('clinic.championName')}</span><input name="champion_name" defaultValue={c.champion_name ?? ''} className="input" /></label>
              <label className="field"><span>{t('clinic.championPhone')}</span><input name="champion_phone" type="tel" inputMode="tel" defaultValue={c.champion_phone ?? ''} className="input" /></label>
              <label className="field">
                <span>{t('clinics.form.tier')}</span>
                <select name="tier" defaultValue={c.tier ?? ''} className="input">
                  <option value="">{t('clinics.form.tierNone')}</option>
                  {EDITION_IDS.map((e) => <option key={e} value={e}>{EDITIONS[e].name}</option>)}
                </select>
              </label>
              <label className="field"><span>{t('clinics.form.notes')}</span><textarea name="notes" rows={3} defaultValue={c.notes ?? ''} className="input" /></label>
              <button className="btn-secondary w-full">{t('common.save')}</button>
            </form>
          </details>
          {c.notes ? <p className="card whitespace-pre-wrap text-sm">{c.notes}</p> : null}

          <section className="card space-y-2">
            <h2 className="text-[15px]">{t('clinic.stageTitle')}</h2>
            {isLive ? <p className="text-sm">{t('clinic.autoStage')}</p> : (
              <>
                <form action={setStageAction.bind(null, slug, id)} className="flex gap-2">
                  <select name="stage" defaultValue={c.stage} className="input" aria-label={t('clinic.moveTo')}>
                    {MANUAL_STAGES.map((s) => <option key={s} value={s}>{t(`clinics.stage.${s}`)}</option>)}
                  </select>
                  <button className="btn-secondary shrink-0">{t('common.save')}</button>
                </form>
                <p className="text-xs text-muted">{t('clinic.stageHint')}</p>
              </>
            )}
          </section>

          {/* Karibu central only: a clinic changes partner, or its partner exits. Audited. */}
          {otherOffices.length > 0 && c.stage !== 'churned' ? (
            <form action={transferClinicAction.bind(null, slug, id)} className="card space-y-3">
              <h2 className="text-[15px]">{t('foundation.transfer')}</h2>
              <p className="text-sm">{t('foundation.transferHint')}</p>
              {otherOffices.map((o) => <input key={o.office_id} type="hidden" name={`slug_${o.office_id}`} value={o.slug} />)}
              <select name="to_office_id" required defaultValue="" className="input" aria-label={t('foundation.transfer')}>
                <option value="" disabled>—</option>
                {otherOffices.map((o) => <option key={o.office_id} value={o.office_id}>{o.name}</option>)}
              </select>
              <label className="field"><span>{t('foundation.transferReason')}</span><input name="reason" required className="input" /></label>
              <button className="btn-secondary w-full">{t('foundation.transfer')}</button>
            </form>
          ) : null}

          {c.stage !== 'churned' ? (
            <form action={setStageAction.bind(null, slug, id)}>
              <input type="hidden" name="stage" value="churned" />
              <button className="btn-danger btn-sm w-full">{t('clinic.markLost')}</button>
            </form>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
