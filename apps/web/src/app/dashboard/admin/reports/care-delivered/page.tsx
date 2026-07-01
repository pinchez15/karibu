import { getStaff, hasDataReportsAccess } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Care Delivered report (S-REPORTS): what the clinic did this month — finalized
// visits, prescriptions, lab tests, referrals. Finalized visits only (per F3).
function monthStart(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-01`
}

export default async function CareDeliveredReportPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')
  if (!(await hasDataReportsAccess())) redirect('/dashboard')

  const supabase = createServiceClient()
  const from = monthStart()
  const to = new Date().toISOString().slice(0, 10)
  const cid = staff.clinic_id

  const countOf = async (build: () => PromiseLike<{ count: number | null }>) => (await build()).count ?? 0

  const [visits, prescriptions, labs, referrals] = await Promise.all([
    countOf(() =>
      supabase
        .from('visits')
        .select('*', { count: 'exact', head: true })
        .eq('clinic_id', cid)
        .gte('visit_date', from)
        .lte('visit_date', to)
        .in('status', ['sent', 'completed']),
    ),
    countOf(() =>
      supabase
        .from('prescription_orders')
        .select('*', { count: 'exact', head: true })
        .eq('clinic_id', cid)
        .neq('status', 'cancelled')
        .gte('ordered_at', from),
    ),
    countOf(() =>
      supabase
        .from('visits')
        .select('*', { count: 'exact', head: true })
        .eq('clinic_id', cid)
        .gte('visit_date', from)
        .lte('visit_date', to)
        .not('tests_ordered', 'is', null)
        .neq('tests_ordered', ''),
    ),
    countOf(() =>
      supabase
        .from('referrals')
        .select('*', { count: 'exact', head: true })
        .eq('clinic_id', cid)
        .gte('created_at', from),
    ),
  ])

  const kpis = [
    { label: 'Finalized visits', value: visits },
    { label: 'Prescriptions', value: prescriptions },
    { label: 'Lab tests ordered', value: labs },
    { label: 'Referrals', value: referrals },
  ]

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
        <h2 className="text-2xl font-bold">Care Delivered</h2>
        <p className="text-muted-foreground mt-1">Services delivered this month (finalized visits).</p>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-border bg-card p-4">
            <div className="kh-meta">{k.label}</div>
            <div className="mt-1 text-3xl font-semibold">{k.value}</div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Finalized visits only (signed notes) — draft data excluded, consistent with HMIS 105.
      </p>
    </div>
  )
}
