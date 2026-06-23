import { createServiceClient } from '@/lib/supabase'
import type { ClinicAppointment } from '@/lib/calendar-events'

export async function loadClinicAppointments(
  clinicId: string,
  opts?: { daysBack?: number; daysForward?: number },
): Promise<ClinicAppointment[]> {
  const daysBack = opts?.daysBack ?? 7
  const daysForward = opts?.daysForward ?? 56

  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - daysBack)

  const end = new Date()
  end.setHours(0, 0, 0, 0)
  end.setDate(end.getDate() + daysForward)

  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('rpc_list_appointments', {
    p_clinic_id: clinicId,
    p_from: start.toISOString(),
    p_to: end.toISOString(),
  })
  if (error) {
    console.error('calendar: load appointments', error)
    return []
  }
  return (data ?? []) as ClinicAppointment[]
}
