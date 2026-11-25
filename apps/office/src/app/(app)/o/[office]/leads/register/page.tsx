import { Flash, PageHeader, Tabs } from '@/components/ui'
import { getOfficeScope } from '@/lib/auth'
import { rpc } from '@/lib/db'
import { t } from '@/i18n'
import { addFacilitiesAction } from './actions'

type Ownership = 'GOVT' | 'PFP' | 'PNFP'
interface Facility {
  id: string; district: string; subcounty: string; name: string; level: string | null; authority: string | null
  ownership: Ownership | null; phone: string | null; phone_source: string | null
  fit: 1 | 2 | 3; status: 'open' | 'yours' | 'held'; near: boolean; account_id: string | null
}
interface Search {
  total: number
  in_country: number
  rows: Facility[]
  districts: { district: string; total: number; open: number; yours: number; near: boolean }[]
  sources: { source: string; year: number | null }[]
}

type Props = {
  params: Promise<{ office: string }>
  searchParams: Promise<{ f?: string; q?: string; district?: string; own?: string | string[]; level?: string | string[]; all?: string; page?: string; ok?: string; error?: string }>
}

const PAGE = 50
const OWNERSHIP: Ownership[] = ['PFP', 'PNFP', 'GOVT']
const LEVELS = ['Clinic', 'HC II', 'HC III', 'HC IV', 'Hospital'] as const
const FIT_CHIP = { 3: 'chip-info', 2: 'chip-neutral', 1: 'chip-neutral' } as const
const list = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v])

// The register of health facilities for the office's country: who is out
// there, who already has them, and one click to put a facility in the
// pipeline. It opens on private and faith-based facilities nobody holds,
// best fit first, because that is the list a partner can act on.
export default async function RegisterPage({ params, searchParams }: Props) {
  const { office: slug } = await params
  const sp = await searchParams
  const scope = await getOfficeScope(slug)
  const base = `/o/${slug}/leads`
  const here = `${base}/register`
  // `f` marks a submitted filter form. Without it, the defaults apply.
  const filtered = sp.f === '1'
  const ownership = (filtered ? list(sp.own) : ['PFP', 'PNFP']).filter((o): o is Ownership => OWNERSHIP.includes(o as Ownership))
  const levels = list(sp.level).filter((l) => (LEVELS as readonly string[]).includes(l))
  const openOnly = filtered ? sp.all !== '1' : true
  const page = Math.max(1, Number(sp.page) || 1)
  const q = (sp.q ?? '').trim()
  const district = (sp.district ?? '').trim()

  const data = await rpc<Search>('office_facilities_search', {
    p_office_id: scope.office_id,
    p_filters: { q, district, ownership, levels, open_only: openOnly, limit: PAGE, offset: (page - 1) * PAGE },
  })

  const query = (patch: Record<string, string | null>) => {
    const u = new URLSearchParams()
    u.set('f', '1')
    if (q) u.set('q', q)
    if (district) u.set('district', district)
    for (const o of ownership) u.append('own', o)
    for (const l of levels) u.append('level', l)
    if (!openOnly) u.set('all', '1')
    if (page > 1) u.set('page', String(page))
    for (const [k, v] of Object.entries(patch)) { if (v === null) u.delete(k); else u.set(k, v) }
    return `${here}?${u}`
  }
  const current = query({})
  const pages = Math.max(1, Math.ceil(data.total / PAGE))
  // Districts where the office already works come first: that is where a trip pays twice.
  const present = data.districts.filter((d) => d.near || d.yours > 0).sort((a, b) => b.open - a.open)
  const year = data.sources.find((s) => s.year)?.year

  if (data.in_country === 0) {
    return (
      <div className="wide space-y-5">
        <PageHeader title={t('leads.title')} sub={t('leads.sub')} />
        <Tabs items={[{ href: base, label: t('register.tabWaiting') }, { href: here, label: t('register.tab'), on: true }]} />
        <p className="card max-w-xl text-sm">{t('register.notLoaded')}</p>
      </div>
    )
  }

  return (
    <div className="wide space-y-5">
      <PageHeader
        title={t('leads.title')}
        sub={t('register.sub', { n: data.in_country.toLocaleString('en-US'), year: year ?? '' })}
        action={<a href={`/o/${slug}/clinics/new`} className="btn-secondary btn-sm">{t('register.notListed')}</a>}
      />
      <Tabs items={[{ href: base, label: t('register.tabWaiting') }, { href: here, label: t('register.tab'), on: true }]} />
      <Flash ok={sp.ok} error={sp.error} />

      {present.length > 0 && !district ? (
        <section className="card space-y-2 border-coral/25 bg-coral-wash">
          <h2 className="text-[15px]">{t('register.nearTitle')}</h2>
          <p className="text-sm">{t('register.nearBody')}</p>
          <div className="flex flex-wrap gap-1.5">
            {present.slice(0, 8).map((d) => (
              <a key={d.district} href={query({ district: d.district, page: null })} className="rounded-full border border-ink/20 bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-ink hover:border-ink/40">
                {d.district} <span className="num font-medium text-muted">{t('register.openCount', { n: d.open })}</span>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <form action={here} className="space-y-4 text-sm">
          <input type="hidden" name="f" value="1" />
          <label className="field"><span>{t('register.search')}</span>
            <input type="search" name="q" defaultValue={q} className="input min-h-0 py-2" placeholder={t('register.searchHint')} /></label>
          <label className="field"><span>{t('clinics.form.district')}</span>
            <select name="district" defaultValue={district} className="input min-h-0 py-2">
              <option value="">{t('register.allDistricts')}</option>
              {data.districts.map((d) => <option key={d.district} value={d.district}>{d.district} ({d.open})</option>)}
            </select></label>
          <fieldset className="space-y-1.5">
            <legend className="mb-1 font-medium text-body">{t('register.ownedBy')}</legend>
            {OWNERSHIP.map((o) => (
              <label key={o} className="flex items-center gap-2">
                <input type="checkbox" name="own" value={o} defaultChecked={ownership.includes(o)} className="h-4 w-4 accent-[rgb(var(--ko-coral))]" />
                {t(`register.ownership.${o}`)}
              </label>
            ))}
          </fieldset>
          <fieldset className="space-y-1.5">
            <legend className="mb-1 font-medium text-body">{t('register.type')}</legend>
            {LEVELS.map((l) => (
              <label key={l} className="flex items-center gap-2">
                <input type="checkbox" name="level" value={l} defaultChecked={levels.includes(l)} className="h-4 w-4 accent-[rgb(var(--ko-coral))]" />
                {t(`register.level.${l}`)}
              </label>
            ))}
            <p className="text-xs text-muted">{t('register.typeHint')}</p>
          </fieldset>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="all" value="1" defaultChecked={!openOnly} className="h-4 w-4 accent-[rgb(var(--ko-coral))]" />
            {t('register.showHeld')}
          </label>
          <div className="flex gap-2">
            <button className="btn-primary btn-sm">{t('register.apply')}</button>
            <a href={here} className="btn-quiet btn-sm">{t('register.reset')}</a>
          </div>
        </form>

        <form action={addFacilitiesAction.bind(null, slug)} className="min-w-0 space-y-3">
          <input type="hidden" name="return_to" value={current} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              <strong className="num text-ink">{data.total.toLocaleString('en-US')}</strong>{' '}
              {district ? t('register.foundIn', { district }) : t('register.found')}
            </p>
            {data.rows.some((r) => r.status === 'open') ? <button className="btn-primary btn-sm">{t('register.addTicked')}</button> : null}
          </div>

          {data.rows.length === 0 ? <p className="card text-sm">{t('register.none')}</p> : (
            <div className="table-wrap">
              <table className="table min-w-[760px]">
                <thead>
                  <tr>
                    <th scope="col" className="w-8"><span className="sr-only">{t('register.tick')}</span></th>
                    <th scope="col">{t('register.colFacility')}</th>
                    <th scope="col">{t('register.type')}</th>
                    <th scope="col">{t('register.ownedBy')}</th>
                    <th scope="col">{t('register.colFit')}</th>
                    <th scope="col" className="text-right">{t('register.colStatus')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id} className="hover:bg-background">
                      <td className="!pr-0">
                        {r.status === 'open' ? <input type="checkbox" name="id" value={r.id} aria-label={`${t('register.tick')}: ${r.name}`} className="h-4 w-4 accent-[rgb(var(--ko-coral))]" /> : null}
                      </td>
                      <td>
                        <span className="font-semibold text-ink">{r.name}</span>
                        <span className="block text-[13px] text-muted">{[r.subcounty, r.district].filter(Boolean).join(', ')}</span>
                        {r.phone ? <span className="num block text-[13px] text-muted">{r.phone} · {t('register.unchecked')}</span> : null}
                      </td>
                      <td className="whitespace-nowrap">{r.level ?? '—'}</td>
                      <td>
                        {r.ownership ? t(`register.ownership.${r.ownership}`) : '—'}
                        {r.authority && r.authority !== 'Private' && r.authority !== 'MOH' ? <span className="block text-[13px] text-muted">{r.authority}</span> : null}
                      </td>
                      <td>
                        <span className={FIT_CHIP[r.fit]}>{t(`register.fit.${r.fit}`)}</span>
                        {r.near ? <span className="mt-0.5 block text-[13px] text-green-ink">{t('leads.youAreThere')}</span> : null}
                      </td>
                      <td className="whitespace-nowrap text-right">
                        {r.status === 'open' ? <button name="one" value={r.id} className="btn-secondary btn-xs">{t('register.addOne')}</button> : null}
                        {r.status === 'yours' ? <a href={`/o/${slug}/clinics/${r.account_id}`} className="chip-success">{t('register.yours')}</a> : null}
                        {r.status === 'held' ? <span className="chip-neutral">{t('register.held')}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pages > 1 ? (
            <nav aria-label={t('register.pages')} className="flex items-center justify-between gap-3 text-sm">
              {page > 1 ? <a href={query({ page: page === 2 ? null : String(page - 1) })} className="btn-secondary btn-xs">← {t('register.prev')}</a> : <span />}
              <span className="num text-muted">{t('register.pageOf', { page, pages })}</span>
              {page < pages ? <a href={query({ page: String(page + 1) })} className="btn-secondary btn-xs">{t('register.next')} →</a> : <span />}
            </nav>
          ) : null}

          <p className="text-xs text-muted">{t('register.caveat', { year: year ?? '' })}</p>
          <p className="text-xs text-muted">{t('register.credit')}</p>
        </form>
      </div>
    </div>
  )
}
