'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase'
import { getStaff } from '@/lib/auth'

const CLINICAL_ROLES = new Set([
  'admin',
  'doctor',
  'nurse',
  'clinical_officer',
  'midwife',
  'nursing_assistant',
])

export type VitalsInput = {
  patientId: string
  visitId: string
  weight_kg?: number | null
  height_cm?: number | null
  temp_c?: number | null
  bp_systolic?: number | null
  bp_diastolic?: number | null
  pulse_bpm?: number | null
  resp_rate?: number | null
  spo2_pct?: number | null
  muac_cm?: number | null
  notes?: string | null
}

/**
 * Record a vitals set for a visit. patient_vitals is patient-first (visit
 * optional), every field nullable. We insert via the service client (the
 * RPC's get_current_clinic_id() gate is null under service role), scoping to
 * the caller's clinic by looking the patient up first.
 */
export async function recordVitals(
  input: VitalsInput,
): Promise<{ success: true } | { success: false; error: string }> {
  const staff = await getStaff()
  if (!staff) return { success: false, error: 'Not signed in' }
  if (!CLINICAL_ROLES.has(staff.role)) {
    return { success: false, error: 'Your role cannot record vitals.' }
  }

  const supabase = createServiceClient()
  const { data: patient } = await supabase
    .from('patients')
    .select('id')
    .eq('id', input.patientId)
    .eq('clinic_id', staff.clinic_id)
    .maybeSingle()
  if (!patient) return { success: false, error: 'Patient not found in your clinic' }

  const { error } = await supabase.from('patient_vitals').insert({
    patient_id: input.patientId,
    visit_id: input.visitId,
    recorded_by: staff.id,
    weight_kg: input.weight_kg ?? null,
    height_cm: input.height_cm ?? null,
    temp_c: input.temp_c ?? null,
    bp_systolic: input.bp_systolic ?? null,
    bp_diastolic: input.bp_diastolic ?? null,
    pulse_bpm: input.pulse_bpm ?? null,
    resp_rate: input.resp_rate ?? null,
    spo2_pct: input.spo2_pct ?? null,
    muac_cm: input.muac_cm ?? null,
    notes: input.notes ?? null,
  })
  if (error) return { success: false, error: error.message }

  revalidatePath(`/dashboard/visits/${input.visitId}`)
  return { success: true }
}
