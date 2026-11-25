import { Flash, HealthChip, PageHeader, StageChip } from '@/components/ui'
import { getOfficeScope } from '@/lib/auth'
import { relativeDay } from '@/lib/dates'
import { rpc } from '@/lib/db'
import type { ClinicAccount, ClinicStage } from '@/lib/types'
import { t } from '@/i18n'

type Props = { params: Promise<{ office: string }>; searchParams: Promise<{ show?: string; ok?: string; error?: string }> }

const GROUPS: Record<string, ClinicStage[]> = {
  pipeline: ['lead', 'contacted', 'demo'],
  onboarding: ['readiness', 'configured', 'trained', 'kit_delivered'],
  live: ['live', 'steady', 'billed'],
}

export default async function ClinicsPage({ params, searchParams }: Props) {
  const { office: slug } = await params
  const { show, ...flash } = await searchParams
  const scope = await getOfficeScope(slug)
  const all = await rpc<ClinicAccount[]>('office_clinics_list', { p_office_id: scope.office_id })
  const base = `/o/${slug}/clinics`
  const active = all.filter((c) => c.stage !== 'churned')
  const shown = show && GROUPS[show] ? active.filter((c) => GROUPS[show].includes(c.stage)) : active

  // Clinics that need the partner come first: red, then amber, then by stage.
  const weight = (c: ClinicAccount) => (c.health?.score === 'red' ? 0 : c.health?.score === 'amber' ? 1 : 2)
  shown.sort((a, b) => weight(a) - weight(b))

  const filters = [
    { key: '', label: t('clinics.filterAll'), n: active.length },
    ...(['pipeline', 'onboarding', 'live'] as const).map((k) => ({
      key: k,
      label: t(`clinics.filter${k[0].toUpperCase()}${k.slice(1)}` as 'clinics.filterLive'),
      n: active.filter((c) => GROUPS[k].includes(c.stage)).length,
    })),
  ]

  return (
    <div className="wide space-y-5">
      <PageHeader
        title={t('clinics.title')}
        action={
          <>
            <a href={`${base}/import`} className="btn-secondary hidden sm:inline-flex">{t('clinics.import')}</a>
            <a href={`${base}/new`} className="btn-primary">{t('clinics.add')}</a>
          </>
        }
      />
      <Flash {...flash} />

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        {filters.map((f) => (
          <a
            key={f.key}
            href={f.key ? `${base}?show=${f.key}` : base}
            className={`shrink-0 rounded-full border px-3.5 py-2 text-sm font-semibold ${
              (show ?? '') === f.key ? 'border-cobalt bg-cobalt text-white' : 'border-line bg-surface text-body'
            }`}
          >
            {f.label} {f.n}
          </a>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="card max-w-xl space-y-3">
          <div className="space-y-1">
            <p className="font-semibold text-ink">{t('clinics.empty')}</p>
            <p className="text-sm">{t('guide.job.find.body')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={`${base}/new`} className="btn-primary">{t('clinics.add')}</a>
            <a href={`${base}/import`} className="btn-secondary">{t('clinics.import')}</a>
            <a href={`/o/${slug}/more/share`} className="btn-secondary">{t('more.share')}</a>
          </div>
        </div>
      ) : (
        <>
        <div className="card hidden overflow-hidden p-0 lg:block">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-line-soft/60">
              <tr>
                {(['clinic', 'stage', 'health', 'next', 'lastContact', 'owner'] as const).map((k) => (
                  <th key={k} scope="col" className="meta px-4 py-2.5 font-medium">{t(`clinics.col.${k}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {shown.map((c) => (
                <tr key={c.id} className="hover:bg-line-soft/50">
                  <td className="px-4 py-3">
                    <a href={`${base}/${c.id}`} className="font-semibold text-ink hover:text-cobalt">{c.name}</a>
                    <span className="block text-xs text-muted">{[c.district, c.facility_level].filter(Boolean).join(' · ')}</span>
                  </td>
                  <td className="px-4 py-3"><StageChip stage={c.stage} /></td>
                  <td className="px-4 py-3">{c.health ? <HealthChip score={c.health.score} /> : <span className="text-muted">—</span>}</td>
                  <td className="max-w-[18rem] truncate px-4 py-3 text-ink">{c.next_action ?? <span className="text-muted">—</span>}</td>
                  <td className="whitespace-nowrap px-4 py-3">{c.last_contact_at ? relativeDay(c.last_contact_at, t) : <span className="text-muted">—</span>}</td>
                  <td className="px-4 py-3">{c.assigned_member ?? <span className="text-muted">—</span>}</td>
                </tr>
              ))}
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
                <span className="block text-sm">
                  {[c.district, c.assigned_member].filter(Boolean).join(' · ')}
                </span>
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

      <a href={`${base}/import`} className="btn-secondary w-full sm:hidden">{t('clinics.import')}</a>
    </div>
  )
}
