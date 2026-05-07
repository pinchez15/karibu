import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { redirect, notFound } from 'next/navigation'
import { PrintView } from './PrintView'
import { PrintBlocker } from './PrintBlocker'

type PrintData = {
  id: string
  visit_date: string
  diagnosis: string | null
  medications: string | null
  follow_up_instructions: string | null
  tests_ordered: string | null
  patient: {
    display_name: string | null
    first_name: string | null
    last_name: string | null
    patient_id: number | null
  } | null
  patient_notes: { content: string | null } | null
  doctor: { display_name: string } | null
  clinic: {
    name: string
    phone: string | null
    umdpc_number: string | null
    timezone: string
  } | null
}

type FetchResult =
  | { kind: 'ok'; visit: PrintData }
  | { kind: 'missing_visit' }
  | { kind: 'missing_note' }
  | { kind: 'missing_clinic_phone' }

async function fetchPrintData(visitId: string, clinicId: string): Promise<FetchResult> {
  const supabase = createServiceClient()

  const { data: visit, error } = await supabase
    .from('visits')
    .select(`
      id,
      visit_date,
      diagnosis,
      medications,
      follow_up_instructions,
      tests_ordered,
      patient:patients(display_name, first_name, last_name, patient_id),
      patient_notes(content, source),
      doctor:staff!visits_doctor_id_fkey(display_name),
      clinic:clinics(name, phone, umdpc_number, timezone)
    `)
    .eq('id', visitId)
    .eq('clinic_id', clinicId)
    .single()

  if (error || !visit) return { kind: 'missing_visit' }

  // Supabase returns nested relations as arrays even for one-to-one
  const patientNotesArr = visit.patient_notes as unknown as { content: string | null; source: string | null }[] | null
  const patientArr = visit.patient as unknown as Array<{
    display_name: string | null
    first_name: string | null
    last_name: string | null
    patient_id: number | null
  }> | null
  const doctorArr = visit.doctor as unknown as Array<{ display_name: string }> | null
  const clinicArr = visit.clinic as unknown as Array<{
    name: string
    phone: string | null
    umdpc_number: string | null
    timezone: string
  }> | null

  // Receipt always prints the clinician's words, never the AI version. The
  // clinician is the receipt-of-record. Fall back to AI only if no clinician
  // row exists (legacy visits before migration 032).
  const clinicianNote = patientNotesArr?.find((n) => n.source === 'clinician_fallback') ?? null
  const aiNote = patientNotesArr?.find((n) => n.source === 'ai_generated') ?? null
  const patientNote = clinicianNote ?? aiNote ?? patientNotesArr?.[0] ?? null
  if (!patientNote?.content || patientNote.content.trim().length === 0) {
    return { kind: 'missing_note' }
  }

  const clinic = clinicArr?.[0] ?? null
  // Clinic letterhead is required: without a phone number the receipt loses
  // the "call us if symptoms worsen" callout — the most important thing on
  // the page. Fail loudly so staff fix the clinic config instead of handing
  // the patient a receipt with no callback number.
  if (!clinic?.phone || clinic.phone.trim().length === 0) {
    return { kind: 'missing_clinic_phone' }
  }

  return {
    kind: 'ok',
    visit: {
      id: visit.id,
      visit_date: visit.visit_date,
      diagnosis: visit.diagnosis as string | null,
      medications: visit.medications as string | null,
      follow_up_instructions: visit.follow_up_instructions as string | null,
      tests_ordered: visit.tests_ordered as string | null,
      patient: patientArr?.[0] ?? null,
      patient_notes: patientNote,
      doctor: doctorArr?.[0] ?? null,
      clinic,
    },
  }
}

export default async function PrintPatientNotePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const staff = await getStaff()
  if (!staff) redirect('/')

  const { id } = await params
  const result = await fetchPrintData(id, staff.clinic_id)

  if (result.kind === 'missing_visit') notFound()

  if (result.kind === 'missing_note') {
    return (
      <PrintBlocker
        title="Patient note not ready"
        message="The AI hasn't generated a patient summary for this visit yet. This usually means transcription failed. Try Reject &amp; Reprocess from the review queue, or contact support if it persists."
        ctaHref="/dashboard/review"
        ctaLabel="Back to review queue"
      />
    )
  }

  if (result.kind === 'missing_clinic_phone') {
    return (
      <PrintBlocker
        title="Clinic phone number not set"
        message="The receipt needs a clinic phone number so the patient knows who to call if symptoms worsen. An admin must set it in Settings before printing."
        ctaHref="/dashboard/settings"
        ctaLabel="Go to settings"
      />
    )
  }

  return <PrintView visit={result.visit as never} />
}
