import { Empty, Flash, PageHeader, Stat, WhatsAppButton } from '@/components/ui'
import { getOfficeScope } from '@/lib/auth'
import { relativeDay, shortDate } from '@/lib/dates'
import { rpc } from '@/lib/db'
import { money } from '@/lib/money'
import { getHome } from '@/lib/office'
import { daysLate, monthlyValue, portfolio } from '@/lib/portfolio'
import type { ClinicAccount, ClinicStage } from '@/lib/types'
import { t } from '@/i18n'
import { setStageAction } from '../clinics/actions'

type Props = { params: Promise<{ office: string }>; searchParams: Promise<{ ok?: string; error?: string }> }

const COLUMNS: { stage: ClinicStage; next: ClinicStage }[] = [
  { stage: 'lead', next: 'contacted' },
  { stage: 'contacted', next: 'demo' },
  { stage: 'demo', next: 'readiness' },
]

// The CRM: every clinic the office is talking to, in the column for how far
// the conversation has got, each with one next step and when it is due.
export default async function PipelinePage({ params, searchParams }: Props) {
  const { office: slug } = await params
  const flash = await searchParams
  const scope = await getOfficeScope(slug)
  const [home, clinics] = await Promise.all([
    getHome(scope.office_id),
    rpc<ClinicAccount[]>('office_clinics_list', { p_office_id: scope.office_id }),
  ])
  const base = `/o/${slug}`
  const here = `${base}/pipeline`
  const now = Date.now()
  const cur = home.office.currency
  const country = home.office.country
  const p = portfolio(clinics, country, now)
  const sum = (list: ClinicAccount[]) => list.reduce((total, c) => total + (monthlyValue(c, country) ?? 0), 0)
  // Late follow-ups first, then the ones with a date, then the rest.
  const order = (a: ClinicAccount, b: ClinicAccount) =>
    daysLate(b.next_action_at, now) - daysLate(a.next_action_at, now)
    || (a.next_action_at ?? '9').localeCompare(b.next_action_at ?? '9')
    || a.name.localeCompare(b.name)
  const salesValue = sum(p.sales)

  function card(c: ClinicAccount, next: ClinicStage | null) {
    const value = monthlyValue(c, country)
    const late = daysLate(c.next_action_at, now)
    const due = c.next_action_at ? new Date(c.next_action_at).getTime() : null
    return (
      <li key={c.id} className="rounded-xl border border-line bg-surface p-3">
        <a href={`${base}/clinics/${c.id}`} className="block space-y-1.5">
          <span className="block font-semibold leading-snug text-ink">{c.name}</span>
          <span className="block text-xs text-muted">{[c.district, c.facility_level].filter(Boolean).join(' · ') || t('pipeline.noDistrict')}</span>
          <span className="num block text-[13px]">
            {c.tier && value !== null
              ? <>{t(`pipeline.tier.${c.tier}`)} · <span className="font-semibold text-ink">{money(value, cur)}</span></>
              : <span className="text-muted">{t('pipeline.noPlan')}</span>}
          </span>
          <span className={`block rounded-lg px-2 py-1.5 text-xs ${late > 0 ? 'bg-amber-soft text-amber-ink' : 'bg-background text-body'}`}>
            <span className="block font-semibold">{c.next_action ?? t('pipeline.noNext')}</span>
            {due !== null ? (
              <span className="block">
                {late === 1 ? t('pipeline.late1') : late > 1 ? t('pipeline.late', { n: late }) : due < now + 86_400_000 ? t('pipeline.dueToday') : t('common.due', { date: shortDate(c.next_action_at!) })}
              </span>
            ) : null}
          </span>
          <span className="block text-xs text-muted">
            {c.last_contact_at ? t('clinics.lastContact', { when: relativeDay(c.last_contact_at, t) }) : t('clinics.noContact')}
            {c.assigned_member ? ` · ${c.assigned_member}` : ''}
          </span>
        </a>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {c.contact_phone ? (
            <WhatsAppButton className="btn-whatsapp btn-xs" phone={c.contact_phone} label="WhatsApp" text={t('pipeline.hello', { contact: c.contact_name ?? '', office: home.office.name })} />
          ) : null}
          {next ? (
            <form action={setStageAction.bind(null, slug, c.id)}>
              <input type="hidden" name="stage" value={next} />
              <input type="hidden" name="return_to" value={here} />
              <button className="btn-secondary btn-xs">{t(`pipeline.moveTo.${next as 'contacted' | 'demo' | 'readiness'}`)}</button>
            </form>
          ) : null}
        </div>
      </li>
    )
  }

  return (
    <div className="wide space-y-5">
      <PageHeader
        title={t('shell.pipeline')} sub={t('pipeline.sub')}
        action={
          <>
            <a href={`${base}/clinics/import`} className="btn-secondary btn-sm">{t('clinics.import')}</a>
            <a href={`${base}/clinics/new`} className="btn-primary btn-sm">{t('pipeline.add')}</a>
          </>
        }
      />
      <Flash {...flash} />

      {p.sales.length + p.onboarding.length === 0 ? (
        <Empty title={t('pipeline.emptyTitle')} body={t('pipeline.emptyBody')}>
          <a href={`${base}/clinics/new`} className="btn-primary btn-sm">{t('pipeline.add')}</a>
          <a href={`${base}/leads/register`} className="btn-secondary btn-sm">{t('today.findClinics')}</a>
          <a href={`${base}/more/share`} className="btn-secondary btn-sm">{t('more.share')}</a>
        </Empty>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label={t('pipeline.talking')} value={p.sales.length === 1 ? t('today.pipeline1') : t('today.pipelineN', { n: p.sales.length })} />
            <Stat
              label={t('pipeline.ifAll')} value={money(salesValue, cur)}
              note={p.sales.some((c) => !c.tier) ? t('pipeline.noPlanCount', { n: p.sales.filter((c) => !c.tier).length }) : t('pipeline.perMonth')}
            />
            <Stat label={t('pipeline.won')} value={p.onboarding.length} note={t('pipeline.wonNote', { amount: money(sum(p.onboarding), cur) })} href={`${base}/onboarding`} />
            <Stat
              label={t('pipeline.overdue')} value={p.followUpsOverdue.length}
              tone={p.followUpsOverdue.length > 0 ? 'warn' : undefined}
              note={p.followUpsOverdue.length > 0 ? t('pipeline.overdueNote') : t('pipeline.overdueNone')}
            />
          </div>

          <div className="overflow-x-auto pb-2">
            <div className="grid min-w-[880px] grid-cols-4 items-start gap-3">
              {COLUMNS.map(({ stage, next }) => {
                const list = clinics.filter((c) => c.stage === stage).sort(order)
                return (
                  <section key={stage} aria-label={t(`clinics.stage.${stage}`)} className="space-y-2 rounded-2xl bg-background p-2.5">
                    <div className="flex items-baseline justify-between gap-2 px-1.5 pt-0.5">
                      <h2 className="text-[13px]">{t(`pipeline.column.${stage as 'lead' | 'contacted' | 'demo'}`)} <span className="font-medium text-muted">{list.length}</span></h2>
                      <span className="num text-xs text-muted">{sum(list) > 0 ? money(sum(list), cur) : ''}</span>
                    </div>
                    {list.length === 0
                      ? <p className="px-1.5 pb-2 text-xs text-muted">{t(`pipeline.columnEmpty.${stage as 'lead' | 'contacted' | 'demo'}`)}</p>
                      : <ul className="space-y-2">{list.map((c) => card(c, next))}</ul>}
                  </section>
                )
              })}
              <section aria-label={t('pipeline.won')} className="space-y-2 rounded-2xl bg-green-soft/50 p-2.5">
                <div className="flex items-baseline justify-between gap-2 px-1.5 pt-0.5">
                  <h2 className="text-[13px]">{t('pipeline.won')} <span className="font-medium text-muted">{p.onboarding.length}</span></h2>
                  <a href={`${base}/onboarding`} className="text-xs font-semibold text-coral">{t('common.open')}</a>
                </div>
                {p.onboarding.length === 0
                  ? <p className="px-1.5 pb-2 text-xs text-muted">{t('pipeline.wonEmpty')}</p>
                  : <ul className="space-y-2">{[...p.onboarding].sort(order).map((c) => card(c, null))}</ul>}
              </section>
            </div>
          </div>
          <p className="text-[13px] text-muted">{t('pipeline.hint')}</p>
        </>
      )}
    </div>
  )
}
