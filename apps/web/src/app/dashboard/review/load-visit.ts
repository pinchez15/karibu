'use server'

import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import {
  parseClinicalNoteSections,
  sectionsHaveClinicalContent,
} from '@/lib/clinical-note-sections'
import type { StaffRole } from '@karibu/shared'

export type ReviewPanelVisit = {
  id: string
  visit_date: string
  status: string
  documentation_complete: boolean
  diagnosis: string | null
  medications: string | null
  tests_ordered: string | null
  follow_up_instructions: string | null
  lab_results: string | null
  lab_abnormal: boolean
  lab_status: string | null
  pharmacy_order_submitted_at: string | null
  patient_id: string
  patient: {
    id: string
    display_name: string | null
    sex: 'M' | 'F' | null
    dob_precision: string
    date_of_birth: string | null
    birth_year: number | null
    approximate_age: number | null
  }
  provider_notes: {
    id: string
    transcript: string | null
    structured_data: Record<string, unknown> | null
  } | null
  initialNoteSections: ReturnType<typeof parseClinicalNoteSections>
  initialNoteId: string | null
}

export type ReviewVisitKind = 'unfinalized' | 'uncoded'

export async function loadReviewVisitPanel(
  visitId: string,
): Promise<{ data?: ReviewPanelVisit; error?: string }> {
  const staff = await getStaff()
  if (!staff) return { error: 'Not authenticated' }

  const supabase = createServiceClient()
  const { data: visit, error } = await supabase
    .from('visits')
    .select(`
      id, visit_date, status, documentation_complete, diagnosis, medications,
      tests_ordered, follow_up_instructions, lab_results, lab_abnormal, lab_status,
      pharmacy_order_submitted_at, patient_id,
      patient:patients(id, display_name, sex, dob_precision, date_of_birth, birth_year, approximate_age),
      provider_notes(id, transcript, structured_data)
    `)
    .eq('id', visitId)
    .eq('clinic_id', staff.clinic_id)
    .maybeSingle()

  if (error || !visit) {
    return { error: 'Visit not found' }
  }

  const rawNotes = visit.provider_notes as unknown
  const providerNote = Array.isArray(rawNotes)
    ? (rawNotes[0] as ReviewPanelVisit['provider_notes'])
    : (rawNotes as ReviewPanelVisit['provider_notes'])

  const patientRaw = visit.patient as unknown
  const patient = (Array.isArray(patientRaw) ? patientRaw[0] : patientRaw) as ReviewPanelVisit['patient']

  const parsed = parseClinicalNoteSections(providerNote?.structured_data ?? null, {
    diagnosis: (visit.diagnosis as string | null) ?? '',
    medications: (visit.medications as string | null) ?? '',
    testsOrdered: (visit.tests_ordered as string | null) ?? '',
    followUpInstructions: (visit.follow_up_instructions as string | null) ?? '',
  })
  const transcript = providerNote?.transcript?.trim()
  const initialNoteSections =
    !sectionsHaveClinicalContent(parsed) && transcript
      ? { ...parsed, hpi: transcript }
      : parsed

  return {
    data: {
      id: visit.id as string,
      visit_date: visit.visit_date as string,
      status: visit.status as string,
      documentation_complete: !!visit.documentation_complete,
      diagnosis: visit.diagnosis as string | null,
      medications: visit.medications as string | null,
      tests_ordered: visit.tests_ordered as string | null,
      follow_up_instructions: visit.follow_up_instructions as string | null,
      lab_results: visit.lab_results as string | null,
      lab_abnormal: !!(visit.lab_abnormal as boolean | null),
      lab_status: (visit.lab_status as string | null) ?? null,
      pharmacy_order_submitted_at: (visit.pharmacy_order_submitted_at as string | null) ?? null,
      patient_id: visit.patient_id as string,
      patient,
      provider_notes: providerNote,
      initialNoteSections,
      initialNoteId: providerNote?.id ?? null,
    },
  }
}

export async function checkReviewVisitResolved(
  visitId: string,
  kind: ReviewVisitKind,
): Promise<{ resolved: boolean }> {
  const staff = await getStaff()
  if (!staff) return { resolved: false }

  const supabase = createServiceClient()

  if (kind === 'uncoded') {
    const { count } = await supabase
      .from('visit_diagnosis_codes')
      .select('*', { count: 'exact', head: true })
      .eq('visit_id', visitId)
      .in('source', ['manual', 'ai_confirmed'])
    return { resolved: (count ?? 0) > 0 }
  }

  const { data } = await supabase
    .from('visits')
    .select('status')
    .eq('id', visitId)
    .eq('clinic_id', staff.clinic_id)
    .maybeSingle()

  const status = data?.status as string | undefined
  return { resolved: status === 'sent' || status === 'completed' }
}

export type ReviewWorkspaceStaff = {
  staffId: string
  staffRole: StaffRole
}
