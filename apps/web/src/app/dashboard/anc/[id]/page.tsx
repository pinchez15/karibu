import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getStaff } from '@/lib/auth'
import { WebTopBar } from '@/components/web-shell'
import { PregnancyDetailClient } from './PregnancyDetailClient'
import { loadPregnancyContacts, loadPregnancyDetail } from '../actions'

const CLINICAL = new Set(['admin', 'doctor', 'nurse', 'clinical_officer', 'midwife', 'nursing_assistant'])

export default async function PregnancyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const staff = await getStaff()
  if (!staff) redirect('/')
  if (!CLINICAL.has(staff.role)) redirect('/dashboard')

  const pregnancy = await loadPregnancyDetail(id, staff.clinic_id)
  if (!pregnancy) notFound()

  const contacts = await loadPregnancyContacts(id)

  return (
    <>
      <WebTopBar
        title={pregnancy.patient_name ?? 'Pregnancy'}
        subtitle="ANC"
        actions={
          <Link
            href="/dashboard/anc"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-[13px] font-medium text-body hover:bg-background"
          >
            <ArrowLeft className="h-4 w-4" />
            Registry
          </Link>
        }
      />
      <PregnancyDetailClient pregnancy={pregnancy} contacts={contacts} />
    </>
  )
}
