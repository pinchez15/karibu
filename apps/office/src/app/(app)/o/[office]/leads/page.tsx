import { Flash, PageHeader, WhatsAppButton } from '@/components/ui'
import { getOfficeScope } from '@/lib/auth'
import { relativeDay } from '@/lib/dates'
import { rpc } from '@/lib/db'
import { getHome } from '@/lib/office'
import type { ClinicAccount } from '@/lib/types'
import { t } from '@/i18n'
import { setStageAction } from '../clinics/actions'

type Props = { params: Promise<{ office: string }>; searchParams: Promise<{ ok?: string; error?: string }> }

// Where new clinics come from. Enquiries that arrived on their own are first,
// because a clinic that asked is worth ten that did not; then the leads nobody
// has spoken to; then the three ways to add more.
export default async function LeadsPage({ params, searchParams }: Props) {
  const { office: slug } = await params
  const flash = await searchParams
  const scope = await getOfficeScope(slug)
  const [home, clinics] = await Promise.all([
    getHome(scope.office_id),
    rpc<ClinicAccount[]>('office_clinics_list', { p_office_id: scope.office_id }),
  ])
  const base = `/o/${slug}`
  const here = `${base}/leads`
  const leads = clinics.filter((c) => c.stage === 'lead')
  const oldest = (a: ClinicAccount, b: ClinicAccount) => a.created_at.localeCompare(b.created_at)
  const asked = leads.filter((c) => c.source === 'public_form' || c.source === 'referral').sort(oldest)
  const cold = leads.filter((c) => c.source !== 'public_form' && c.source !== 'referral').sort(oldest)

  // Leads by district, so a trip can be planned around where they cluster.
  const byDistrict = new Map<string, number>()
  for (const c of leads) if (c.district) byDistrict.set(c.district, (byDistrict.get(c.district) ?? 0) + 1)
  const districts = [...byDistrict.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
  const liveDistricts = new Set(clinics.filter((c) => ['live', 'steady', 'billed'].includes(c.stage) && c.district).map((c) => c.district))

  function row(c: ClinicAccount) {
    return (
      <tr key={c.id}>
        <td>
          <a href={`${base}/clinics/${c.id}`} className="font-semibold text-ink hover:text-coral">{c.name}</a>
          <span className="block text-[13px] text-muted">{[c.district, c.facility_level].filter(Boolean).join(' · ')}</span>
        </td>
        <td>
          {c.contact_name ?? <span className="text-muted">—</span>}
          {c.contact_phone ? <span className="num block text-[13px] text-muted">{c.contact_phone}</span> : null}
        </td>
        <td className="whitespace-nowrap">{t('leads.added', { when: relativeDay(c.created_at, t) })}</td>
        <td>
          <div className="flex flex-wrap justify-end gap-1.5">
            {c.contact_phone ? (
              <>
                <a href={`tel:${c.contact_phone}`} className="btn-secondary btn-xs">{t('common.call')}</a>
                <WhatsAppButton className="btn-whatsapp btn-xs" phone={c.contact_phone} label="WhatsApp" text={t('pipeline.hello', { contact: c.contact_name ?? '', office: home.office.name })} />
              </>
            ) : null}
            <form action={setStageAction.bind(null, slug, c.id)}>
              <input type="hidden" name="stage" value="contacted" />
              <input type="hidden" name="return_to" value={here} />
              <button className="btn-secondary btn-xs">{t('pipeline.moveTo.contacted')}</button>
            </form>
          </div>
        </td>
      </tr>
    )
  }

  const table = (list: ClinicAccount[]) => (
    <div className="table-wrap">
      <table className="table min-w-[640px]">
        <thead>
          <tr>
            <th scope="col">{t('clinics.col.clinic')}</th>
            <th scope="col">{t('clinic.contact')}</th>
            <th scope="col">{t('leads.colAdded')}</th>
            <th scope="col" className="text-right">{t('leads.colDo')}</th>
          </tr>
        </thead>
        <tbody>{list.map(row)}</tbody>
      </table>
    </div>
  )

  return (
    <div className="wide space-y-6">
      <PageHeader
        title={t('leads.title')} sub={t('leads.sub')}
        action={
          <>
            <a href={`${base}/clinics/import`} className="btn-secondary btn-sm">{t('clinics.import')}</a>
            <a href={`${base}/clinics/new`} className="btn-primary btn-sm">{t('pipeline.add')}</a>
          </>
        }
      />
      <Flash {...flash} />

      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-[15px]">{t('leads.asked')} {asked.length > 0 ? <span className="chip-warning">{asked.length}</span> : null}</h2>
        {asked.length === 0 ? (
          <div className="card flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-xl text-sm">{t('leads.askedEmpty')}</p>
            <a href={`${base}/more/share`} className="btn-secondary btn-sm">{t('more.share')}</a>
          </div>
        ) : (
          <>
            <p className="text-sm">{t('leads.askedHint')}</p>
            {table(asked)}
          </>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-[15px]">{t('leads.cold')} <span className="font-medium text-muted">{cold.length}</span></h2>
        {cold.length === 0 ? <p className="card text-sm">{t('leads.coldEmpty')}</p> : table(cold)}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        {districts.length > 0 ? (
          <section className="card space-y-2.5">
            <h2 className="text-[15px]">{t('leads.byDistrict')}</h2>
            {districts.map(([name, n]) => (
              <div key={name} className="flex items-center gap-2.5 text-[13px]">
                <span className="w-28 shrink-0 truncate">{name}</span>
                <span className="h-2 flex-1 rounded-full bg-line-soft"><span className="block h-2 rounded-full bg-coral-bright/60" style={{ width: `${(n / districts[0][1]) * 100}%` }} /></span>
                <span className="num w-5 text-right font-semibold text-ink">{n}</span>
                {liveDistricts.has(name) ? <span className="chip-success">{t('leads.youAreThere')}</span> : null}
              </div>
            ))}
            <p className="text-[13px] text-muted">{t('leads.byDistrictHint')}</p>
          </section>
        ) : null}

        <section className="card space-y-2 lg:col-span-2">
          <h2 className="text-[15px]">{t('leads.waysTitle')}</h2>
          <ul className="grid gap-3 sm:grid-cols-3">
            {([
              ['share', `${base}/more/share`], ['import', `${base}/clinics/import`], ['hand', `${base}/clinics/new`],
            ] as const).map(([key, href]) => (
              <li key={key}>
                <a href={href} className="block h-full rounded-xl border border-line p-3 hover:border-ink/30">
                  <span className="block font-semibold text-ink">{t(`leads.way.${key}.title`)}</span>
                  <span className="mt-0.5 block text-[13px]">{t(`leads.way.${key}.body`)}</span>
                </a>
              </li>
            ))}
          </ul>
          <p className="text-[13px] text-muted">{t('leads.directory')}</p>
        </section>
      </div>
    </div>
  )
}
