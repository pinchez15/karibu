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
      patient:patients(display_name, first_name, last_name, patient_id),
      patient_notes(content),
      clinic:clinics(name, slug, timezone)
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
  const clinicArr = visit.clinic as unknown as Array<{ name: string; slug: string; timezone: string }> | null

  const patientNote = patientNotesArr?.[0] ?? null
  if (!patientNote?.content) return null

  return {
    id: visit.id,
    visit_date: visit.visit_date,
    patient: patientArr?.[0] ?? null,
    patient_notes: patientNote,
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
