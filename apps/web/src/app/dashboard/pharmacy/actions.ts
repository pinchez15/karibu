'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase'
import { requireStaff } from '@/lib/auth'
import {
  CompletePharmacyDispenseSchema,
  type CompleteDispenseLine,
} from '@/lib/validators/prescription'
import type { PrescriptionOrderLine, PharmacyQueueTab } from '@karibu/shared'
import type { PharmacyStockItem, PharmacyStockResult } from './pharmacy-data'
import { broadcastClinicRefresh } from '@/lib/realtime-server'

async function assertDispenser() {
  const staff = await requireStaff()
  if (staff.role !== 'dispenser' && staff.role !== 'admin') {
    throw new Error('Forbidden: dispenser role required')
  }
  return staff
}

function rpcLinesPayload(lines: CompleteDispenseLine[]) {
  return lines.map((line) => ({
    prescription_order_id: line.prescription_order_id,
    line_status: line.line_status,
    quantity_dispensed: line.quantity_dispensed ?? null,
    quantity_unit: line.quantity_unit ?? null,
    stock_item_id: line.stock_item_id ?? null,
    stock_quantity: line.stock_quantity ?? null,
    batch_number: line.batch_number ?? null,
    substitute_medication_code: line.substitute_medication_code ?? null,
    notes: line.notes ?? null,
  }))
}

export async function startPharmacyDispense(
  visitId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  let staff
  try {
    staff = await assertDispenser()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }

  const supabase = createServiceClient()
  const { error } = await supabase.rpc('rpc_start_pharmacy_dispense', {
    p_visit_id: visitId,
    p_client_op_id: null,
  })

  if (error) return { success: false, error: error.message }

  revalidatePharmacyPaths(visitId, staff.clinic_id)
  return { success: true }
}

export async function completePharmacyDispense(input: {
  visitId: string
  lines: CompleteDispenseLine[]
  notes?: string
}): Promise<{ success: true } | { success: false; error: string }> {
  const parsed = CompletePharmacyDispenseSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  let staff
  try {
    staff = await assertDispenser()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }

  const supabase = createServiceClient()
  const { error } = await supabase.rpc('rpc_complete_pharmacy_dispense', {
    p_visit_id: parsed.data.visitId,
    p_lines: rpcLinesPayload(parsed.data.lines),
    p_notes: parsed.data.notes ?? null,
    p_client_op_id: null,
  })

  if (error) return { success: false, error: error.message }

  revalidatePharmacyPaths(parsed.data.visitId, staff.clinic_id)
  return { success: true }
}

/** Mark dispensed for visits with free-text meds only (no structured Rx lines). */
export async function completeLegacyPharmacyDispense(input: {
  visitId: string
  notes?: string
}): Promise<{ success: true } | { success: false; error: string }> {
  let staff
  try {
    staff = await assertDispenser()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }

  const supabase = createServiceClient()
  const { error } = await supabase.rpc('rpc_complete_legacy_pharmacy_dispense', {
    p_visit_id: input.visitId,
    p_notes: input.notes ?? null,
    p_client_op_id: null,
  })

  if (error) return { success: false, error: error.message }

  revalidatePharmacyPaths(input.visitId, staff.clinic_id)
  return { success: true }
}

export async function sendPharmacyBackToClinician(
  visitId: string,
  reason: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const trimmed = reason.trim()
  if (!trimmed) return { success: false, error: 'Reason is required' }

  let staff
  try {
    staff = await assertDispenser()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }

  const supabase = createServiceClient()
  const { error } = await supabase.rpc('rpc_send_pharmacy_back_to_clinician', {
    p_visit_id: visitId,
    p_reason: trimmed,
    p_client_op_id: null,
  })

  if (error) return { success: false, error: error.message }

  revalidatePharmacyPaths(visitId, staff.clinic_id)
  return { success: true }
}

/** @deprecated Use completePharmacyDispense — kept for tests/e2e fixture shim. */
export async function setDispensingStatus(
  visitId: string,
  status: 'not_started' | 'in_progress' | 'dispensed' | 'partial' | 'out_of_stock',
  notes?: string,
): Promise<{ success: true } | { success: false; error: string }> {
  let staff
  try {
    staff = await assertDispenser()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }

  const supabase = createServiceClient()
  const { error } = await supabase.rpc('rpc_set_dispensing_status', {
    p_visit_id: visitId,
    p_status: status,
    p_notes: notes ?? null,
    p_client_op_id: null,
  })

  if (error) return { success: false, error: error.message }

  revalidatePharmacyPaths(visitId, staff.clinic_id)
  return { success: true }
}

export async function listClinicPharmacyStock(): Promise<PharmacyStockResult> {
  let staff
  try {
    staff = await requireStaff()
  } catch (e) {
    // An unauthenticated/expired session would otherwise throw out of this
    // server action and reach the client as the opaque production digest
    // ("An error occurred in the Server Components render...").
    console.error('listClinicPharmacyStock: auth failed', e)
    return { ok: false, error: 'Your session has expired. Refresh the page and sign in again.' }
  }

  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('pharmacy_stock_items')
      .select('id, drug_name, drug_code, strength, formulation, unit, quantity_on_hand')
      .eq('clinic_id', staff.clinic_id)
      .eq('active', true)
      .order('drug_name', { ascending: true })

    if (error) {
      // Previously swallowed: the function destructured only `data`, so a real
      // PostgREST/Postgres failure silently returned an empty list. Log the
      // true cause (visible in server logs) and surface a readable message.
      console.error('listClinicPharmacyStock: query failed', error)
      return {
        ok: false,
        error: 'Could not load the stock list. You can still dispense; stock decrement is unavailable.',
      }
    }

    return { ok: true, items: (data ?? []) as PharmacyStockItem[] }
  } catch (e) {
    console.error('listClinicPharmacyStock: unexpected error', e)
    return {
      ok: false,
      error: 'Could not load the stock list. You can still dispense; stock decrement is unavailable.',
    }
  }
}

export async function loadPrescriptionOrdersForVisit(
  visitId: string,
): Promise<PrescriptionOrderLine[]> {
  const staff = await requireStaff()
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('prescription_orders')
    .select('*')
    .eq('visit_id', visitId)
    .eq('clinic_id', staff.clinic_id)
    .neq('status', 'cancelled')
    .order('sort_order', { ascending: true })
    .order('ordered_at', { ascending: true })

  if (error) {
    console.error('loadPrescriptionOrdersForVisit', error)
    return []
  }
  return (data ?? []) as PrescriptionOrderLine[]
}

function revalidatePharmacyPaths(visitId: string, clinicId: string) {
  revalidatePath('/dashboard/pharmacy')
  revalidatePath('/dashboard/pharmacy/history')
  revalidatePath('/dashboard/pharmacy/stock')
  revalidatePath('/dashboard/stock-overview')
  revalidatePath(`/dashboard/visits/${visitId}`)
  // Push an instant refresh to every open clinic view (pharmacy queue, stock,
  // orders, today). Best-effort, fire-and-forget.
  void broadcastClinicRefresh(clinicId)
}

export type { PharmacyQueueTab }
