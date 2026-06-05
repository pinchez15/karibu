'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import {
  buildPrintableReferralSummary,
  defaultClinicalSummary,
  patientDisplayName,
  type ReferralUrgency,
} from '@/lib/referral-summary'

const CreateReferralSchema = z.object({
  visitId: z.string().uuid(),
  toFacility: z.string().min(1),
  urgency: z.enum(['routine', 'urgent', 'emergency']),
  reason: z.string().min(1),
  clinicalSummary: z.string().optional(),
  transportMode: z.string().optional(),
})

export type ReferralFormContext = {
  visitId: string
  patientId: string
  patientName: string
  patientNumber: string
  chiefComplaint: string | null
  defaultSummary: string
  clinicName: string | null
}

export async function getReferralFormContext(visitId: string): Promise<ReferralFormContext | null> {
  const staff = await getStaff()
  if (!staff) return null

  const supabase = createServiceClient()
  const [{ data: visit }, { data: clinic }] = await Promise.all([
    supabase
      .from('visits')
      .select(`
        id, patient_id, chief_complaint, diagnosis, tests_ordered, lab_results, medications,
        patient:patients(id, first_name, last_name, display_name, patient_number),
        provider_notes(transcript)
      `)
      .eq('id', visitId)
      .eq('clinic_id', staff.clinic_id)
      .maybeSingle(),
    supabase.from('clinics').select('name').eq('id', staff.clinic_id).maybeSingle(),
  ])

  if (!visit) return null

  const patient = Array.isArray(visit.patient) ? visit.patient[0] : visit.patient
  if (!patient) return null

  const providerNote = Array.isArray(visit.provider_notes)
    ? visit.provider_notes[0]
    : visit.provider_notes
  const transcript = (providerNote as { transcript?: string } | null)?.transcript ?? null

  const { data: vitalsRows } = await supabase.rpc('rpc_get_patient_latest_vitals', {
    p_patient_id: patient.id,
  })
  const vitals = Array.isArray(vitalsRows) ? vitalsRows[0] : vitalsRows

  const v = vitals as {
    temp_c?: number | null
    bp_systolic?: number | null
    bp_diastolic?: number | null
    pulse_bpm?: number | null
  } | null
  const bp =
    v?.bp_systolic != null && v?.bp_diastolic != null
      ? `${v.bp_systolic}/${v.bp_diastolic}`
      : null
  const vitalsLine = v
    ? [
        v.temp_c != null ? `T ${v.temp_c}°C` : null,
        bp ? `BP ${bp}` : null,
        v.pulse_bpm != null ? `HR ${v.pulse_bpm}` : null,
      ]
        .filter(Boolean)
        .join(', ')
    : ''

  return {
    visitId: visit.id as string,
    patientId: patient.id as string,
    patientName: patientDisplayName(patient),
    patientNumber: (patient.patient_number as string | null) ?? `PT-${String(patient.id).slice(0, 8)}`,
    chiefComplaint: (visit.chief_complaint as string | null) ?? null,
    defaultSummary: defaultClinicalSummary({
      chiefComplaint: visit.chief_complaint as string | null,
      transcript,
      diagnosis: visit.diagnosis as string | null,
      testsOrdered: visit.tests_ordered as string | null,
      labResults: visit.lab_results as string | null,
      medications: visit.medications as string | null,
      vitalsLine: vitalsLine || null,
    }),
    clinicName: (clinic?.name as string | null) ?? null,
  }
}

export async function createReferral(
  input: z.infer<typeof CreateReferralSchema>,
): Promise<{ ok: true; summary: string } | { ok: false; error: string }> {
  const staff = await getStaff()
  if (!staff) return { ok: false, error: 'Not signed in' }

  const parsed = CreateReferralSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid referral data' }

  const ctx = await getReferralFormContext(parsed.data.visitId)
  if (!ctx) return { ok: false, error: 'Visit not found' }

  const supabase = createServiceClient()
  const referralId = randomUUID()
  const clientOpId = randomUUID()

  const { data, error } = await supabase.rpc('rpc_create_referral', {
    p_id: referralId,
    p_clinic_id: staff.clinic_id,
    p_patient_id: ctx.patientId,
    p_visit_id: parsed.data.visitId,
    p_from_department: 'opd',
    p_to_facility: parsed.data.toFacility.trim(),
    p_urgency: parsed.data.urgency,
    p_reason: parsed.data.reason.trim(),
    p_clinical_summary: parsed.data.clinicalSummary?.trim() || null,
    p_transport_mode: parsed.data.transportMode?.trim() || null,
    p_client_op_id: clientOpId,
  })

  if (error) {
    console.error('rpc_create_referral failed:', error)
    return { ok: false, error: error.message }
  }

  const createdAt =
    (data as { created_at?: string } | null)?.created_at ?? new Date().toISOString()

  const { data: visitRow } = await supabase
    .from('visits')
    .select('chief_complaint, diagnosis, tests_ordered, lab_results, medications, patient:patients(sex, date_of_birth, whatsapp_number)')
    .eq('id', parsed.data.visitId)
    .maybeSingle()

  const patient = visitRow
    ? (Array.isArray(visitRow.patient) ? visitRow.patient[0] : visitRow.patient)
    : null

  const summary = buildPrintableReferralSummary({
    clinicName: ctx.clinicName,
    referringClinician: staff.display_name,
    patientName: ctx.patientName,
    patientNumber: ctx.patientNumber,
    patientSex: (patient?.sex as string | null) ?? null,
    patientDob: (patient?.date_of_birth as string | null) ?? null,
    patientPhone: (patient?.whatsapp_number as string | null) ?? null,
    toFacility: parsed.data.toFacility.trim(),
    urgency: parsed.data.urgency as ReferralUrgency,
    reason: parsed.data.reason.trim(),
    clinicalSummary: parsed.data.clinicalSummary?.trim() || null,
    transportMode: parsed.data.transportMode?.trim() || null,
    createdAt,
    chiefComplaint: (visitRow?.chief_complaint as string | null) ?? null,
    diagnosis: (visitRow?.diagnosis as string | null) ?? null,
    testsOrdered: (visitRow?.tests_ordered as string | null) ?? null,
    labResults: (visitRow?.lab_results as string | null) ?? null,
    medications: (visitRow?.medications as string | null) ?? null,
  })

  revalidatePath('/dashboard/orders')
  revalidatePath(`/dashboard/visits/${parsed.data.visitId}`)
  revalidatePath(`/dashboard/patients/${ctx.patientId}`)

  return { ok: true, summary }
}
