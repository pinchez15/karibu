import { Empty, Flash, HealthChip, PageHeader, StageChip, Tabs } from '@/components/ui'
import { getOfficeScope } from '@/lib/auth'
import { relativeDay } from '@/lib/dates'
import { rpc } from '@/lib/db'
import { money } from '@/lib/money'
import { getHome } from '@/lib/office'
import { groupOf, monthlyValue, type Group } from '@/lib/portfolio'
import type { ClinicAccount } from '@/lib/types'
import { t } from '@/i18n'

type Props = { params: Promise<{ office: string }>; searchParams: Promise<{ show?: string; q?: string; ok?: string; error?: string }> }

const SHOWN: Record<string, Group> = { live: 'live', onboarding: 'onboarding', pipeline: 'sales' }

// The whole book in one table. Opens on live clinics, the ones the office
// looks after day to day; the top-bar search lands here with ?q=.
export default async function ClinicsPage({ params, searchParams }: Props) {
  const { office: slug } = await params
  const { show, q, ...flash } = await searchParams
  const scope = await getOfficeScope(slug)
  const [home, all] = await Promise.all([
    getHome(scope.office_id),
    rpc<ClinicAccount[]>('office_clinics_list', { p_office_id: scope.office_id }),
  ])
  const base = `/o/${slug}/clinics`
  const cur = home.office.currency
  const active = all.filter((c) => c.stage !== 'churned')
  const count = (g: Group) => active.filter((c) => groupOf(c.stage) === g).length
  const query = (q ?? '').trim().toLowerCase()
  // With no filter chosen, show live clinics once there are some; before that, everything.
  const tab = query ? 'all' : show && (SHOWN[show] || show === 'all') ? show : count('live') > 0 ? 'live' : 'all'
  const shown = (query
    ? active.filter((c) => `${c.name} ${c.district ?? ''} ${c.contact_name ?? ''}`.toLowerCase().includes(query))
    : tab === 'all' ? active : active.filter((c) => groupOf(c.stage) === SHOWN[tab])
  ).slice()

  // Clinics that need the partner come first: red, then amber, then by name.
  const weight = (c: ClinicAccount) => (c.health?.score === 'red' ? 0 : c.health?.score === 'amber' ? 1 : 2)
  shown.sort((a, b) => weight(a) - weight(b) || a.name.localeCompare(b.name))

  return (
    <div className="wide space-y-5">
      <PageHeader
        title={t('clinics.title')}
        sub={query ? t('clinics.searchFor', { q: q ?? '', n: shown.length }) : t('clinics.sub')}
        action={
          <>
            <a href={`${base}/import`} className="btn-secondary btn-sm hidden sm:inline-flex">{t('clinics.import')}</a>
            <a href={`${base}/new`} className="btn-primary btn-sm">{t('clinics.add')}</a>
          </>
        }
      />
      <Flash {...flash} />

      <form action={base} role="search" className="lg:hidden">
        <input type="search" name="q" defaultValue={q ?? ''} className="input rounded-full px-4" placeholder={t('shell.search')} aria-label={t('shell.searchLabel')} />
      </form>

      {query ? (
        <a href={base} className="text-sm font-semibold text-coral">← {t('clinics.clearSearch')}</a>
      ) : (
        <Tabs items={[
          { href: `${base}?show=live`, label: `${t('clinics.filterLive')} ${count('live')}`, on: tab === 'live' },
          { href: `${base}?show=onboarding`, label: `${t('clinics.filterOnboarding')} ${count('onboarding')}`, on: tab === 'onboarding' },
          { href: `${base}?show=pipeline`, label: `${t('clinics.filterPipeline')} ${count('sales')}`, on: tab === 'pipeline' },
          { href: `${base}?show=all`, label: `${t('clinics.filterAll')} ${active.length}`, on: tab === 'all' },
        ]} />
      )}

      {shown.length === 0 ? (
        query ? <p className="card max-w-xl text-sm">{t('clinics.searchNone')}</p> : (
          <Empty title={active.length === 0 ? t('clinics.empty') : t(`clinics.emptyTab.${tab as 'live' | 'onboarding' | 'pipeline'}`)} body={active.length === 0 ? t('guide.job.find.body') : undefined}>
            <a href={`${base}/new`} className="btn-primary btn-sm">{t('clinics.add')}</a>
            <a href={`${base}/import`} className="btn-secondary btn-sm">{t('clinics.import')}</a>
            <a href={`/o/${slug}/more/share`} className="btn-secondary btn-sm">{t('more.share')}</a>
          </Empty>
        )
      ) : (
        <>
          <div className="table-wrap hidden lg:block">
            <table className="table">
              <thead>
                <tr>
                  {(['clinic', 'stage', 'health', 'plan', 'next', 'lastContact', 'owner'] as const).map((k) => (
                    <th key={k} scope="col" className={k === 'plan' ? 'text-right' : undefined}>{t(`clinics.col.${k}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => {
                  const value = monthlyValue(c, home.office.country)
                  return (
                    <tr key={c.id} className="hover:bg-background">
                      <td>
                        <a href={`${base}/${c.id}`} className="font-semibold text-ink hover:text-coral">{c.name}</a>
                        <span className="block text-[13px] text-muted">{[c.district, c.facility_level].filter(Boolean).join(' · ')}</span>
                      </td>
                      <td><StageChip stage={c.stage} /></td>
                      <td>{c.health ? <HealthChip score={c.health.score} /> : <span className="text-muted">—</span>}</td>
                      <td className="num whitespace-nowrap text-right">
                        {c.tier && value !== null ? (
                          <>
                            <span className="font-semibold text-ink">{money(value, cur)}</span>
                            <span className="block text-[13px] text-muted">{t(`pipeline.tier.${c.tier}`)}</span>
                          </>
                        ) : <span className="text-muted">{t('pipeline.noPlan')}</span>}
                      </td>
                      <td className="max-w-[16rem] truncate text-ink">{c.next_action ?? <span className="text-muted">—</span>}</td>
                      <td className="whitespace-nowrap">{c.last_contact_at ? relativeDay(c.last_contact_at, t) : <span className="text-muted">—</span>}</td>
                      <td>{c.assigned_member ?? <span className="text-muted">—</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <ul className="space-y-2 lg:hidden">
            {shown.map((c) => (
              <li key={c.id}>
                <a href={`${base}/${c.id}`} className="card block space-y-1.5 active:bg-line-soft">
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0 font-semibold text-ink">{c.name}</span>
                    <span className="flex shrink-0 gap-1">
                      {c.health ? <HealthChip score={c.health.score} /> : null}
                      <StageChip stage={c.stage} />
                    </span>
                  </span>
                  <span className="block text-sm">{[c.district, c.assigned_member].filter(Boolean).join(' · ')}</span>
                  {c.next_action ? <span className="block text-sm text-ink">{t('clinics.next', { action: c.next_action })}</span> : null}
                  <span className="block text-xs text-muted">
                    {c.last_contact_at ? t('clinics.lastContact', { when: relativeDay(c.last_contact_at, t) }) : t('clinics.noContact')}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
