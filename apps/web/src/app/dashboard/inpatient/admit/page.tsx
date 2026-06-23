import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getStaff } from '@/lib/auth'
import { WebTopBar } from '@/components/web-shell'
import { AdmitPatientForm } from '@/components/inpatient/AdmitPatientForm'

const CLINICAL = new Set(['admin', 'doctor', 'nurse', 'clinical_officer', 'midwife', 'nursing_assistant'])

export default async function AdmitPatientPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')
  if (!CLINICAL.has(staff.role)) redirect('/dashboard')

  return (
    <>
      <WebTopBar
        title="Admit patient"
        subtitle="INPATIENT"
        actions={
          <Link
            href="/dashboard/inpatient"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-[13px] font-medium text-body hover:bg-background"
          >
            <ArrowLeft className="h-4 w-4" />
            Ward
          </Link>
        }
      />
      <div className="p-6 overflow-auto flex-1">
        <AdmitPatientForm />
      </div>
    </>
  )
}
