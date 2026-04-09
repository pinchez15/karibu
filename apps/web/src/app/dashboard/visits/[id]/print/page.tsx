import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { redirect, notFound } from 'next/navigation'
import { PrintView } from './PrintView'

async function getPrintData(visitId: string, clinicId: string) {
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
      patient_notes(content),
      doctor:staff!visits_doctor_id_fkey(display_name),
      clinic:clinics(name, phone, umdpc_number, timezone)
    `)
    .eq('id', visitId)
    .eq('clinic_id', clinicId)
    .single()

  if (error || !visit) return null

  // Supabase returns nested relations as arrays even for one-to-one
  const patientNotesArr = visit.patient_notes as unknown as { content: string | null }[] | null
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

  const patientNote = patientNotesArr?.[0] ?? null
  if (!patientNote?.content) return null

  return {
    id: visit.id,
    visit_date: visit.visit_date,
    diagnosis: visit.diagnosis as string | null,
    medications: visit.medications as string | null,
    follow_up_instructions: visit.follow_up_instructions as string | null,
    tests_ordered: visit.tests_ordered as string | null,
    patient: patientArr?.[0] ?? null,
    patient_notes: patientNote,
    doctor: doctorArr?.[0] ?? null,
    clinic: clinicArr?.[0] ?? null,
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
  const visit = await getPrintData(id, staff.clinic_id)

  if (!visit) notFound()

  return <PrintView visit={visit as never} />
}
