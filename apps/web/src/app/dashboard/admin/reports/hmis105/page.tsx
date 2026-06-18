import { getStaff, isAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Hmis105Client } from './Hmis105Client'
import { FinalizeList, type UnfinalizedRow } from './FinalizeList'
import { PrintLandscapeButton } from './PrintLandscapeButton'
import { fetchAllClinics } from '../actions'

async function getUnfinalized(clinicId: string): Promise<UnfinalizedRow[]> {
  const supabase = createServiceClient()
  const now = new Date()
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const to = now.toISOString().slice(0, 10)
  const { data, error } = await supabase.rpc('rpc_unfinalized_visits', {
    p_clinic_id: clinicId,
    p_from: from,
    p_to: to,
  })
  if (error) {
    console.error('hmis105: unfinalized', error)
    return []
  }
  return (data ?? []) as UnfinalizedRow[]
}

export default async function Hmis105Page() {
  const staff = await getStaff()
  if (!staff) redirect('/')

  const admin = await isAdmin()
  if (!admin) redirect('/dashboard')

  const [{ data: clinics }, unfinalized] = await Promise.all([
    fetchAllClinics(),
    getUnfinalized(staff.clinic_id),
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
