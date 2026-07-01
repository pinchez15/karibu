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
            <div className="flex flex-wrap gap-1.5">
              {provisioningAccess && (
                <Link
                  href="/dashboard/superadmin"
                  className="inline-flex items-center rounded-md border border-cobalt/30 bg-cobalt-soft px-2.5 py-1 text-xs font-medium text-cobalt hover:bg-cobalt-soft/80"
                >
                  Provisioning
                </Link>
              )}
              {outbreakAccess && (
                <Link
                  href="/dashboard/outbreaks"
                  className="inline-flex items-center rounded-md border border-red-500/40 bg-red-500/5 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-500/10 dark:text-red-300"
                >
                  Outbreaks
                </Link>
              )}
            </div>
          ) : undefined
        }
      />

      <div className="flex-1 overflow-auto px-3 py-2 max-w-6xl space-y-2">
        {/* Primary actions — first thing on screen */}
        <div className="flex flex-wrap gap-1.5">
          {QUICK_LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-semibold hover:border-cobalt/50 hover:bg-cobalt-soft/40 transition-colors"
            >
              <Icon className="h-3.5 w-3.5 text-cobalt shrink-0" />
              {label}
            </Link>
          ))}
        </div>

        {/* Clinic strip + KPIs — one dense row */}
        <div className="flex flex-wrap items-stretch gap-2">
          <div className="flex min-w-[200px] flex-1 flex-wrap items-center gap-x-4 gap-y-0.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs">
            <span className="font-semibold text-sm">{stats.clinic?.name || '—'}</span>
            <span className="text-muted-foreground">
              {stats.clinic?.timezone || '—'}
            </span>
            {stats.clinic?.district && (
              <span className="text-muted-foreground">{stats.clinic.district}</span>
            )}
          </div>
          <StatCard label="Staff" value={stats.staffCount} href="/dashboard/admin/staff" />
          <StatCard label="Patients" value={stats.patientCount} />
          <StatCard
            label="Visits 7d"
            value={stats.totalWeekVisits}
            hint={`~${Math.round(stats.totalWeekVisits / 7)}/d`}
          />
        </div>

        {/* Analytics — compact, side by side on md+ */}
        <div className="grid gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-border bg-card px-3 py-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
              Visits / day (7d)
            </h3>
            <div className="flex items-end justify-between gap-1 h-14">
              {days.map((day) => (
                <div key={day.date} className="flex flex-1 flex-col items-center min-w-0">
                  <div className="flex w-full h-10 items-end justify-center">
                    <div
                      className="w-full max-w-[22px] bg-cobalt rounded-t"
                      style={{
                        height: `${(day.count / maxCount) * 100}%`,
                        minHeight: day.count > 0 ? 2 : 0,
                      }}
                    />
                  </div>
                  <p className="text-[9px] text-muted-foreground mt-0.5 truncate w-full text-center">
                    {day.label}
                  </p>
                  <p className="text-[11px] font-medium leading-none">{day.count}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card px-3 py-2">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Cases by clinician (month)
              </h3>
              <span
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${
                  stats.unfinalizedCount > 0 ? 'bg-amber-soft text-amber-ink' : 'bg-muted text-muted-foreground'
                }`}
              >
                {stats.unfinalizedCount} open
              </span>
            </div>
            {stats.casesByClinician.length === 0 ? (
              <p className="text-xs text-muted-foreground">No visits this month.</p>
            ) : (
              <ul className="divide-y divide-line-soft max-h-[4.5rem] overflow-y-auto">
                {stats.casesByClinician.map((c) => (
                  <li key={c.name} className="flex items-center justify-between gap-2 py-1 text-xs">
                    <span className="font-medium truncate">{c.name}</span>
                    <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
                      <span>{c.total}</span>
                      {c.unfinalized > 0 && (
                        <span className="text-amber-ink font-medium">{c.unfinalized} open</span>
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
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground leading-none">
        {label}
      </p>
      <p className="text-lg font-semibold leading-tight mt-0.5">{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground leading-none">{hint}</p>}
    </>
  )

  const className =
    'rounded-lg border border-border bg-card px-2.5 py-1.5 min-w-[4.5rem] shrink-0'

  if (href) {
    return (
      <Link href={href} className={`${className} hover:border-cobalt/40 transition-colors block`}>
        {inner}
      </Link>
    )
  }

  return <div className={className}>{inner}</div>
}
