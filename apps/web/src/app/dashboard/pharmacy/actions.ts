'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase'
import { requireStaff } from '@/lib/auth'

/**
 * Pharmacy MVP actions.
 *
 * Writes use the service-role client (bypasses RLS) and explicitly scope
 * every UPDATE by `clinic_id` from the authenticated staff record. Mirrors
 * the pattern in the staff and payments server actions.
 */

type DispensingStatus =
  | 'not_started'
  | 'in_progress'
  | 'dispensed'
  | 'partial'
  | 'out_of_stock'

const ALLOWED_STATUSES: ReadonlyArray<DispensingStatus> = [
  'not_started',
  'in_progress',
  'dispensed',
  'partial',
  'out_of_stock',
]

async function assertDispenser() {
  const staff = await requireStaff()
  if (staff.role !== 'dispenser' && staff.role !== 'admin') {
    throw new Error('Forbidden: dispenser role required')
  }
  return staff
}

export async function setDispensingStatus(
  visitId: string,
  status: DispensingStatus,
  notes?: string,
): Promise<{ success: true } | { success: false; error: string }> {
  if (!ALLOWED_STATUSES.includes(status)) {
    return { success: false, error: 'Invalid status' }
  }

  let staff
  try {
    staff = await assertDispenser()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }

  const supabase = createServiceClient()

  const update: Record<string, unknown> = {
    dispensing_status: status,
    dispense_notes: notes?.trim() ? notes.trim() : null,
  }
  if (status === 'dispensed' || status === 'partial' || status === 'out_of_stock') {
    update.dispensed_at = new Date().toISOString()
    update.dispensed_by = staff.id
  } else {
    update.dispensed_at = null
    update.dispensed_by = null
  }

  const { error } = await supabase
    .from('visits')
    .update(update)
    .eq('id', visitId)
    .eq('clinic_id', staff.clinic_id)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/dashboard/pharmacy')
  revalidatePath('/dashboard/pharmacy/history')
  revalidatePath(`/dashboard/visits/${visitId}`)
  return { success: true }
}
