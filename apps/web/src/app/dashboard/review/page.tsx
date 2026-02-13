import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { ReviewQueueClient } from './ReviewQueueClient'

interface ReviewVisit {
  id: string
  visit_date: string
  source_language: string
  patient: { id: string; display_name: string | null; whatsapp_number: string }
  provider_notes: {
    id: string
    note_content: string | null
    transcript: string | null
    transcription_provider: string | null
    transcription_confidence: number | null
    status: string
  } | null
  patient_notes: {
    id: string
    content: string | null
    status: string
  } | null
  diagnosis: string | null
  medications: string | null
  follow_up_instructions: string | null
  tests_ordered: string | null
}

async function getReviewVisits(clinicId: string): Promise<ReviewVisit[]> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('visits')
    .select(`
      id, visit_date, source_language, diagnosis, medications, follow_up_instructions, tests_ordered,
      patient:patients(id, display_name, whatsapp_number),
      provider_notes(id, note_content, transcript, transcription_provider, transcription_confidence, status),
      patient_notes(id, content, status)
    `)
    .eq('clinic_id', clinicId)
    .eq('review_status', 'pending_review')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Failed to fetch review visits:', error)
    return []
  }

  return (data || []) as unknown as ReviewVisit[]
}

export default async function ReviewPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')

  const visits = await getReviewVisits(staff.clinic_id)

  return (
    <ReviewQueueClient
      visits={visits}
      staffId={staff.id}
    />
  )
}
