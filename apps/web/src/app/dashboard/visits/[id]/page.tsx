import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { VisitDetailClient } from './VisitDetailClient'

async function getVisitDetails(visitId: string, clinicId: string) {
  const supabase = createServiceClient()

  const { data: visit, error } = await supabase
    .from('visits')
    .select(`
      *,
      patient:patients(id, display_name, whatsapp_number, date_of_birth),
      doctor:staff!visits_doctor_id_fkey(id, display_name),
      nurse:staff!visits_nurse_id_fkey(id, display_name),
      provider_notes(*),
      patient_notes(*),
      audio_uploads(*),
      magic_links(token, expires_at, used_at)
    `)
    .eq('id', visitId)
    .eq('clinic_id', clinicId)
    .single()

  if (error || !visit) {
    return null
  }

  return visit
}

export default async function VisitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const staff = await getStaff()

  if (!staff) {
    redirect('/')
  }

  const { id } = await params
  const visit = await getVisitDetails(id, staff.clinic_id)

  if (!visit) {
    notFound()
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/dashboard/visits"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
        >
          <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Visits
        </Link>
      </div>

      <VisitDetailClient visit={visit} staffId={staff.id} />
    </div>
  )
}
