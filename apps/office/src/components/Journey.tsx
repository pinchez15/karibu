import type { Job } from '@/lib/journey'
import { t } from '@/i18n'

const STATE_CHIP: Record<Job['state'], string> = { now: 'chip-info', ready: 'chip-neutral', later: 'chip-neutral' }

function StateChip({ job }: { job: Job }) {
  return <span className={`${STATE_CHIP[job.state]} shrink-0`}>{t(`guide.state.${job.state}`, { n: job.count ?? 0 })}</span>
}

/** The short map shown on Today: one row per job, each one tap from where it happens. */
export function JourneyList({ jobs }: { jobs: Job[] }) {
  return (
    <ol className="card divide-y divide-line-soft p-0">
      {jobs.map((job, i) => {
        const row = (
          <>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-line-soft text-xs font-semibold text-body">{i + 1}</span>
            <span className={`min-w-0 flex-1 text-[15px] font-medium ${job.href ? 'text-ink' : 'text-muted'}`}>{t(`guide.job.${job.key}.title`)}</span>
            <StateChip job={job} />
          </>
        )
        return (
          <li key={job.key}>
            {job.href ? (
              <a href={job.href} className="flex items-center gap-3 px-4 py-3 hover:bg-line-soft active:bg-line-soft">{row}</a>
            ) : (
              <span className="flex items-center gap-3 px-4 py-3">{row}</span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** The full map in the guide: what each job is, and every way to start it. */
export function JourneyCards({ jobs }: { jobs: Job[] }) {
  return (
    <ol className="grid gap-3 md:grid-cols-2">
      {jobs.map((job, i) => (
        <li key={job.key} className="card flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className={job.href ? '' : 'text-muted'}>{i + 1}. {t(`guide.job.${job.key}.title`)}</h3>
            <StateChip job={job} />
          </div>
          <p className="text-sm">{t(`guide.job.${job.key}.body`)}</p>
          {job.href ? (
            <div className="mt-auto flex flex-wrap gap-2 pt-1">
              <a href={job.href} className="btn-primary">{t(`guide.open.${job.key}`)}</a>
              {job.actions.map(([key, href]) => (
                <a key={key} href={href} className="btn-secondary">{t(`guide.action.${key}` as 'guide.action.addClinic')}</a>
              ))}
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  )
}
