import { getStaff, hasDataReportsAccess } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createServiceClient } from '@/lib/supabase'
import { Hmis106aClient } from '../hmis106a/Hmis106aClient'
import { PrintLandscapeButton } from '../hmis105/PrintLandscapeButton'

export default async function Hmis106aTbPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')

  const hasAccess = await hasDataReportsAccess()
  if (!hasAccess) redirect('/dashboard')

  const supabase = createServiceClient()
  const { data: clinic } = await supabase
    .from('clinics')
    .select('name')
    .eq('id', staff.clinic_id)
    .single()

  return (
    <div className="p-4 space-y-6">
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
        <h2 className="text-2xl font-bold">HMIS 106a — TB/Leprosy Quarterly</h2>
        <p className="text-muted-foreground mt-1">
          DHIS2 dataset 106a:03 · case-finding, outcomes, and TPT
        </p>
      </div>

      <Hmis106aClient
        reportType="tb"
        staffClinicId={staff.clinic_id}
        clinicName={clinic?.name ?? 'Clinic'}
      />
    </div>
  )
}
