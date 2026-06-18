import { getStaff, isAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Disease Burden report (S-REPORTS): top diagnoses this month, ranked by volume.
// Reuses generate_hmis_105 — same finalized-visit + confirmed-code aggregation
// the HMIS report uses, so the two always agree.
export default async function DiseaseBurdenReportPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')
  if (!(await isAdmin())) redirect('/dashboard')

  const supabase = createServiceClient()
  const now = new Date()
  const { data } = await supabase.rpc('generate_hmis_105', {
    p_clinic_id: staff.clinic_id,
    p_year: now.getFullYear(),
    p_month: now.getMonth() + 1,
  })

  const rows = ((data ?? []) as Array<{ display_name: string; total: number | string }>)
    .map((r) => ({ name: r.display_name, total: Number(r.total) }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)

  const max = rows.length ? rows[0].total : 0
  const grandTotal = rows.reduce((s, r) => s + r.total, 0)

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
        <h2 className="text-2xl font-bold">Disease Burden</h2>
        <p className="text-muted-foreground mt-1">
          Top diagnoses this month by volume ({grandTotal} coded cases).
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No coded diagnoses this month yet. Confirm diagnosis codes on finalized visits to populate.
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.name} className="text-sm">
                <div className="flex justify-between">
                  <span>{r.name}</span>
                  <span className="text-muted-foreground">{r.total}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-muted">
                  <div
                    className="h-1.5 rounded-full bg-cobalt"
                    style={{ width: `${max ? Math.round((r.total / max) * 100) : 0}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Same source as HMIS 105 — finalized visits with confirmed diagnosis codes.
      </p>
    </div>
  )
}
