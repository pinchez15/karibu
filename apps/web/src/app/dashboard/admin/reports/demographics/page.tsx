import { getStaff, isAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Demographics report (S-REPORTS). Runs on FINALIZED visits only (status
// sent/completed, per F3) — draft data is excluded. Age/sex/geography of
// patients seen this month.
type PatientBits = {
  sex: 'M' | 'F' | null
  date_of_birth: string | null
  birth_year: number | null
  approximate_age: number | null
  village: string | null
}

function ageYears(p: PatientBits): number | null {
  if (p.date_of_birth) {
    const ms = Date.now() - Date.parse(p.date_of_birth)
    if (!Number.isNaN(ms)) return Math.floor(ms / (365.25 * 24 * 60 * 60 * 1000))
  }
  if (p.birth_year) return new Date().getFullYear() - p.birth_year
  if (p.approximate_age != null) return p.approximate_age
  return null
}

function ageBand(age: number | null): string {
  if (age == null) return 'Unknown'
  if (age < 1) return '<1y'
  if (age < 5) return '1–4y'
  if (age < 15) return '5–14y'
  if (age < 50) return '15–49y'
  return '50y+'
}

const AGE_ORDER = ['<1y', '1–4y', '5–14y', '15–49y', '50y+', 'Unknown']

export default async function DemographicsReportPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')
  if (!(await isAdmin())) redirect('/dashboard')

  const supabase = createServiceClient()
  const now = new Date()
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const to = now.toISOString().slice(0, 10)

  const { data } = await supabase
    .from('visits')
    .select('patient:patients(sex, date_of_birth, birth_year, approximate_age, village)')
    .eq('clinic_id', staff.clinic_id)
    .gte('visit_date', from)
    .lte('visit_date', to)
    .in('status', ['sent', 'completed'])

  const rows = (data ?? []).map((v) => (Array.isArray(v.patient) ? v.patient[0] : v.patient) as PatientBits | null)
  const visits = rows.length

  const sex = { M: 0, F: 0, Unknown: 0 }
  const bands: Record<string, number> = {}
  const villages: Record<string, number> = {}
  for (const p of rows) {
    if (!p) continue
    sex[p.sex === 'M' ? 'M' : p.sex === 'F' ? 'F' : 'Unknown'] += 1
    const b = ageBand(ageYears(p))
    bands[b] = (bands[b] ?? 0) + 1
    const v = (p.village || '').trim() || 'Unknown'
    villages[v] = (villages[v] ?? 0) + 1
  }
  const topVillages = Object.entries(villages).sort((a, b) => b[1] - a[1]).slice(0, 10)
  const pct = (n: number) => (visits ? Math.round((n / visits) * 100) : 0)

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
        <h2 className="text-2xl font-bold">Demographics</h2>
        <p className="text-muted-foreground mt-1">
          Age, sex, and geography of finalized visits this month ({visits} visits).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="font-semibold">Sex</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {(['F', 'M', 'Unknown'] as const).map((k) => (
              <li key={k} className="flex justify-between">
                <span>{k === 'Unknown' ? 'Not recorded' : k === 'F' ? 'Female' : 'Male'}</span>
                <span className="text-muted-foreground">{sex[k]} ({pct(sex[k])}%)</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="font-semibold">Age bands</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {AGE_ORDER.filter((b) => bands[b]).map((b) => (
              <li key={b} className="flex justify-between">
                <span>{b}</span>
                <span className="text-muted-foreground">{bands[b]} ({pct(bands[b])}%)</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="font-semibold">Top villages</h3>
        {topVillages.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No geography recorded.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {topVillages.map(([v, n]) => (
              <li key={v} className="flex justify-between">
                <span>{v}</span>
                <span className="text-muted-foreground">{n} ({pct(n)}%)</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Finalized visits only (signed notes) — draft data is excluded, consistent with HMIS 105.
      </p>
    </div>
  )
}
