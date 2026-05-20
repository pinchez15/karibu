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

/**
 * Combined "dispense + decrement stock" flow.
 *
 * The dispenser picks which `pharmacy_stock_items` rows to deduct against,
 * plus the per-line quantity. We write a single status update on the visit
 * + N append-only stock movements (negative deltas tagged with the visit_id
 * so the audit trail wires back to the encounter).
 *
 * Failure model: the visit update + each movement insert are best-effort
 * sequential. If a movement insert fails we report it but the visit status
 * is already flipped — the dispenser can re-open the row, see which items
 * recorded successfully, and retry the rest. We choose this over a sproc
 * because the dispense window is short and clinic networks can drop mid-call.
 */
export async function recordDispenseAndStock(input: {
  visitId: string
  status: 'dispensed' | 'partial' | 'out_of_stock'
  notes?: string
  movements: Array<{ stockItemId: string; quantity: number; batchNumber?: string | null }>
}): Promise<{ success: true } | { success: false; error: string; partialFailures?: string[] }> {
  if (!['dispensed', 'partial', 'out_of_stock'].includes(input.status)) {
    return { success: false, error: 'Invalid status' }
  }

  let staff
  try {
    staff = await assertDispenser()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }

  const supabase = createServiceClient()

  // 1. Flip the visit status — keep the existing setDispensingStatus
  //    semantics so any UI reading the visit row sees a consistent state.
  const visitUpdate: Record<string, unknown> = {
    dispensing_status: input.status,
    dispense_notes: input.notes?.trim() ? input.notes.trim() : null,
    dispensed_at: new Date().toISOString(),
    dispensed_by: staff.id,
  }
  const { error: visitErr } = await supabase
    .from('visits')
    .update(visitUpdate)
    .eq('id', input.visitId)
    .eq('clinic_id', staff.clinic_id)
  if (visitErr) {
    return { success: false, error: `visit update failed: ${visitErr.message}` }
  }

  // 2. Validate every stock item belongs to this clinic before inserting
  //    movements. One round-trip with .in() rather than N lookups.
  const itemIds = Array.from(new Set(input.movements.map((m) => m.stockItemId)))
  let validItems = new Set<string>()
  if (itemIds.length > 0) {
    const { data: items } = await supabase
      .from('pharmacy_stock_items')
      .select('id')
      .in('id', itemIds)
      .eq('clinic_id', staff.clinic_id)
    validItems = new Set((items ?? []).map((r) => r.id as string))
  }

  // 3. Insert one negative-delta movement per line. Skip lines that don't
  //    pass clinic-scope validation and report them as partial failures.
  const partialFailures: string[] = []
  for (const m of input.movements) {
    if (!validItems.has(m.stockItemId)) {
      partialFailures.push(`Stock item ${m.stockItemId} not found in clinic`)
      continue
    }
    const qty = Math.abs(m.quantity)
    if (!Number.isFinite(qty) || qty <= 0) {
      partialFailures.push(`Quantity for ${m.stockItemId} must be > 0`)
      continue
    }
    const { error } = await supabase
      .from('pharmacy_stock_movements')
      .insert({
        stock_item_id: m.stockItemId,
        clinic_id: staff.clinic_id,
        movement_type: 'dispensed',
        quantity_delta: -qty,
        visit_id: input.visitId,
        recorded_by: staff.id,
        batch_number: m.batchNumber ?? null,
        notes: `Dispensed on visit ${input.visitId}`,
      })
    if (error) {
      partialFailures.push(`${m.stockItemId}: ${error.message}`)
    }
  }

  revalidatePath('/dashboard/pharmacy')
  revalidatePath('/dashboard/pharmacy/stock')
  revalidatePath('/dashboard/stock-overview')
  revalidatePath(`/dashboard/visits/${input.visitId}`)

  if (partialFailures.length > 0) {
    return {
      success: false,
      error: `Visit marked ${input.status}, but ${partialFailures.length} stock movement(s) failed.`,
      partialFailures,
    }
  }
  return { success: true }
}

/**
 * Helper for the dispense dialog — list pharmacy stock items in the calling
 * staff's clinic, filtered to active rows. Used by the dispense modal to
 * populate the picker without forcing the page to refetch the whole catalog.
 */
export async function listClinicPharmacyStock(): Promise<
  Array<{
    id: string
    drug_name: string
    drug_code: string
    strength: string | null
    formulation: string
    unit: string
    quantity_on_hand: number
  }>
> {
  const staff = await requireStaff()
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('pharmacy_stock_items')
    .select('id, drug_name, drug_code, strength, formulation, unit, quantity_on_hand')
    .eq('clinic_id', staff.clinic_id)
    .eq('active', true)
    .order('drug_name', { ascending: true })
  return (data ?? []) as Array<{
    id: string
    drug_name: string
    drug_code: string
    strength: string | null
    formulation: string
    unit: string
    quantity_on_hand: number
  }>
}
