import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { getStaff } from '@/lib/auth'
import { WebTopBar } from '@/components/web-shell'
import { AncRegistryClient } from './AncRegistryClient'
import { loadActivePregnancies } from './actions'

const CLINICAL = new Set(['admin', 'doctor', 'nurse', 'clinical_officer', 'midwife', 'nursing_assistant'])

export default async function AncPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')
  if (!CLINICAL.has(staff.role)) redirect('/dashboard')

  const rows = await loadActivePregnancies(staff.clinic_id)

  return (
    <>
      <WebTopBar
        title="ANC"
        subtitle="REGISTRY"
        actions={
          <Link
            href="/dashboard/anc/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-cobalt px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-cobalt/90"
          >
            <Plus className="h-4 w-4" />
            Register
          </Link>
        }
      />
      <AncRegistryClient rows={rows} />
    </>
  )
}
