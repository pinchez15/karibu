import { Empty, Flash, PageHeader } from '@/components/ui'
import { getOfficeScope } from '@/lib/auth'
import { relativeDay } from '@/lib/dates'
import { rpc } from '@/lib/db'
import { ONBOARDING_STAGES, portfolio } from '@/lib/portfolio'
import { getHome } from '@/lib/office'
import type { ClinicAccount, ClinicStage } from '@/lib/types'
import { t } from '@/i18n'

type Props = { params: Promise<{ office: string }>; searchParams: Promise<{ ok?: string; error?: string }> }

// The steps a clinic passes on the way to live. The last one is Karibu's to
// set, when the clinic registers its first patient.
const STEPS: ClinicStage[] = [...ONBOARDING_STAGES, 'live']

// Every clinic that has said yes and is not live yet, with how far along it is
// and what it is waiting for. The detail (readiness form, lists, staff,
// training) is one click in, on the clinic's own onboarding page.
export default async function OnboardingListPage({ params, searchParams }: Props) {
  const { office: slug } = await params
  const flash = await searchParams
  const scope = await getOfficeScope(slug)
  const [home, clinics] = await Promise.all([
    getHome(scope.office_id),
    rpc<ClinicAccount[]>('office_clinics_list', { p_office_id: scope.office_id }),
  ])
  const base = `/o/${slug}`
  const p = portfolio(clinics, home.office.country, Date.now())
  const rank = (s: ClinicStage) => STEPS.indexOf(s)
  const inProgress = [...p.onboarding].sort((a, b) => rank(b.stage) - rank(a.stage) || a.name.localeCompare(b.name))
  const ready = clinics.filter((c) => c.stage === 'demo')

  return (
    <div className="wide space-y-5">
      <PageHeader
        title={t('shell.onboarding')}
        sub={inProgress.length === 0 ? t('enroll.sub0') : inProgress.length === 1 ? t('enroll.sub1') : t('enroll.subN', { n: inProgress.length })}
      />
      <Flash {...flash} />

      {inProgress.length === 0 ? (
        <Empty title={t('enroll.emptyTitle')} body={t('enroll.emptyBody')}>
          <a href={`${base}/pipeline`} className="btn-primary btn-sm">{t('guide.open.find')}</a>
          <a href={`${base}/clinics/new`} className="btn-secondary btn-sm">{t('clinics.add')}</a>
        </Empty>
      ) : (
        <ul className="grid gap-3 xl:grid-cols-2">
          {inProgress.map((c) => {
            const at = rank(c.stage)
            return (
              <li key={c.id} className="card space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                  <div className="min-w-0">
                    <a href={`${base}/clinics/${c.id}`} className="font-semibold text-ink hover:text-coral">{c.name}</a>
                    <p className="text-[13px] text-muted">
                      {[c.district, c.facility_level, c.go_live_mode ? t(`enroll.mode.${c.go_live_mode}`) : null].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  {c.readiness_cleared_at ? <span className="chip-success">{t('enroll.cleared')}</span> : <span className="chip-warning">{t('enroll.notCleared')}</span>}
                </div>

                <ol className="grid grid-cols-5 gap-1.5" aria-label={t('clinic.stageTitle')}>
                  {STEPS.map((s, i) => (
                    <li key={s} aria-current={i === at ? 'step' : undefined}>
                      <span className={`block h-1.5 rounded-full ${i < at ? 'bg-green' : i === at ? 'bg-coral-bright' : 'bg-line'}`} />
                      <span className={`mt-1 block truncate text-[11px] ${i === at ? 'font-semibold text-ink' : i < at ? 'text-body' : 'text-muted'}`}>
                        {t(`clinics.stage.${s}`)}
                      </span>
                    </li>
                  ))}
                </ol>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="min-w-0 flex-1 text-sm">
                    <span className="font-semibold text-ink">{c.next_action ?? t(`enroll.waiting.${c.stage as 'readiness' | 'configured' | 'trained' | 'kit_delivered'}`)}</span>
                    <span className="block text-[13px] text-muted">
                      {c.last_contact_at ? t('clinics.lastContact', { when: relativeDay(c.last_contact_at, t) }) : t('clinics.noContact')}
                    </span>
                  </p>
                  <a href={`${base}/clinics/${c.id}/onboarding`} className="btn-primary btn-sm">{t('enroll.open')}</a>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {ready.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-[15px]">{t('enroll.readyTitle')}</h2>
          <p className="text-sm">{t('enroll.readyBody')}</p>
          <ul className="divide-y divide-line-soft overflow-hidden rounded-2xl border border-line bg-surface">
            {ready.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <a href={`${base}/clinics/${c.id}`} className="font-semibold text-ink hover:text-coral">{c.name}</a>
                  <span className="block text-[13px] text-muted">{[c.district, c.contact_name].filter(Boolean).join(' · ')}</span>
                </span>
                <a href={`${base}/clinics/${c.id}/onboarding`} className="btn-secondary btn-sm">{t('clinic.startOnboarding')}</a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-[13px] text-muted">{t('enroll.rule')}</p>
    </div>
  )
}
