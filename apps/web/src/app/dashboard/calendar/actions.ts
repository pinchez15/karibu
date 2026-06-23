'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getStaff, requireStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import type { ClinicAppointment, ClinicEventType } from '@/lib/calendar-events'

const CreateEvent = z.object({
  event_type: z.enum(['follow_up', 'drive', 'admin', 'external_lab_agency']),
  scheduled_at: z.string().min(1),
  scheduled_end: z.string().optional(),
  title: z.string().optional(),
  reason: z.string().optional(),
  patient_id: z.string().uuid().optional(),
})

export async function listAppointmentsInRange(
  fromIso: string,
  toIso: string,
): Promise<{ data?: ClinicAppointment[]; error?: string }> {
  const staff = await getStaff()
  if (!staff) return { error: 'Not authenticated' }

  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('rpc_list_appointments', {
    p_clinic_id: staff.clinic_id,
    p_from: fromIso,
    p_to: toIso,
  })
  if (error) {
    console.error('calendar: list appointments', error)
    return { error: error.message }
  }
  return { data: (data ?? []) as ClinicAppointment[] }
}

export async function createClinicEvent(
  input: z.infer<typeof CreateEvent>,
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  let staff
  try {
    staff = await requireStaff()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }

  if (
    !['admin', 'doctor', 'nurse', 'clinical_officer', 'midwife', 'nursing_assistant', 'records_officer'].includes(
      staff.role,
    )
  ) {
    return { success: false, error: 'Forbidden' }
  }

  const parsed = CreateEvent.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const { event_type, scheduled_at, scheduled_end, title, reason, patient_id } = parsed.data

  if (event_type === 'follow_up' && !patient_id) {
    return { success: false, error: 'Pick a patient for follow-up visits.' }
  }
  if (event_type !== 'follow_up' && !title?.trim()) {
    return { success: false, error: 'Add a title for this clinic event.' }
  }

  const supabase = createServiceClient()
  if (patient_id) {
    const { data: patient } = await supabase
      .from('patients')
      .select('id')
      .eq('id', patient_id)
      .eq('clinic_id', staff.clinic_id)
      .maybeSingle()
    if (!patient) return { success: false, error: 'Patient not found' }
  }

  const { data: id, error } = await supabase.rpc('rpc_create_appointment', {
    p_clinic_id: staff.clinic_id,
    p_event_type: event_type as ClinicEventType,
    p_scheduled_at: new Date(scheduled_at).toISOString(),
    p_patient_id: patient_id ?? null,
    p_title: title?.trim() || null,
    p_reason: reason?.trim() || null,
    p_unit: 'opd',
    p_scheduled_end: scheduled_end ? new Date(scheduled_end).toISOString() : null,
  })

  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard')
  return { success: true, id: id as string }
}
