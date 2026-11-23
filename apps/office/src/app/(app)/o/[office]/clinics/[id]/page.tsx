import { EDITIONS, EDITION_IDS } from '@karibu/shared'
import { VisitLogForm } from '@/components/VisitLogForm'
import { Flash, HealthChip, PageHeader, Section, StageChip, WhatsAppButton } from '@/components/ui'
import { transferClinicAction } from '@/app/(app)/foundation/actions'
import { getMe, getOfficeScope } from '@/lib/auth'
import { relativeDay, shortDate } from '@/lib/dates'
import { rpc } from '@/lib/db'
import { taskHref, taskTitle } from '@/lib/tasks'
import { MANUAL_STAGES, type ClinicAccount, type ClinicStage, type Task } from '@/lib/types'
import { t } from '@/i18n'
import { closeTaskAction } from '../../actions'
import { logSiteVisitAction, setStageAction, updateClinicAction } from '../actions'

type Detail = {
  account: ClinicAccount
  events: { from: ClinicStage | null; to: ClinicStage; source: 'manual' | 'auto'; note: string | null; at: string }[]
  tasks: Task[]
  site_visits: { id: string; kind: string; notes: string | null; at: string; member: string | null }[]
}

type Props = { params: Promise<{ office: string; id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }

const KINDS = ['call', 'sales', 'onboarding', 'go_live', 'support', 'collection', 'check_in'] as const
const LIVE: ClinicStage[] = ['live', 'steady', 'billed']

export default async function ClinicPage({ params, searchParams }: Props) {
  const { office: slug, id } = await params
  const flash = await searchParams
  await getOfficeScope(slug)
  const { account: c, events, tasks, site_visits } = await rpc<Detail>('office_clinic_get', { p_account_id: id })
  const base = `/o/${slug}`
  const here = `${base}/clinics/${id}`
  const isLive = LIVE.includes(c.stage)
  const update = updateClinicAction.bind(null, slug, id)
  const me = await getMe()
  const otherOffices = me?.is_central ? me.all_offices.filter((o) => o.office_id !== c.office_id && o.status === 'active') : []

  return (
    <>
      <PageHeader title={c.name} back={`${base}/clinics`} />
      <div className="flex flex-wrap items-center gap-2">
        <StageChip stage={c.stage} />
        {c.health ? <HealthChip score={c.health.score} /> : null}
        <span className="text-sm">{[c.district, c.facility_level].filter(Boolean).join(' · ')}</span>
      </div>
      <Flash {...flash} />

      {c.contact_phone ? (
        <div className="grid grid-cols-2 gap-2">
          <a href={`tel:${c.contact_phone}`} className="btn-secondary">{t('common.call')} {c.contact_name ?? ''}</a>
          <WhatsAppButton text="" phone={c.contact_phone} label="WhatsApp" />
        </div>
      ) : null}

      <Section title={t('clinic.nextAction')}>
        <form action={update} className="flex gap-2">
          <input name="next_action" defaultValue={c.next_action ?? ''} className="input" placeholder={t('clinic.nextActionPlaceholder')} aria-label={t('clinic.nextAction')} />
          <button className="btn-secondary shrink-0">{t('common.save')}</button>
        </form>
      </Section>

      {tasks.length > 0 ? (
        <Section title={t('clinic.tasks')}>
          <ul className="space-y-2">
            {tasks.map((task) => {
              const { title } = taskTitle({ ...task, clinic_account_id: id }, t)
              const href = taskHref(base, { ...task, clinic_account_id: id })
              return (
                <li key={task.id} className="card flex items-stretch gap-2 p-0">
                  <a href={href && href !== here ? href : '#'} className="min-w-0 flex-1 px-4 py-3 font-semibold text-ink">{title}</a>
                  <form action={closeTaskAction.bind(null, slug)} className="flex">
                    <input type="hidden" name="task_id" value={task.id} />
                    <input type="hidden" name="return_to" value={here} />
                    <button className="btn-quiet rounded-l-none border-l border-line px-4">{t('common.done')}</button>
                  </form>
                </li>
              )
            })}
          </ul>
        </Section>
      ) : null}

      <Section title={t('clinic.onboarding')}>
        <a href={`${here}/onboarding`} className="card block active:bg-line-soft">
          <span className="block font-semibold text-ink">
            {LIVE.includes(c.stage) || MANUAL_STAGES.indexOf(c.stage) >= 3 ? t('clinic.onboarding') : t('clinic.startOnboarding')} →
          </span>
          <span className="block text-sm">{t('clinic.onboardingHint')}</span>
        </a>
      </Section>

      {isLive ? (
        <a href={`${here}/health`} className="card flex items-center justify-between gap-2 active:bg-line-soft">
          <span className="font-semibold text-ink">{t('clinic.health')} →</span>
          {c.health ? <HealthChip score={c.health.score} /> : null}
        </a>
      ) : null}

      {c.readiness_cleared_at || c.clinic_id ? (
        <a href={`${base}/money/invoices/new?clinic=${id}`} className="btn-secondary w-full">{t('money.newInvoice')}</a>
      ) : null}

      <Section title={t('clinic.logContact')}>
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
        {site_visits.length > 0 ? (
          <ul className="card divide-y divide-line-soft py-1">
            {site_visits.map((v) => (
              <li key={v.id} className="py-2.5">
                <span className="meta">{t(`clinic.kind.${v.kind as (typeof KINDS)[number]}`)} · {relativeDay(v.at, t)}{v.member ? ` · ${v.member}` : ''}</span>
                <span className="mt-0.5 block whitespace-pre-wrap text-sm text-ink">{v.notes}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Section title={t('clinic.stageTitle')}>
        {isLive ? (
          <p className="card text-sm">{t('clinic.autoStage')}</p>
        ) : (
          <form action={setStageAction.bind(null, slug, id)} className="flex gap-2">
            <select name="stage" defaultValue={c.stage} className="input" aria-label={t('clinic.moveTo')}>
              {MANUAL_STAGES.map((s) => <option key={s} value={s}>{t(`clinics.stage.${s}`)}</option>)}
            </select>
            <button className="btn-secondary shrink-0">{t('common.save')}</button>
          </form>
        )}
      </Section>

      <Section title={t('clinic.details')}>
        <form action={update} className="card space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="field"><span>{t('clinics.form.contactName')}</span><input name="contact_name" defaultValue={c.contact_name ?? ''} className="input" /></label>
            <label className="field"><span>{t('clinics.form.contactPhone')}</span><input name="contact_phone" type="tel" inputMode="tel" defaultValue={c.contact_phone ?? ''} className="input" /></label>
            <label className="field"><span>{t('clinic.championName')}</span><input name="champion_name" defaultValue={c.champion_name ?? ''} className="input" /></label>
            <label className="field"><span>{t('clinic.championPhone')}</span><input name="champion_phone" type="tel" inputMode="tel" defaultValue={c.champion_phone ?? ''} className="input" /></label>
          </div>
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
      </Section>

      <Section title={t('clinic.history')}>
        <ul className="card divide-y divide-line-soft py-1">
          {events.map((e, i) => (
            <li key={i} className="flex items-center justify-between gap-2 py-2.5 text-sm">
              <span className="text-ink">{t(`clinics.stage.${e.to}`)}{e.note ? ` · ${e.note}` : ''}</span>
              <span className="meta shrink-0">{shortDate(e.at)}{e.source === 'auto' ? ' · auto' : ''}</span>
            </li>
          ))}
        </ul>
      </Section>

      {/* Karibu central only: a clinic changes partner, or its partner exits. Audited. */}
      {otherOffices.length > 0 && c.stage !== 'churned' ? (
        <Section title={t('foundation.transfer')}>
          <form action={transferClinicAction.bind(null, slug, id)} className="card space-y-3">
            <p className="text-sm">{t('foundation.transferHint')}</p>
            {otherOffices.map((o) => <input key={o.office_id} type="hidden" name={`slug_${o.office_id}`} value={o.slug} />)}
            <select name="to_office_id" required defaultValue="" className="input" aria-label={t('foundation.transfer')}>
              <option value="" disabled>—</option>
              {otherOffices.map((o) => <option key={o.office_id} value={o.office_id}>{o.name}</option>)}
            </select>
            <label className="field"><span>{t('foundation.transferReason')}</span><input name="reason" required className="input" /></label>
            <button className="btn-secondary w-full">{t('foundation.transfer')}</button>
          </form>
        </Section>
      ) : null}

      {c.stage !== 'churned' ? (
        <form action={setStageAction.bind(null, slug, id)}>
          <input type="hidden" name="stage" value="churned" />
          <button className="btn-danger w-full">{t('clinic.markLost')}</button>
        </form>
      ) : null}
    </>
  )
}
