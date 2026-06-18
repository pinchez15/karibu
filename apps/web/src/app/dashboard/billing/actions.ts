'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase'
import { requireStaff } from '@/lib/auth'

export type BillingPatientHit = { id: string; name: string; number: number | null }

/** Search patients for the billing charge picker (clinic-scoped). */
export async function searchBillingPatients(query: string): Promise<BillingPatientHit[]> {
  let staff
  try {
    staff = await requireStaff()
  } catch {
    return []
  }
  const term = query.trim().replace(/[,()%_\\]/g, ' ')
  if (term.length < 2) return []
  const supabase = createServiceClient()
  const pattern = `%${term}%`
  const { data } = await supabase
    .from('patients')
    .select('id, display_name, first_name, last_name, patient_id, whatsapp_number')
    .eq('clinic_id', staff.clinic_id)
    .or(
      [
        `display_name.ilike.${pattern}`,
        `first_name.ilike.${pattern}`,
        `last_name.ilike.${pattern}`,
        `whatsapp_number.ilike.${pattern}`,
      ].join(','),
    )
    .limit(8)
  return (data ?? []).map((p) => ({
    id: p.id as string,
    name:
      (p.display_name as string | null) ||
      [p.first_name, p.last_name].filter(Boolean).join(' ') ||
      'Unknown patient',
    number: (p.patient_id as number | null) ?? null,
  }))
}

/**
 * Raise a charge (bill) for a patient. Category ties it to the service line
 * (consultation = clinical visit, lab, pharmacy, procedure, other). Optional
 * visit linkage. Backed by rpc_add_charge (migration 071).
 */
export async function addCharge(input: {
  patientId: string
  category: string
  description: string
  amountUgx: number
  visitId?: string | null
}): Promise<{ success: true } | { success: false; error: string }> {
  let staff
  try {
    staff = await requireStaff()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
  if (staff.role !== 'admin') return { success: false, error: 'Billing is admin-only' }
  if (!input.patientId) return { success: false, error: 'Pick a patient.' }
  if (!input.description.trim()) return { success: false, error: 'Description is required.' }
  if (!Number.isFinite(input.amountUgx) || input.amountUgx < 0) {
    return { success: false, error: 'Enter a valid amount.' }
  }

  const supabase = createServiceClient()
  const { data: patient } = await supabase
    .from('patients')
    .select('id')
    .eq('id', input.patientId)
    .eq('clinic_id', staff.clinic_id)
    .maybeSingle()
  if (!patient) return { success: false, error: 'Patient not found in your clinic' }

  const { error } = await supabase.rpc('rpc_add_charge', {
    p_clinic_id: staff.clinic_id,
    p_patient_id: input.patientId,
    p_description: input.description.trim(),
    p_amount_ugx: Math.round(input.amountUgx),
    p_visit_id: input.visitId ?? null,
    p_category: input.category,
    p_source: 'manual',
  })
  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/billing')
  return { success: true }
}
