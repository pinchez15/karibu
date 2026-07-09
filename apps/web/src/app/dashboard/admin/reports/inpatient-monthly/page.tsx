import { getStaff, hasDataReportsAccess } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InpatientMonthlyClient } from './InpatientMonthlyClient'
import { getInpatientMonthlySummary } from './actions'

function defaultMonth(): { year: number; month: number } {
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return { year: prev.getFullYear(), month: prev.getMonth() + 1 }
}

export default async function InpatientMonthlyReportPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')
  if (!(await hasDataReportsAccess())) redirect('/dashboard')

  const { year, month } = defaultMonth()
  const initial = await getInpatientMonthlySummary(year, month)

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
        <h2 className="text-2xl font-bold">Inpatient monthly summary</h2>
        <p className="text-muted-foreground mt-1">
          Admissions, discharge outcomes, deliveries, and bed-days by month.
          HMIS 108 alignment pending verification with the diocese HMIS focal
          person — treat row labels as provisional until then.
        </p>
      </div>

      <InpatientMonthlyClient initialSummary={initial.error ? null : initial.data} />
    </div>
  )
}
