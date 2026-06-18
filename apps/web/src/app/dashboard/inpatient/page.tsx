import { redirect } from 'next/navigation'
import { getStaff } from '@/lib/auth'
import { WebTopBar } from '@/components/web-shell'

// Inpatient unit landing (HC III admissions). The admissions ward list + admit
// flow are Android-first (rpc_admit_patient, InpatientHomeScreen); the web view
// is a read surface for now.
const CLINICAL = new Set(['admin', 'doctor', 'nurse', 'clinical_officer', 'midwife', 'nursing_assistant'])

export default async function InpatientPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')
  if (!CLINICAL.has(staff.role)) redirect('/dashboard')

  return (
    <>
      <WebTopBar title="Inpatient" subtitle="ADMISSIONS" />
      <div className="p-6 overflow-auto flex-1">
        <div className="max-w-2xl rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Admissions</h2>
          <p className="mt-2 text-sm text-body">
            Ward admissions are managed on the Android app (admit, ward round, observations).
            A web admissions board will surface active inpatients here.
          </p>
        </div>
      </div>
    </>
  )
}
