'use server'

import { createServiceClient } from '@/lib/supabase'
import { getStaff } from '@/lib/auth'
import type { HmisDiagnosisCode, VisitDiagnosisCode } from '@karibu/shared'

/**
 * Ownership pre-check: the service-role client bypasses RLS, so every
 * visit-scoped operation must first confirm the visit belongs to the
 * caller's clinic. Returns true only when the visit exists in clinicId.
 */
async function visitBelongsToClinic(visitId: string, clinicId: string): Promise<boolean> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('visits')
    .select('id')
    .eq('id', visitId)
    .eq('clinic_id', clinicId)
    .maybeSingle()
  return Boolean(data)
}

export async function getHmisCodes(): Promise<HmisDiagnosisCode[]> {
  const staff = await getStaff()
  if (!staff) throw new Error('Not authenticated')

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('hmis_diagnosis_codes')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')

  if (error) {
    console.error('Failed to fetch HMIS codes:', error)
    return []
  }

  return data as HmisDiagnosisCode[]
}

export async function getVisitDiagnosisCodes(visitId: string): Promise<VisitDiagnosisCode[]> {
  const staff = await getStaff()
  if (!staff) throw new Error('Not authenticated')

  if (!(await visitBelongsToClinic(visitId, staff.clinic_id))) {
    return []
  }

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('visit_diagnosis_codes')
    .select('*, hmis_diagnosis_code:hmis_diagnosis_codes(*)')
    .eq('visit_id', visitId)

  if (error) {
    console.error('Failed to fetch visit diagnosis codes:', error)
    return []
  }

  return (data || []).map((row: Record<string, unknown>) => ({
    ...row,
    hmis_diagnosis_code: row.hmis_diagnosis_code || undefined,
  })) as VisitDiagnosisCode[]
}

export async function saveVisitDiagnosisCode(
  visitId: string,
  hmisCodeId: number,
  source: 'manual' | 'ai_confirmed',
) {
  const staff = await getStaff()
  if (!staff) return { error: 'Not authenticated' }

  if (!(await visitBelongsToClinic(visitId, staff.clinic_id))) {
    return { error: 'Visit not found' }
  }

  const supabase = createServiceClient()

  const { error } = await supabase
    .from('visit_diagnosis_codes')
    .upsert({
      visit_id: visitId,
      hmis_code_id: hmisCodeId,
      source,
      coded_by: staff.id,
      coded_at: new Date().toISOString(),
      confidence: source === 'ai_confirmed' ? 1.0 : null,
    }, { onConflict: 'visit_id,hmis_code_id' })

  if (error) {
    console.error('Failed to save diagnosis code:', error)
    return { error: 'Failed to save diagnosis code' }
  }

  return { success: true }
}

export async function removeVisitDiagnosisCode(visitId: string, hmisCodeId: number) {
  const staff = await getStaff()
  if (!staff) return { error: 'Not authenticated' }

  if (!(await visitBelongsToClinic(visitId, staff.clinic_id))) {
    return { error: 'Visit not found' }
  }

  const supabase = createServiceClient()

  const { error } = await supabase
    .from('visit_diagnosis_codes')
    .delete()
    .eq('visit_id', visitId)
    .eq('hmis_code_id', hmisCodeId)

  if (error) {
    console.error('Failed to remove diagnosis code:', error)
    return { error: 'Failed to remove diagnosis code' }
  }

  return { success: true }
}

// triggerAiCoding removed in the dictation pivot. AI coding now runs as the
// final step of the structure-dictation Inngest workflow (see
// apps/web/src/inngest/functions/structure-dictation.ts:code-diagnoses-hmis).
// Manual code edits go through saveVisitDiagnosisCode / removeVisitDiagnosisCode.
