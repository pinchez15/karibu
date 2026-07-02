import { getCoordinatorScope, getStaff, hasProvisioningAccess, isAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  BarChart3,
  Boxes,
  CreditCard,
  Upload,
  Users,
} from 'lucide-react'
import { WebTopBar } from '@/components/web-shell'

async function getClinicStats(clinicId: string) {
  const supabase = createServiceClient()

  const { count: staffCount } = await supabase
    .from('staff')
    .select('*', { count: 'exact' })
    .eq('clinic_id', clinicId)
    .eq('is_active', true)

  const { count: patientCount } = await supabase
    .from('patients')
    .select('*', { count: 'exact' })
    .eq('clinic_id', clinicId)

  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)

  const { data: recentVisits } = await supabase
    .from('visits')
    .select('visit_date')
    .eq('clinic_id', clinicId)
    .gte('visit_date', weekAgo.toISOString().split('T')[0])

  const visitsByDay: Record<string, number> = {}
  for (const visit of recentVisits || []) {
    const date = visit.visit_date
    visitsByDay[date] = (visitsByDay[date] || 0) + 1
  }

  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const { data: monthVisits } = await supabase
    .from('visits')
    .select('status, doctor:staff!visits_doctor_id_fkey(display_name)')
    .eq('clinic_id', clinicId)
    .gte('visit_date', monthStart)

  const byClinician: Record<string, { total: number; unfinalized: number }> = {}
  let unfinalizedCount = 0
  for (const v of monthVisits || []) {
    const name = (v as { doctor?: { display_name?: string } | null }).doctor?.display_name ?? 'Unassigned'
    byClinician[name] = byClinician[name] || { total: 0, unfinalized: 0 }
    byClinician[name].total += 1
    const finalized = v.status === 'sent' || v.status === 'completed'
    if (!finalized) {
      byClinician[name].unfinalized += 1
      unfinalizedCount += 1
    }
  }
  const casesByClinician = Object.entries(byClinician)
    .map(([name, c]) => ({ name, ...c }))
    .sort((a, b) => b.total - a.total)

  const { data: clinic } = await supabase
    .from('clinics')
    .select('*')
    .eq('id', clinicId)
    .single()

  return {
    staffCount: staffCount || 0,
    patientCount: patientCount || 0,
    visitsByDay,
    totalWeekVisits: recentVisits?.length || 0,
    casesByClinician,
    unfinalizedCount,
    clinic,
  }
}

const QUICK_LINKS = [
  { href: '/dashboard/admin/stock-import', label: 'Stock import', icon: Upload },
  { href: '/dashboard/admin/inventory', label: 'Inventory', icon: Boxes },
  { href: '/dashboard/admin/billing', label: 'Billing rates', icon: CreditCard },
  { href: '/dashboard/admin/staff', label: 'Staff', icon: Users },
  { href: '/dashboard/admin/reports', label: 'HMIS reports', icon: BarChart3 },
] as const

export default async function AdminPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')
  if (!(await isAdmin())) redirect('/dashboard')

  const stats = await getClinicStats(staff.clinic_id)
  const provisioningAccess = await hasProvisioningAccess()
  const coordinatorScope = await getCoordinatorScope()
  const outbreakAccess = coordinatorScope === 'all' || coordinatorScope.length > 0

  const days: { date: string; label: string; count: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().split('T')[0]
    days.push({
      date: dateStr,
      label: d.toLocaleDateString('en-US', { weekday: 'short' }),
      count: stats.visitsByDay[dateStr] || 0,
    })
  }
  const maxCount = Math.max(...days.map((d) => d.count), 1)

  return (
    <>
      <WebTopBar
        title="Admin"
        subtitle="CLINIC SETTINGS"
        actions={
          (provisioningAccess || outbreakAccess) ? (
            <div className="flex flex-wrap gap-2">
              {provisioningAccess && (
                <Link
                  href="/dashboard/superadmin"
                  className="inline-flex items-center rounded-lg border border-cobalt/30 bg-cobalt-soft px-3 py-1.5 text-sm font-medium text-cobalt hover:bg-cobalt-soft/80"
                >
                  New clinic setup
                </Link>
              )}
              {outbreakAccess && (
                <Link
                  href="/dashboard/outbreaks"
                  className="inline-flex items-center rounded-lg border border-red-500/40 bg-red-500/5 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-500/10 dark:text-red-300"
                >
                  Outbreaks
                </Link>
              )}
            </div>
          ) : undefined
        }
      />

      <div className="mx-auto max-w-6xl flex-1 space-y-6 overflow-auto px-6 py-8">
        <div className="flex flex-wrap gap-3">
          {QUICK_LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold transition-colors hover:border-cobalt/50 hover:bg-cobalt-soft/40"
            >
              <Icon className="h-4 w-4 shrink-0 text-cobalt" />
              {label}
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap items-stretch gap-4">
          <div className="flex min-w-[240px] flex-1 flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border border-border bg-card px-5 py-4">
            <span className="text-lg font-semibold">{stats.clinic?.name || '—'}</span>
            <span className="text-sm text-muted-foreground">{stats.clinic?.timezone || '—'}</span>
            {stats.clinic?.district && (
              <span className="text-sm text-muted-foreground">{stats.clinic.district}</span>
            )}
          </div>
          <StatCard label="Staff" value={stats.staffCount} href="/dashboard/admin/staff" />
          <StatCard label="Patients" value={stats.patientCount} />
          <StatCard
            label="Visits (7 days)"
            value={stats.totalWeekVisits}
            hint={`~${Math.round(stats.totalWeekVisits / 7)}/day`}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-card px-5 py-4">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Visits per day (last 7 days)
            </h3>
            <div className="flex h-28 items-end justify-between gap-2">
              {days.map((day) => (
                <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center">
                  <div className="flex h-20 w-full items-end justify-center">
                    <div
                      className="w-full max-w-8 rounded-t bg-cobalt"
                      style={{
                        height: `${(day.count / maxCount) * 100}%`,
                        minHeight: day.count > 0 ? 4 : 0,
                      }}
                    />
                  </div>
                  <p className="mt-2 truncate text-xs text-muted-foreground">{day.label}</p>
                  <p className="text-sm font-medium">{day.count}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card px-5 py-4">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Cases by clinician (this month)
              </h3>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  stats.unfinalizedCount > 0
                    ? 'bg-amber-soft text-amber-ink'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {stats.unfinalizedCount} open
              </span>
            </div>
            {stats.casesByClinician.length === 0 ? (
              <p className="text-sm text-muted-foreground">No visits this month.</p>
            ) : (
              <ul className="max-h-40 divide-y divide-line-soft overflow-y-auto">
                {stats.casesByClinician.map((c) => (
                  <li key={c.name} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="truncate font-medium">{c.name}</span>
                    <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
                      <span>{c.total}</span>
                      {c.unfinalized > 0 && (
                        <span className="font-medium text-amber-ink">{c.unfinalized} open</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function StatCard({
  label,
  value,
  hint,
  href,
}: {
  label: string
  value: number
  hint?: string
  href?: string
}) {
  const inner = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </>
  )

  const className =
    'min-w-[7rem] shrink-0 rounded-xl border border-border bg-card px-4 py-3'

  if (href) {
    return (
      <Link href={href} className={`${className} block transition-colors hover:border-cobalt/40`}>
        {inner}
      </Link>
    )
  }

  return <div className={className}>{inner}</div>
}
