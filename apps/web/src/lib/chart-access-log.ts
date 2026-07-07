import { createServiceClient } from '@/lib/supabase'

/** Fire-and-forget chart view audit (WP4 Stage 1). Never blocks the page load. */
export async function logChartAccess(
  clinicId: string,
  patientId: string,
  surface: 'patient_chart' | 'visit_detail',
): Promise<void> {
  try {
    const supabase = createServiceClient()
    const { error } = await supabase.rpc('rpc_log_chart_access', {
      p_clinic_id: clinicId,
      p_patient_id: patientId,
      p_surface: surface,
    })
    if (error) console.warn('rpc_log_chart_access failed:', error.message)
  } catch (err) {
    console.warn('logChartAccess failed:', err)
  }
}
