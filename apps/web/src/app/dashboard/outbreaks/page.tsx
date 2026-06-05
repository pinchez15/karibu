import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase'
import { getCoordinatorScope } from '@/lib/auth'
import {
  addDioceseCoordinatorAction,
  setDioceseCoordinatorActiveAction,
  setRegionProtocolAction,
  setRegionProtocolForDioceseAction,
} from './actions'

export const dynamic = 'force-dynamic'

// Ebola is the live protocol. The others are scaffolded for future outbreaks.
const PROTOCOLS = [
  { slug: 'ebola', label: 'Ebola (SVD)' },
  { slug: 'cholera', label: 'Cholera' },
  { slug: 'marburg', label: 'Marburg' },
  { slug: 'mpox', label: 'Mpox' },
] as const

type RegionProtocolRow = {
  id: string
  protocol: string
  scope_type: 'district' | 'diocese'
  scope_value: string
  active: boolean
  note: string | null
  activated_at: string | null
  updated_at: string
}

type CoordinatorRow = {
  id: string
  clerk_user_id: string
  email: string
  display_name: string
  diocese: string
  is_active: boolean
}

type ClinicGeoRow = { diocese: string | null; district: string | null }

function formatWhen(value: string | null): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return value
  }
}

export default async function OutbreaksPage() {
  const scope = await getCoordinatorScope()
  const isSuperadmin = scope === 'all'
  if (scope !== 'all' && scope.length === 0) {
    redirect('/dashboard')
  }

  const supabase = createServiceClient()
  const [{ data: protocolsData }, { data: clinicsData }, { data: coordinatorsData }] =
    await Promise.all([
      supabase
        .from('region_protocols')
        .select('id, protocol, scope_type, scope_value, active, note, activated_at, updated_at')
        .order('active', { ascending: false })
        .order('updated_at', { ascending: false }),
      supabase.from('clinics').select('diocese, district').eq('is_active', true),
      isSuperadmin
        ? supabase
            .from('diocese_coordinators')
            .select('id, clerk_user_id, email, display_name, diocese, is_active')
            .order('diocese', { ascending: true })
        : Promise.resolve({ data: [] as CoordinatorRow[] }),
    ])

  const clinics = (clinicsData ?? []) as ClinicGeoRow[]

  // Districts grouped by diocese, scoped to what the user may manage.
  const byDiocese = new Map<string, Set<string>>()
  for (const c of clinics) {
    if (!c.diocese) continue
    if (scope !== 'all' && !scope.includes(c.diocese)) continue
    if (!byDiocese.has(c.diocese)) byDiocese.set(c.diocese, new Set())
    if (c.district) byDiocese.get(c.diocese)!.add(c.district)
  }
  const dioceses = Array.from(byDiocese.keys()).sort()

  const allProtocols = (protocolsData ?? []) as RegionProtocolRow[]
  // A coordinator only sees rows for their dioceses / the districts within them.
  const visibleDistricts = new Set<string>()
  for (const set of byDiocese.values()) for (const d of set) visibleDistricts.add(d)
  const protocols =
    scope === 'all'
      ? allProtocols
      : allProtocols.filter(
          (p) =>
            (p.scope_type === 'diocese' && scope.includes(p.scope_value)) ||
            (p.scope_type === 'district' && visibleDistricts.has(p.scope_value)),
        )

  const activeProtocols = protocols.filter((p) => p.active)
  const coordinators = (coordinatorsData ?? []) as CoordinatorRow[]

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-semibold">Outbreak protocols</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Turn regional clinical protocols on and off. Outbreaks like Ebola are
            tightly regional — activate at the <strong>district</strong> the Ministry
            of Health has declared, or across a whole <strong>diocese</strong> in one
            step. Clinics on protocol get interruptive danger-sign alerts; everyone
            else stays at baseline.
          </p>
        </div>
        <Link href="/dashboard" className="text-sm text-primary hover:underline">
          ← Back to dashboard
        </Link>
      </div>

      {/* Currently active — the most important thing to see at a glance. */}
      <section className="mb-8 rounded-2xl border border-red-500/30 bg-red-500/5 p-6">
        <h3 className="text-xl font-semibold text-red-900 dark:text-red-200">
          On protocol now
        </h3>
        {activeProtocols.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No regions are currently on protocol. All clinics are at baseline.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {activeProtocols.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/40 bg-card px-4 py-3"
              >
                <div>
                  <span className="font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">
                    {p.protocol}
                  </span>
                  <span className="ml-2 text-sm">
                    {p.scope_type === 'district' ? 'District' : 'Diocese'}:{' '}
                    <strong>{p.scope_value}</strong>
                  </span>
                  <div className="text-xs text-muted-foreground">
                    Since {formatWhen(p.activated_at)}
                    {p.note ? ` · ${p.note}` : ''}
                  </div>
                </div>
                <form action={setRegionProtocolAction}>
                  <input type="hidden" name="protocol" value={p.protocol} />
                  <input type="hidden" name="scope_type" value={p.scope_type} />
                  <input type="hidden" name="scope_value" value={p.scope_value} />
                  <input type="hidden" name="active" value="off" />
                  <button
                    type="submit"
                    className="rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted"
                  >
                    Stand down
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Activate by district. */}
      <section className="mb-8 rounded-2xl border border-border bg-card p-6">
        <h3 className="text-xl font-semibold">Activate a district</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          The precise unit. Use this when MoH declares an outbreak in a named district.
        </p>
        <form action={setRegionProtocolAction} className="mt-5 grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="scope_type" value="district" />
          <input type="hidden" name="active" value="on" />
          <label className="text-sm text-foreground">
            Protocol
            <select
              name="protocol"
              required
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
            >
              {PROTOCOLS.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-foreground">
            District
            <select
              name="scope_value"
              required
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
            >
              <option value="">Select a district…</option>
              {dioceses.map((d) => (
                <optgroup key={d} label={d}>
                  {Array.from(byDiocese.get(d)!)
                    .sort()
                    .map((district) => (
                      <option key={district} value={district}>
                        {district}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="text-sm text-foreground sm:col-span-2">
            Note (optional)
            <input
              name="note"
              placeholder="e.g. WHO-declared SVD outbreak"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              Activate protocol
            </button>
          </div>
        </form>
      </section>

      {/* Diocese shortcut. */}
      <section className="mb-8 rounded-2xl border border-border bg-card p-6">
        <h3 className="text-xl font-semibold">Diocese shortcut</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Activate across every district in a diocese at once. Each district can still
          be stood down individually afterward.
        </p>
        <form
          action={setRegionProtocolForDioceseAction}
          className="mt-5 grid gap-4 sm:grid-cols-2"
        >
          <input type="hidden" name="active" value="on" />
          <label className="text-sm text-foreground">
            Protocol
            <select
              name="protocol"
              required
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
            >
              {PROTOCOLS.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-foreground">
            Diocese
            <select
              name="diocese"
              required
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
            >
              <option value="">Select a diocese…</option>
              {dioceses.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-foreground sm:col-span-2">
            Note (optional)
            <input
              name="note"
              placeholder="e.g. Regional response, all districts"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="rounded-md border border-red-600 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950"
            >
              Activate across diocese
            </button>
          </div>
        </form>
      </section>

      {/* Full history (active + inactive) for the user's scope. */}
      {protocols.length > 0 && (
        <section className="mb-8 rounded-2xl border border-border bg-card p-6">
          <h3 className="text-xl font-semibold">All protocols in your scope</h3>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4">Protocol</th>
                  <th className="py-2 pr-4">Scope</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Updated</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {protocols.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="py-2 pr-4 font-medium uppercase">{p.protocol}</td>
                    <td className="py-2 pr-4">
                      {p.scope_type === 'district' ? 'District' : 'Diocese'} ·{' '}
                      {p.scope_value}
                    </td>
                    <td className="py-2 pr-4">
                      {p.active ? (
                        <span className="font-semibold text-red-700 dark:text-red-300">
                          ACTIVE
                        </span>
                      ) : (
                        <span className="text-muted-foreground">off</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {formatWhen(p.updated_at)}
                    </td>
                    <td className="py-2">
                      <form action={setRegionProtocolAction}>
                        <input type="hidden" name="protocol" value={p.protocol} />
                        <input type="hidden" name="scope_type" value={p.scope_type} />
                        <input type="hidden" name="scope_value" value={p.scope_value} />
                        <input
                          type="hidden"
                          name="active"
                          value={p.active ? 'off' : 'on'}
                        />
                        <button
                          type="submit"
                          className="rounded-md border border-input bg-background px-3 py-1 text-xs font-medium hover:bg-muted"
                        >
                          {p.active ? 'Stand down' : 'Reactivate'}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Superadmin-only: manage who the diocese coordinators are. */}
      {isSuperadmin && (
        <section className="mb-8 rounded-2xl border border-border bg-card p-6">
          <h3 className="text-xl font-semibold">Diocese coordinators</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Coordinators can turn protocols on and off for their own diocese only.
          </p>
          <form
            action={addDioceseCoordinatorAction}
            className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            <label className="text-sm text-foreground">
              Clerk user ID
              <input
                name="clerk_user_id"
                required
                placeholder="user_…"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
              />
            </label>
            <label className="text-sm text-foreground">
              Email
              <input
                name="email"
                type="email"
                required
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
              />
            </label>
            <label className="text-sm text-foreground">
              Display name
              <input
                name="display_name"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
              />
            </label>
            <label className="text-sm text-foreground">
              Diocese
              <input
                name="diocese"
                required
                list="diocese-options"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
              />
              <datalist id="diocese-options">
                {dioceses.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </label>
            <div className="sm:col-span-2 xl:col-span-4">
              <button
                type="submit"
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                Add coordinator
              </button>
            </div>
          </form>

          {coordinators.length > 0 && (
            <ul className="mt-6 space-y-2">
              {coordinators.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-4 py-2 text-sm"
                >
                  <div>
                    <span className="font-medium">{c.display_name}</span>
                    <span className="ml-2 text-muted-foreground">{c.email}</span>
                    <span className="ml-2">· {c.diocese}</span>
                    {!c.is_active && (
                      <span className="ml-2 text-muted-foreground">(inactive)</span>
                    )}
                  </div>
                  <form action={setDioceseCoordinatorActiveAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <input
                      type="hidden"
                      name="active"
                      value={c.is_active ? 'off' : 'on'}
                    />
                    <button
                      type="submit"
                      className="rounded-md border border-input bg-background px-3 py-1 text-xs font-medium hover:bg-muted"
                    >
                      {c.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
