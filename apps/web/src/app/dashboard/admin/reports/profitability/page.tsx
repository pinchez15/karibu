import { getStaff, hasDataReportsAccess } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Clinic Profitability report (S-REPORTS / request B). Revenue, charged,
// outstanding from rpc_clinic_cashflow + charges broken out by service line.
function ugx(n: number): string {
  return `UGX ${Math.round(n).toLocaleString('en-US')}`
}

export default async function ProfitabilityReportPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')
  if (!(await hasDataReportsAccess())) redirect('/dashboard')

  const supabase = createServiceClient()
  const now = new Date()
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const to = now.toISOString().slice(0, 10)

  const [{ data: cashRows }, { data: charges }] = await Promise.all([
    supabase.rpc('rpc_clinic_cashflow', { p_clinic_id: staff.clinic_id, p_from: from, p_to: to }),
    supabase
      .from('charges')
      .select('category, amount_ugx')
      .eq('clinic_id', staff.clinic_id)
      .eq('voided', false)
      .gte('created_at', from),
  ])

  const cash = (Array.isArray(cashRows) ? cashRows[0] : cashRows) as
    | { revenue: number; charged: number; outstanding: number }
    | undefined
  const revenue = Number(cash?.revenue ?? 0)
  const charged = Number(cash?.charged ?? 0)
  const outstanding = Math.max(0, Number(cash?.outstanding ?? 0))

  const byCategory: Record<string, number> = {}
  for (const c of charges ?? []) {
    const k = (c.category as string | null) || 'other'
    byCategory[k] = (byCategory[k] ?? 0) + Number(c.amount_ugx)
  }
  const categories = Object.entries(byCategory).sort((a, b) => b[1] - a[1])

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
        <h2 className="text-2xl font-bold">Clinic Profitability</h2>
        <p className="text-muted-foreground mt-1">Revenue and cashflow this month.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi label="Revenue (paid)" value={ugx(revenue)} />
        <Kpi label="Charged" value={ugx(charged)} />
        <Kpi label="Outstanding" value={ugx(outstanding)} warn={outstanding > 0} />
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="font-semibold">Charges by service line</h3>
        {categories.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No charges recorded this month.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {categories.map(([cat, amt]) => (
              <li key={cat} className="flex justify-between">
                <span className="capitalize">{cat}</span>
                <span className="text-muted-foreground">{ugx(amt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Kpi({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="kh-meta">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${warn ? 'text-amber-ink' : ''}`}>{value}</div>
    </div>
  )
}
