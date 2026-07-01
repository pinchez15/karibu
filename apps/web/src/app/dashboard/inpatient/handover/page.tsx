import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getStaff } from '@/lib/auth'
import { WebTopBar } from '@/components/web-shell'
import { WardHandoverClient } from '@/components/inpatient/WardHandoverClient'
import { loadActiveAdmissions } from '../actions'

const CLINICAL = new Set(['admin', 'doctor', 'nurse', 'clinical_officer', 'midwife', 'nursing_assistant'])

export default async function WardHandoverPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')
  if (!CLINICAL.has(staff.role)) redirect('/dashboard')

  const rows = await loadActiveAdmissions(staff.clinic_id)

  return (
    <>
      <WebTopBar
        title="Handover"
        subtitle="WARD CENSUS"
        actions={
          <Link
            href="/dashboard/inpatient"
            className="text-sm text-cobalt hover:underline"
          >
            Back to ward
          </Link>
        }
      />
      <WardHandoverClient rows={rows} />
    </>
  )
}
