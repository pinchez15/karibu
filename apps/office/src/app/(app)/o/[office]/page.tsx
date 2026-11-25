import { JourneyList } from '@/components/Journey'
import { Flash, Section } from '@/components/ui'
import { getOfficeScope } from '@/lib/auth'
import { shortDate } from '@/lib/dates'
import { getHome } from '@/lib/office'
import { rpc } from '@/lib/db'
import { journey } from '@/lib/journey'
import { nextUnlock } from '@/lib/stage'
import { taskHref, taskTitle } from '@/lib/tasks'
import { t } from '@/i18n'
import { addTaskAction, closeTaskAction } from './actions'

type Props = { params: Promise<{ office: string }>; searchParams: Promise<{ ok?: string; error?: string }> }

function plural(n: number, one: Parameters<typeof t>[0], many: Parameters<typeof t>[0]) {
  return t(n === 1 ? one : many, { n })
}

export default async function TodayPage({ params, searchParams }: Props) {
  const { office: slug } = await params
  const flash = await searchParams
  const scope = await getOfficeScope(slug)
  const home = await getHome(scope.office_id)
  const base = `/o/${slug}`
  const next = nextUnlock(home.stage)
  const now = Date.now()

  // The headline is a sentence about what needs the partner, not a set of charts.
  const summary = [
    home.tasks.length > 0 ? t('home.summary.tasks', { n: home.tasks.length }) : null,
    home.invoices.overdue > 0 ? plural(home.invoices.overdue, 'home.summary.overdueInvoices', 'home.summary.overdueInvoicesMany') : null,
    home.open_tickets > 0 ? plural(home.open_tickets, 'home.summary.tickets', 'home.summary.ticketsMany') : null,
    home.unmatched_payments > 0 ? plural(home.unmatched_payments, 'home.summary.payments', 'home.summary.paymentsMany') : null,
  ].filter(Boolean)

  const stage5 = next === 5
    ? await rpc<{ clinics: number; staff: number }>('office_stage_thresholds').catch(() => ({ clinics: 10, staff: 3 }))
    : null

  return (
    <div className="wide grid gap-5 lg:grid-cols-3 lg:gap-8">
      <div className="space-y-5 lg:col-span-2">
      <div>
        <h1>{t('home.greeting')}</h1>
        <p className="mt-1 text-[15px]">{summary.length ? summary.join(' · ') : t('home.allClear')}</p>
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

      <Section title={home.tasks.length > 0 ? t('home.summary.tasks', { n: home.tasks.length }) : t('clinic.tasks')}>
        {home.tasks.length === 0 ? (
          <div className="card space-y-3">
            <p className="text-sm">{t('home.allClearHint')}</p>
            <div className="flex flex-wrap gap-2">
              <a href={`${base}/clinics/new`} className="btn-primary">{t('clinics.add')}</a>
              <a href={`${base}/clinics/import`} className="btn-secondary">{t('clinics.import')}</a>
              <a href={`${base}/more/share`} className="btn-secondary">{t('more.share')}</a>
            </div>
          </div>
        ) : (
          <ul className="space-y-2">
            {home.tasks.map((task) => {
              const { title, subtitle } = taskTitle(task, t)
              const href = taskHref(base, task)
              const overdue = task.due_at ? new Date(task.due_at).getTime() < now : false
              return (
                <li key={task.id} className="card flex items-stretch gap-2 p-0">
                  <a href={href ?? '#'} className="min-w-0 flex-1 px-4 py-3">
                    <span className="block font-semibold text-ink">{title}</span>
                    {subtitle ? <span className="block truncate text-sm">{subtitle}</span> : null}
                    {task.due_at ? (
                      <span className={`mt-1 inline-block ${overdue ? 'chip-danger' : 'chip-neutral'}`}>
                        {overdue ? t('common.overdue') : t('common.due', { date: shortDate(task.due_at) })}
                      </span>
                    ) : null}
                  </a>
                  <form action={closeTaskAction.bind(null, slug)} className="flex">
                    <input type="hidden" name="task_id" value={task.id} />
                    <button className="btn-quiet rounded-l-none border-l border-line px-4" aria-label={`${t('common.done')}: ${title}`}>
                      {t('common.done')}
                    </button>
                  </form>
                </li>
              )
            })}
          </ul>
        )}
        <form action={addTaskAction.bind(null, slug)} className="flex gap-2">
          <input name="title" className="input" placeholder={t('home.addTaskPlaceholder')} aria-label={t('home.addTask')} />
          <button className="btn-secondary shrink-0">{t('common.add')}</button>
        </form>
      </Section>
      </div>

      <aside className="space-y-5">
      <div className="grid grid-cols-3 gap-2">
        {(['pipeline', 'onboarding', 'live'] as const).map((k) => (
          <a key={k} href={`${base}/clinics?show=${k}`} className="card px-3 py-3 text-center">
            <span className="block text-2xl font-semibold text-ink">{home.counts[k]}</span>
            <span className="block text-xs text-muted">{t(`home.counts.${k}`)}</span>
          </a>
        ))}
      </div>

      {home.tasks.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          <a href={`${base}/clinics/new`} className="btn-primary">{t('clinics.add')}</a>
          <a href={`${base}/more/share`} className="btn-secondary">{t('more.share')}</a>
        </div>
      ) : null}

      {/* The whole product on one card, so nothing has to be found by finishing a step first. */}
      <Section
        title={t('guide.todayTitle')}
        action={<a href={`${base}/guide`} className="text-sm font-medium text-cobalt">{t('nav.guide')} →</a>}
      >
        <JourneyList jobs={journey(base, home)} />
      </Section>

      {next ? (
        <Section title={t('stage.nextTitle')}>
          <div className="card space-y-2">
            <p className="meta">{t('stage.label', { n: home.stage.stage })} · {t(`stage.name.${home.stage.stage}`)}</p>
            <p className="text-[15px] text-ink">
              {t(`stage.next.${next}`, { clinics: stage5?.clinics ?? 10, staff: stage5?.staff ?? 3 })}
            </p>
          </div>
        </Section>
      ) : null}

      {!home.office.certified_at ? (
        <div className="card">
          <p className="font-semibold text-ink">{t('home.notCertified')}</p>
          <p className="text-sm">{t('home.notCertifiedBody')}</p>
        </div>
      ) : null}
      </aside>
    </div>
  )
}
