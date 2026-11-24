import { JourneyCards } from '@/components/Journey'
import { PageHeader, Section } from '@/components/ui'
import { getOfficeScope } from '@/lib/auth'
import { rpc } from '@/lib/db'
import { journey } from '@/lib/journey'
import { getHome } from '@/lib/office'
import { t } from '@/i18n'

type Props = { params: Promise<{ office: string }> }

const STAGES = [1, 2, 3, 4, 5] as const

// The map of the whole product: what a partner can do, where, and how their
// business stage moves. Reachable from the sidebar, the stage chip and Today.
export default async function GuidePage({ params }: Props) {
  const { office: slug } = await params
  const scope = await getOfficeScope(slug)
  const home = await getHome(scope.office_id)
  const base = `/o/${slug}`
  const current = home.stage.stage
  const stage5 = await rpc<{ clinics: number; staff: number }>('office_stage_thresholds').catch(() => ({ clinics: 10, staff: 3 }))

  return (
    <>
      <PageHeader title={t('guide.title')} />
      <p className="text-[15px]">{t('guide.intro')}</p>

      <div className="wide">
        <Section title={t('guide.jobsTitle')}>
          <JourneyCards jobs={journey(base, home)} />
        </Section>
      </div>

      <div className="wide">
        <Section title={t('guide.stagesTitle')}>
          <ol className="grid gap-3 md:grid-cols-5">
            {STAGES.map((n) => {
              const state = n < current ? 'done' : n === current ? 'current' : 'next'
              return (
                <li key={n} className={`card flex flex-col gap-1.5 ${state === 'current' ? 'border-cobalt ring-2 ring-cobalt-soft' : ''}`}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="meta whitespace-nowrap">{t('stage.n', { n })}</span>
                    {state === 'done' ? <span className="chip-success whitespace-nowrap">{t('stage.done')}</span> : null}
                    {state === 'current' ? <span className="chip-info whitespace-nowrap">{t('stage.current')}</span> : null}
                  </span>
                  <h3>{t(`stage.name.${n}`)}</h3>
                  <p className="text-sm">{t(`stage.what.${n}`)}</p>
                  {n === current + 1 ? (
                    <p className="mt-auto border-t border-line-soft pt-2 text-sm text-ink">
                      {t(`stage.next.${n as 2 | 3 | 4 | 5}`, stage5)}
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ol>
        </Section>
      </div>
    </>
  )
}
