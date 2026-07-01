import { getStaff, hasDataReportsAccess } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Outbreak Watch (S-REPORTS): flags diagnoses where this month's volume is
// >= 2x the trailing 3-month baseline. Reuses generate_hmis_105 per month, so
// counts agree with HMIS 105 / Disease Burden.
type Hmis = { display_name: string; total: number | string }

function totals(rows: Hmis[] | null): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows ?? []) m.set(r.display_name, (m.get(r.display_name) ?? 0) + Number(r.total))
  return m
}

const MIN_CASES = 3 // ignore tiny numbers — 1→2 is not an outbreak

export default async function OutbreakReportPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')
  if (!(await hasDataReportsAccess())) redirect('/dashboard')

  const supabase = createServiceClient()
  const now = new Date()
  const periods = [0, 1, 2, 3].map((offset) => {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    return { y: d.getFullYear(), m: d.getMonth() + 1 }
  })

  const results = await Promise.all(
    periods.map((p) =>
      supabase.rpc('generate_hmis_105', { p_clinic_id: staff.clinic_id, p_year: p.y, p_month: p.m }),
    ),
  )

  const current = totals(results[0].data as Hmis[] | null)
  const baselines = results.slice(1).map((r) => totals(r.data as Hmis[] | null))

  const alerts: { name: string; current: number; baseline: number; ratio: number }[] = []
  for (const [name, cur] of current) {
    if (cur < MIN_CASES) continue
    const base = baselines.reduce((s, b) => s + (b.get(name) ?? 0), 0) / baselines.length
    const ratio = base > 0 ? cur / base : cur >= MIN_CASES ? Infinity : 0
    if (ratio >= 2) alerts.push({ name, current: cur, baseline: Math.round(base * 10) / 10, ratio })
  }
  alerts.sort((a, b) => b.ratio - a.ratio)

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/dashboard/admin/reports">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Reports
          </Button>
        </Link>
      </div>
      <div>
        <h2 className="text-2xl font-bold">Outbreak Watch</h2>
        <p className="text-muted-foreground mt-1">
          Diagnoses this month at 2× or more of the trailing 3-month average.
        </p>
      </div>

      {alerts.length === 0 ? (
        <div className="rounded-xl border border-accent/30 bg-accent/10 p-6 text-center">
          <p className="font-medium text-accent">No diagnosis spikes detected</p>
          <p className="mt-1 text-sm text-accent/80">
            No diagnosis is running at 2× its 3-month baseline (min {MIN_CASES} cases).
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-soft bg-amber-soft/20 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-amber-soft px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-amber-ink" />
            <h3 className="font-semibold text-amber-ink">{alerts.length} potential spike{alerts.length === 1 ? '' : 's'}</h3>
          </div>
          <ul className="divide-y divide-amber-soft/60">
            {alerts.map((a) => (
              <li key={a.name} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="font-medium">{a.name}</span>
                <span className="text-muted-foreground">
                  {a.current} this month vs {a.baseline}/mo baseline
                  <span className="ml-2 font-semibold text-amber-ink">
                    {a.ratio === Infinity ? 'new' : `${a.ratio.toFixed(1)}×`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
