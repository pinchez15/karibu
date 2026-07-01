import { createServiceClient } from '@/lib/supabase'
import {
  evaluateCriticalAlerts,
  type PatientForAlerts,
  type VitalsForAlerts,
} from '@/lib/critical-alert-rules'

/**
 * Upsert visit critical alerts after vitals capture — mirrors Android
 * VisitDetailsViewModel.syncCriticalAlerts (rpc_upsert_critical_alert logic).
 */
export async function syncCriticalAlertsForVisit(
  visitId: string,
  clinicId: string,
  patient: PatientForAlerts,
  vitals: VitalsForAlerts,
): Promise<void> {
  const candidates = evaluateCriticalAlerts(patient, vitals)
  if (candidates.length === 0) return

  const supabase = createServiceClient()
  for (const c of candidates) {
    const { data: existing } = await supabase
      .from('visit_critical_alerts')
      .select('id, clinician_response')
      .eq('visit_id', visitId)
      .eq('rule_slug', c.ruleSlug)
      .maybeSingle()

    if (existing?.clinician_response) continue

    const { error } = await supabase.from('visit_critical_alerts').upsert(
      {
        visit_id: visitId,
        clinic_id: clinicId,
        rule_slug: c.ruleSlug,
        confirm_question: c.confirmQuestion,
        clinical_prompt: c.clinicalPrompt,
        library_slug: c.librarySlug,
      },
      { onConflict: 'visit_id,rule_slug' },
    )
    if (error) {
      console.error('syncCriticalAlertsForVisit failed:', c.ruleSlug, error.message)
    }
  }
}
