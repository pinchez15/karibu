'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase'
import { getStaff } from '@/lib/auth'

export async function recordCriticalAlertResponse(
  alertId: string,
  response: 'confirmed' | 'data_error' | 'dismissed',
): Promise<{ success: true } | { success: false; error: string }> {
  const staff = await getStaff()
  if (!staff) return { success: false, error: 'Not signed in' }

  const supabase = createServiceClient()
  const { data: alert } = await supabase
    .from('visit_critical_alerts')
    .select('id, visit_id, clinic_id')
    .eq('id', alertId)
    .eq('clinic_id', staff.clinic_id)
    .maybeSingle()

  if (!alert) return { success: false, error: 'Alert not found' }

  const { error } = await supabase
    .from('visit_critical_alerts')
    .update({
      clinician_response: response,
      responded_at: new Date().toISOString(),
      responded_by: staff.id,
    })
    .eq('id', alertId)
    .eq('clinic_id', staff.clinic_id)

  if (error) return { success: false, error: error.message }

  revalidatePath(`/dashboard/visits/${alert.visit_id}`)
  return { success: true }
}
