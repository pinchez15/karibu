import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { getClinicPrescribingCatalog } from '@/lib/clinic-catalog'
import { loadVisitAiReviewSuggestions } from '@/lib/visit-ai-suggestions'
import { logChartAccess } from '@/lib/chart-access-log'
import { measureServerLoader, PERF_LOADER } from '@/lib/server-timing'
import { loadPrescriptionOrdersForVisit } from '@/app/dashboard/pharmacy/actions'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { WebTopBar } from '@/components/web-shell'
import { patientDisplayName } from '@/lib/referral-summary'
import { VisitDetailClient } from './VisitDetailClient'
import type React from 'react'

const VISIT_COLUMNS = `
  id, clinic_id, patient_id, doctor_id, nurse_id, status, queue_status, queue_position, priority,
  chief_complaint, checked_in_at, department, review_status, reviewed_by, reviewed_at,
  diagnosis, medications, follow_up_instructions, tests_ordered, visit_date, created_at, updated_at,
  finalized_at, error_message, error_at, documentation_complete, documentation_completed_at,
  ai_structure_status, ai_structure_started_at, ai_structure_completed_at, ai_structure_error,
  ai_structure_attempts, dispensing_status, dispense_notes, dispensed_at, dispensed_by,
  pharmacy_order_submitted_at, pharmacy_order_submitted_by, lab_status, lab_results, lab_abnormal,
  lab_completed_at, lab_completed_by,
  patient:patients(id, display_name, whatsapp_number, date_of_birth),
  doctor:staff!visits_doctor_id_fkey(id, display_name),
  nurse:staff!visits_nurse_id_fkey(id, display_name),
  provider_notes(
    id, patient_id, visit_id, transcript, note_content, structured_data, status, source,
    created_at, updated_at, created_by, finalized_at, finalized_by, requires_cosign,
    cosigned_at, cosigned_by
  ),
  patient_notes(id, visit_id, content, language, status, source, created_at, updated_at)
`

async function getVisitDetails(visitId: string, clinicId: string) {
  return measureServerLoader(PERF_LOADER.visitDetails, () =>
    getVisitDetailsImpl(visitId, clinicId),
  )
}

async function getVisitDetailsImpl(visitId: string, clinicId: string) {
  const supabase = createServiceClient()

  const { data: visit, error } = await supabase
    .from('visits')
    .select(VISIT_COLUMNS)
    .eq('id', visitId)
    .eq('clinic_id', clinicId)
    .single()

  if (error || !visit) {
    return null
  }

  const rawNotes = visit.patient_notes as unknown
  const notesArr = Array.isArray(rawNotes)
    ? (rawNotes as Array<{ source?: string; content?: string | null } & Record<string, unknown>>)
    : rawNotes
      ? [(rawNotes as { source?: string; content?: string | null } & Record<string, unknown>)]
      : []

  const clinicianNote = notesArr.find((n) => n.source === 'clinician_fallback') ?? null
  const aiNote = notesArr.find((n) => n.source === 'ai_generated') ?? null

  const docComplete = !!(visit as { documentation_complete?: boolean }).documentation_complete

  const [
    ai_review_suggestions,
    { data: criticalAlertRows },
    { data: protocols },
    { data: ebolaRows },
    { data: vitalsRows },
  ] = await Promise.all([
    loadVisitAiReviewSuggestions(visitId, clinicId, { documentationComplete: docComplete }),
    supabase
      .from('visit_critical_alerts')
      .select('id, rule_slug, confirm_question, clinical_prompt, library_slug, clinician_response')
      .eq('visit_id', visitId)
      .eq('clinic_id', clinicId)
      .is('clinician_response', null)
      .order('created_at', { ascending: true }),
    supabase.rpc('rpc_active_protocols_for_clinic', { p_clinic_id: clinicId }),
    supabase.rpc('rpc_visit_ebola_screening', { p_visit_id: visitId }),
    supabase
      .from('patient_vitals')
      .select(
        'temp_c, bp_systolic, bp_diastolic, pulse_bpm, resp_rate, spo2_pct, weight_kg, height_cm, muac_cm, notes, recorded_at',
      )
      .eq('visit_id', visitId)
      .order('recorded_at', { ascending: false })
      .limit(1),
  ])

  const critical_alerts = (criticalAlertRows ?? []).map((a) => ({
    id: a.id as string,
    rule_slug: a.rule_slug as string,
    confirm_question: a.confirm_question as string,
    clinical_prompt: a.clinical_prompt as string,
    library_slug: (a.library_slug as string | null) ?? null,
  }))

  const ebolaProtocolActive = (protocols ?? []).some(
    (p: { protocol?: string }) => p.protocol === 'ebola',
  )
  const ebolaScreening = (ebolaRows ?? [])[0] ?? null
  const latestVitalsRow = vitalsRows?.[0] ?? null
  const latestTempC =
    latestVitalsRow != null ? (latestVitalsRow.temp_c as number | null) : null
  const latest_vitals = latestVitalsRow
    ? {
        temp_c: (latestVitalsRow.temp_c as number | null) ?? null,
        bp_systolic: (latestVitalsRow.bp_systolic as number | null) ?? null,
        bp_diastolic: (latestVitalsRow.bp_diastolic as number | null) ?? null,
        pulse_bpm: (latestVitalsRow.pulse_bpm as number | null) ?? null,
        resp_rate: (latestVitalsRow.resp_rate as number | null) ?? null,
        spo2_pct: (latestVitalsRow.spo2_pct as number | null) ?? null,
        weight_kg: (latestVitalsRow.weight_kg as number | null) ?? null,
        height_cm: (latestVitalsRow.height_cm as number | null) ?? null,
        muac_cm: (latestVitalsRow.muac_cm as number | null) ?? null,
        notes: (latestVitalsRow.notes as string | null) ?? null,
        recorded_at: (latestVitalsRow.recorded_at as string | null) ?? null,
      }
    : null

  void logChartAccess(clinicId, visit.patient_id as string, 'visit_detail')

  const patientRel = Array.isArray(visit.patient) ? visit.patient[0] : visit.patient
  const doctorRel = Array.isArray(visit.doctor) ? visit.doctor[0] : visit.doctor
  const nurseRel = Array.isArray(visit.nurse) ? visit.nurse[0] : visit.nurse
  const providerNotesRel = Array.isArray(visit.provider_notes)
    ? visit.provider_notes[0] ?? null
    : visit.provider_notes

  return {
    ...visit,
    patient: patientRel,
    doctor: doctorRel ?? null,
    nurse: nurseRel ?? null,
    provider_notes: providerNotesRel,
    patient_notes: notesArr[0] ?? null,
    patient_notes_clinician: clinicianNote,
    patient_notes_ai: aiNote,
    ai_review_suggestions,
    critical_alerts,
    ebola_protocol_active: ebolaProtocolActive,
    ebola_screening: ebolaScreening,
    latest_temp_c: latestTempC,
    latest_vitals,
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

    const supabase = createServiceClient()
    const providerNote = Array.isArray(visit.provider_notes)
      ? visit.provider_notes[0]
      : (visit.provider_notes as { id?: string } | null)
    const providerNoteId = (providerNote as { id?: string } | null)?.id ?? null

    const [{ data: payment }, addendumResult, amendmentResult] = await Promise.all([
      supabase
        .from('payments')
        .select('receipt_number, amount_ugx, payment_method, status, service_type, created_at, collector:staff!payments_collected_by_fkey(display_name)')
        .eq('visit_id', id)
        .maybeSingle(),
      providerNoteId
        ? supabase
            .from('provider_note_addendums')
            .select('id, addendum_text, created_at, author:staff!provider_note_addendums_created_by_fkey(display_name)')
            .eq('parent_note_id', providerNoteId)
            .order('created_at', { ascending: true })
        : Promise.resolve({ data: null }),
      providerNoteId
        ? supabase
            .from('provider_note_amendments')
            .select('id, reason, amended_at, prior_transcript, new_transcript, author:staff!provider_note_amendments_amended_by_fkey(display_name)')
            .eq('parent_note_id', providerNoteId)
            .order('amended_at', { ascending: false })
        : Promise.resolve({ data: null }),
    ])

    const addendumRows = addendumResult.data
    const amendmentRows = amendmentResult.data

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

    const patient = Array.isArray(visit.patient) ? visit.patient[0] : visit.patient
    const title = patient
      ? patientDisplayName(patient)
      : (visit.patient as { display_name?: string } | null)?.display_name ?? 'Visit'

    const paymentData = payment
      ? {
          ...payment,
          collector: (() => {
            const c = payment.collector as { display_name: string } | { display_name: string }[] | null
            if (Array.isArray(c)) return c[0] ?? null
            return c
          })(),
        }
      : null

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
            visit={visit as unknown as React.ComponentProps<typeof VisitDetailClient>['visit']}
            staffId={staff.id}
            staffRole={staff.role}
            prescribingCatalog={prescribingCatalog}
            prescriptionLines={prescriptionLines}
            payment={paymentData}
            addendums={addendums}
            amendments={amendments}
          />
        </div>
      </>
    )
  })
}
