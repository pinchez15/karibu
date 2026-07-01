import { getStaff, hasDataReportsAccess } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

// 30-day Readmission report (S-REPORTS): patients with a return visit within 30
// days of a prior visit. Computed over a 60-day window so this-month returns
// that reference a late-last-month index visit are caught.
type VisitRow = {
  patient_id: string
  visit_date: string
  patient: { display_name: string | null; first_name: string | null; last_name: string | null } | null
}

type Readmission = { patientId: string; name: string; gapDays: number; indexDate: string; returnDate: string }

function name(p: VisitRow['patient']): string {
  if (!p) return 'Unknown patient'
  return p.display_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown patient'
}

export default async function ReadmissionReportPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')
  if (!(await hasDataReportsAccess())) redirect('/dashboard')

  const supabase = createServiceClient()
  const since = new Date()
  since.setDate(since.getDate() - 60)
  const from = since.toISOString().slice(0, 10)

  const { data } = await supabase
    .from('visits')
    .select('patient_id, visit_date, patient:patients(display_name, first_name, last_name)')
    .eq('clinic_id', staff.clinic_id)
    .gte('visit_date', from)
    .in('status', ['sent', 'completed'])
    .order('patient_id', { ascending: true })
    .order('visit_date', { ascending: true })

  const rows = (data ?? []).map((v) => ({
    patient_id: v.patient_id as string,
    visit_date: v.visit_date as string,
    patient: (Array.isArray(v.patient) ? v.patient[0] : v.patient) as VisitRow['patient'],
  }))

  // Group consecutive same-patient visits; flag any pair ≤30 days apart.
  const readmissions: Readmission[] = []
  const byPatient = new Map<string, VisitRow[]>()
  for (const r of rows) {
    const list = byPatient.get(r.patient_id) ?? []
    list.push(r)
    byPatient.set(r.patient_id, list)
  }
  for (const [pid, list] of byPatient) {
    for (let i = 1; i < list.length; i++) {
      const gap = Math.round(
        (Date.parse(list[i].visit_date) - Date.parse(list[i - 1].visit_date)) / (24 * 60 * 60 * 1000),
      )
      if (gap > 0 && gap <= 30) {
        readmissions.push({
          patientId: pid,
          name: name(list[i].patient),
          gapDays: gap,
          indexDate: list[i - 1].visit_date,
          returnDate: list[i].visit_date,
        })
      }
    }
  }
  readmissions.sort((a, b) => (a.returnDate < b.returnDate ? 1 : -1))
  const uniquePatients = new Set(readmissions.map((r) => r.patientId)).size

  const fmt = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })

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
        <h2 className="text-2xl font-bold">30-day Readmission</h2>
        <p className="text-muted-foreground mt-1">Return visits within 30 days (last 60 days).</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Kpi label="Readmissions" value={String(readmissions.length)} />
        <Kpi label="Patients" value={String(uniquePatients)} />
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {readmissions.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No 30-day readmissions in this window.</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {readmissions.map((r, i) => (
              <li key={`${r.patientId}-${i}`}>
                <Link
                  href={`/dashboard/patients/${r.patientId}`}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px] hover:bg-secondary/40"
                >
                  <span className="font-medium">{r.name}</span>
                  <span className="text-muted-foreground">
                    {fmt(r.indexDate)} → {fmt(r.returnDate)} · {r.gapDays}d
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="kh-meta">{label}</div>
      <div className="mt-1 text-3xl font-semibold">{value}</div>
    </div>
  )
}
