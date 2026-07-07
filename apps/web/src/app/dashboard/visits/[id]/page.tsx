import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { getClinicPrescribingCatalog } from '@/lib/clinic-catalog'
import { loadVisitAiReviewSuggestions } from '@/lib/visit-ai-suggestions'
import { measureServerLoader, PERF_LOADER } from '@/lib/server-timing'
import { loadPrescriptionOrdersForVisit } from '@/app/dashboard/pharmacy/actions'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { WebTopBar } from '@/components/web-shell'
import { patientDisplayName } from '@/lib/referral-summary'
import { VisitDetailClient } from './VisitDetailClient'

async function getVisitDetails(visitId: string, clinicId: string) {
  return measureServerLoader(PERF_LOADER.visitDetails, () =>
    getVisitDetailsImpl(visitId, clinicId),
  )
}

async function getVisitDetailsImpl(visitId: string, clinicId: string) {
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
  const docComplete = !!(visit as { documentation_complete?: boolean }).documentation_complete

  const ai_review_suggestions = await loadVisitAiReviewSuggestions(visitId, clinicId, {
    documentationComplete: docComplete,
  })

  const { data: criticalAlertRows } = await supabase
    .from('visit_critical_alerts')
    .select('id, rule_slug, confirm_question, clinical_prompt, library_slug, clinician_response')
    .eq('visit_id', visitId)
    .eq('clinic_id', clinicId)
    .is('clinician_response', null)
    .order('created_at', { ascending: true })

  const critical_alerts = (criticalAlertRows ?? []).map((a) => ({
    id: a.id as string,
    rule_slug: a.rule_slug as string,
    confirm_question: a.confirm_question as string,
    clinical_prompt: a.clinical_prompt as string,
    library_slug: (a.library_slug as string | null) ?? null,
  }))

  const [{ data: protocols }, { data: ebolaRows }, { data: vitalsRows }] = await Promise.all([
    supabase.rpc('rpc_active_protocols_for_clinic', { p_clinic_id: clinicId }),
    supabase.rpc('rpc_visit_ebola_screening', { p_visit_id: visitId }),
    supabase
      .from('patient_vitals')
      .select('temp_c')
      .eq('visit_id', visitId)
      .order('recorded_at', { ascending: false })
      .limit(1),
  ])

  const ebolaProtocolActive = (protocols ?? []).some(
    (p: { protocol?: string }) => p.protocol === 'ebola',
  )
  const ebolaScreening = (ebolaRows ?? [])[0] ?? null
  const latestTempC =
    vitalsRows && vitalsRows.length > 0
      ? (vitalsRows[0].temp_c as number | null)
      : null

  return {
    ...visit,
    patient_notes_clinician: clinicianNote,
    patient_notes_ai: aiNote,
    ai_review_suggestions,
    critical_alerts,
    ebola_protocol_active: ebolaProtocolActive,
    ebola_screening: ebolaScreening,
    latest_temp_c: latestTempC,
  }
}

export default async function VisitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  return measureServerLoader(PERF_LOADER.visitPage, async () => {
    const staff = await getStaff()

    if (!staff) {
      redirect('/')
    }

    const { id } = await params
    const [visit, prescribingCatalog, prescriptionLines] = await Promise.all([
      getVisitDetails(id, staff.clinic_id),
      getClinicPrescribingCatalog(staff.clinic_id),
      loadPrescriptionOrdersForVisit(id),
    ])

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

    // Provider-note lifecycle history (migration 044). Loaded eagerly because
    // both the addendum list + amendment timeline are part of the visit page,
    // not a deep-link.
    const providerNote = Array.isArray(visit.provider_notes)
      ? visit.provider_notes[0]
      : (visit.provider_notes as { id?: string } | null)
    const providerNoteId = (providerNote as { id?: string } | null)?.id ?? null

    let addendums: Array<{
      id: string
      addendum_text: string
      created_at: string
      created_by_name: string | null
    }> = []
    let amendments: Array<{
      id: string
      reason: string
      amended_at: string
      amended_by_name: string | null
      prior_transcript: string | null
      new_transcript: string | null
    }> = []

    if (providerNoteId) {
      const [{ data: addendumRows }, { data: amendmentRows }] = await Promise.all([
        supabase
          .from('provider_note_addendums')
          .select('id, addendum_text, created_at, author:staff!provider_note_addendums_created_by_fkey(display_name)')
          .eq('parent_note_id', providerNoteId)
          .order('created_at', { ascending: true }),
        supabase
          .from('provider_note_amendments')
          .select('id, reason, amended_at, prior_transcript, new_transcript, author:staff!provider_note_amendments_amended_by_fkey(display_name)')
          .eq('parent_note_id', providerNoteId)
          .order('amended_at', { ascending: false }),
      ])

      addendums = (addendumRows ?? []).map((row) => {
        type AuthorRel = { display_name: string } | { display_name: string }[] | null
        const a = (row as { author?: AuthorRel }).author
        return {
          id: row.id as string,
          addendum_text: row.addendum_text as string,
          created_at: row.created_at as string,
          created_by_name: Array.isArray(a) ? a[0]?.display_name ?? null : a?.display_name ?? null,
        }
      })

      amendments = (amendmentRows ?? []).map((row) => {
        type AuthorRel = { display_name: string } | { display_name: string }[] | null
        const a = (row as { author?: AuthorRel }).author
        return {
          id: row.id as string,
          reason: row.reason as string,
          amended_at: row.amended_at as string,
          amended_by_name: Array.isArray(a) ? a[0]?.display_name ?? null : a?.display_name ?? null,
          prior_transcript: (row.prior_transcript as string | null) ?? null,
          new_transcript: (row.new_transcript as string | null) ?? null,
        }
      })
    }

    const patient = Array.isArray(visit.patient) ? visit.patient[0] : visit.patient
    const title = patient
      ? patientDisplayName(patient)
      : (visit.patient as { display_name?: string } | null)?.display_name ?? 'Visit'

    return (
      <>
        <WebTopBar
          title={title}
          subtitle={`Visit · ${new Date(visit.visit_date).toLocaleDateString('en-GB')}`}
          subtitleMeta={false}
          actions={
            <Link
              href={patient?.id ? `/dashboard/patients/${patient.id}` : '/dashboard/visits'}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Patient chart
            </Link>
          }
        />
        <div className="flex-1 overflow-auto px-8 py-6 max-w-4xl">
          <VisitDetailClient
            visit={visit}
            staffId={staff.id}
            staffRole={staff.role}
            prescribingCatalog={prescribingCatalog}
            prescriptionLines={prescriptionLines}
            payment={payment}
            addendums={addendums}
            amendments={amendments}
          />
        </div>
      </>
    )
  })
}
