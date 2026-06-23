'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getStaff, requireStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import type { ClinicAppointment, ClinicEventType } from '@/lib/calendar-events'

const EventPayload = z.object({
  event_type: z.enum(['follow_up', 'drive', 'admin', 'external_lab_agency']),
  scheduled_at: z.string().min(1),
  scheduled_end: z.string().optional(),
  title: z.string().optional(),
  reason: z.string().optional(),
  patient_id: z.string().uuid().optional(),
})

const CALENDAR_ROLES = [
  'admin',
  'doctor',
  'nurse',
  'clinical_officer',
  'midwife',
  'nursing_assistant',
  'records_officer',
] as const

function canManageCalendar(role: string): boolean {
  return (CALENDAR_ROLES as readonly string[]).includes(role)
}

async function validateEventPayload(
  staff: { clinic_id: string },
  data: z.infer<typeof EventPayload>,
): Promise<{ ok: true; parsed: z.infer<typeof EventPayload> } | { ok: false; error: string }> {
  const { event_type, scheduled_at, scheduled_end, title, reason, patient_id } = data

  if (event_type === 'follow_up' && !patient_id) {
    return { ok: false, error: 'Pick a patient for follow-up visits.' }
  }
  if (event_type !== 'follow_up' && !title?.trim()) {
    return { ok: false, error: 'Add a title for this clinic event.' }
  }

  const supabase = createServiceClient()
  if (patient_id) {
    const { data: patient } = await supabase
      .from('patients')
      .select('id')
      .eq('id', patient_id)
      .eq('clinic_id', staff.clinic_id)
      .maybeSingle()
    if (!patient) return { ok: false, error: 'Patient not found' }
  }

  const at = new Date(scheduled_at)
  if (Number.isNaN(at.getTime())) {
    return { ok: false, error: 'Invalid date or time.' }
  }
  if (scheduled_end) {
    const end = new Date(scheduled_end)
    if (Number.isNaN(end.getTime())) {
      return { ok: false, error: 'Invalid end time.' }
    }
  }

  return { ok: true, parsed: data }
}

function revalidateCalendarPaths() {
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/calendar')
}

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
  input: z.infer<typeof EventPayload>,
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  let staff
  try {
    staff = await requireStaff()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }

  if (!canManageCalendar(staff.role)) {
    return { success: false, error: 'Forbidden' }
  }

  const parsed = EventPayload.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const validated = await validateEventPayload(staff, parsed.data)
  if (!validated.ok) return { success: false, error: validated.error }

  const { event_type, scheduled_at, scheduled_end, title, reason, patient_id } = validated.parsed
  const supabase = createServiceClient()

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

  revalidateCalendarPaths()
  return { success: true, id: id as string }
}

export async function updateClinicEvent(
  appointmentId: string,
  input: z.infer<typeof EventPayload>,
): Promise<{ success: true } | { success: false; error: string }> {
  let staff
  try {
    staff = await requireStaff()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }

  if (!canManageCalendar(staff.role)) {
    return { success: false, error: 'Forbidden' }
  }

  const parsed = EventPayload.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const validated = await validateEventPayload(staff, parsed.data)
  if (!validated.ok) return { success: false, error: validated.error }

  const { event_type, scheduled_at, scheduled_end, title, reason, patient_id } = validated.parsed
  const supabase = createServiceClient()

  const { error } = await supabase.rpc('rpc_update_appointment', {
    p_clinic_id: staff.clinic_id,
    p_appointment_id: appointmentId,
    p_event_type: event_type as ClinicEventType,
    p_scheduled_at: new Date(scheduled_at).toISOString(),
    p_patient_id: patient_id ?? null,
    p_title: title?.trim() || null,
    p_reason: reason?.trim() || null,
    p_scheduled_end: scheduled_end ? new Date(scheduled_end).toISOString() : null,
  })

  if (error) return { success: false, error: error.message }

  revalidateCalendarPaths()
  return { success: true }
}

export async function deleteClinicEvent(
  appointmentId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  let staff
  try {
    staff = await requireStaff()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }

  if (!canManageCalendar(staff.role)) {
    return { success: false, error: 'Forbidden' }
  }

  const supabase = createServiceClient()
  const { error } = await supabase.rpc('rpc_cancel_appointment', {
    p_clinic_id: staff.clinic_id,
    p_appointment_id: appointmentId,
  })

  if (error) return { success: false, error: error.message }

  revalidateCalendarPaths()
  return { success: true }
}
