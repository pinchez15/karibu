import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getStaff } from '@/lib/auth'
import { WebTopBar } from '@/components/web-shell'
import { WardCensusClient } from '@/components/inpatient/WardCensusClient'
import { loadActiveAdmissions } from './actions'
import { Plus } from 'lucide-react'

const CLINICAL = new Set(['admin', 'doctor', 'nurse', 'clinical_officer', 'midwife', 'nursing_assistant'])

export default async function InpatientPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')
  if (!CLINICAL.has(staff.role)) redirect('/dashboard')

  const rows = await loadActiveAdmissions(staff.clinic_id)

  return (
    <>
      <WebTopBar
        title="Ward"
        subtitle="ADMISSIONS"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/dashboard/inpatient/handover"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3.5 py-2 text-[13px] font-medium text-body hover:bg-background"
            >
              Handover
            </Link>
            <Link
              href="/dashboard/inpatient/admit"
              className="inline-flex items-center gap-1.5 rounded-md bg-cobalt px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-cobalt/90"
            >
              <Plus className="h-4 w-4" />
              Admit
            </Link>
          </div>
        }
      />
      <WardCensusClient rows={rows} />
    </>
  )
}
