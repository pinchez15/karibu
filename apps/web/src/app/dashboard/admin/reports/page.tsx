import { getStaff, isAdmin } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default async function ReportsPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')

  const admin = await isAdmin()
  if (!admin) redirect('/dashboard')

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/dashboard/admin">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Admin
          </Button>
        </Link>
      </div>

      <div>
        <h2 className="text-2xl font-bold">Reports</h2>
        <p className="text-muted-foreground mt-1">
          Generate HMIS reports and review data quality
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link
          href="/dashboard/admin/reports/hmis105"
          className="bg-card rounded-xl p-6 border border-border hover:border-accent/40 transition-colors group"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center group-hover:bg-accent/20 transition-colors">
              <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h4 className="font-semibold">HMIS 105 Report</h4>
              <p className="text-sm text-muted-foreground">
                Monthly OPD summary report with age/sex disaggregation
              </p>
            </div>
          </div>
        </Link>

        <Link
          href="/dashboard/admin/reports/data-quality"
          className="bg-card rounded-xl p-6 border border-border hover:border-amber-500/40 transition-colors group"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-500/15 rounded-lg flex items-center justify-center group-hover:bg-amber-500/25 transition-colors">
              <svg className="w-6 h-6 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div>
              <h4 className="font-semibold">Data Quality</h4>
              <p className="text-sm text-muted-foreground">
                Find missing patient demographics and uncoded visits
              </p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  )
}
