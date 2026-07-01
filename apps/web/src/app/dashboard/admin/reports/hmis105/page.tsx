import { getStaff, hasDataReportsAccess } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Hmis105Client } from './Hmis105Client'
import { FinalizeList } from './FinalizeList'
import { PrintLandscapeButton } from './PrintLandscapeButton'
import { fetchAllClinics } from '../actions'
import { fetchUnfinalizedVisits, monthToDateRange } from '@/lib/review-notes'

export default async function Hmis105Page() {
  const staff = await getStaff()
  if (!staff) redirect('/')

  if (!(await hasDataReportsAccess())) redirect('/dashboard')

  const { from, to } = monthToDateRange()
  const [{ data: clinics }, unfinalized] = await Promise.all([
    fetchAllClinics(),
    fetchUnfinalizedVisits(staff.clinic_id, from, to),
  ])

  return (
    <div className="p-4 space-y-6">
      {/* Landscape, chrome-hidden print for the data tech's 1:1 hand-entry. */}
      <style>{`@media print { @page { size: A4 landscape; margin: 8mm; } }`}</style>

      <div className="no-print flex items-center justify-between gap-2">
        <Link href="/dashboard/admin/reports">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Reports
          </Button>
        </Link>
        <PrintLandscapeButton />
      </div>

      <div className="no-print">
        <h2 className="text-2xl font-bold">HMIS 105 Report</h2>
        <p className="text-muted-foreground mt-1">
          Monthly outpatient department summary with age/sex disaggregation
        </p>
      </div>

      <FinalizeList rows={unfinalized} />

      <Hmis105Client clinics={clinics || []} staffClinicId={staff.clinic_id} />
    </div>
  )
}
