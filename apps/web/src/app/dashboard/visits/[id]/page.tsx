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
      patient_notes(*)
    `)
    .eq('id', visitId)
    .eq('clinic_id', clinicId)
    .single()

  if (error || !visit) {
    return null
  }

  // patient_notes can return either a singular object (legacy single-row
  // schema) or an array (post-migration 032 with one row per source). Split
  // into clinician + AI versions so the UI doesn't have to.
  const rawNotes = visit.patient_notes as unknown
  const notesArr = Array.isArray(rawNotes)
    ? (rawNotes as Array<{ source?: string; content?: string | null } & Record<string, unknown>>)
    : rawNotes
      ? [(rawNotes as { source?: string; content?: string | null } & Record<string, unknown>)]
      : []

  const clinicianNote = notesArr.find((n) => n.source === 'clinician_fallback') ?? null
  const aiNote = notesArr.find((n) => n.source === 'ai_generated') ?? null

  // AI review suggestions — load any unanswered questions for this visit
  // along with citation metadata so the banner can deep-link to /library.
  const { data: suggestionRows } = await supabase
    .from('ai_review_suggestions')
    .select(
      'id, suggestion_type, question, reasoning, citation_ids, confidence, clinician_response',
    )
    .eq('visit_id', visitId)
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: true })

  const allCitationIds = Array.from(
    new Set(
      (suggestionRows ?? []).flatMap((s) => (s.citation_ids as number[] | null) ?? []),
    ),
  )
  let citationsById = new Map<
    number,
    {
      id: number
      document_title: string
      document_slug: string
      section: string | null
      section_anchor: string | null
    }
  >()
  if (allCitationIds.length > 0) {
    const { data: chunks } = await supabase
      .from('medical_corpus')
      .select('id, section, section_anchor, document:medical_documents(slug, title)')
      .in('id', allCitationIds)
    for (const c of chunks ?? []) {
      const doc = (c as unknown as { document?: { slug?: string; title?: string } }).document
      citationsById.set((c as { id: number }).id, {
        id: (c as { id: number }).id,
        document_title: doc?.title ?? 'Reference',
        document_slug: doc?.slug ?? '',
        section: (c as { section?: string | null }).section ?? null,
        section_anchor: (c as { section_anchor?: string | null }).section_anchor ?? null,
      })
    }
  }

  const ai_review_suggestions = (suggestionRows ?? []).map((s) => ({
    id: s.id as string,
    suggestion_type: s.suggestion_type as string,
    question: s.question as string,
    reasoning: s.reasoning as string,
    citation_ids: ((s.citation_ids as number[] | null) ?? []),
    confidence: s.confidence as 'high' | 'medium' | 'low',
    clinician_response: s.clinician_response as
      | 'considered_proceeded'
      | 'reopened_note'
      | 'dismissed'
      | null,
    citations: ((s.citation_ids as number[] | null) ?? [])
      .map((id) => citationsById.get(id))
      .filter((c): c is NonNullable<typeof c> => c !== undefined),
  }))

  return {
    ...visit,
    patient_notes_clinician: clinicianNote,
    patient_notes_ai: aiNote,
    ai_review_suggestions,
  }
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

  // Fetch payment for this visit
  const supabase = createServiceClient()
  const { data: payment } = await supabase
    .from('payments')
    .select('*, collector:staff!payments_collected_by_fkey(display_name)')
    .eq('visit_id', id)
    .maybeSingle()

  return (
    <div>
      <div className="px-4 pt-4">
        <Link
          href="/dashboard/visits"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Patients
        </Link>
      </div>

      <VisitDetailClient visit={visit} staffId={staff.id} payment={payment} />
    </div>
  )
}
