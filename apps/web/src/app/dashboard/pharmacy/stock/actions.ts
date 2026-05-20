'use server'

import { revalidatePath } from 'next/cache'
import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'

// Pharmacy stock actions.
//
// The service-role client bypasses RLS so we must scope every query and
// mutation by `staff.clinic_id`. The shape mirrors the migration in
// packages/supabase/migrations/043_pharmacy_lab_stock.sql.

type ActionResult = { success: true } | { success: false; error: string }

export async function createPharmacyStockItem(formData: FormData): Promise<ActionResult> {
  const staff = await getStaff()
  if (!staff) return { success: false, error: 'Not authenticated' }
  if (staff.role !== 'dispenser' && staff.role !== 'admin') {
    return { success: false, error: 'Only dispensers and admins can edit stock' }
  }

  const drugCode = String(formData.get('drug_code') ?? '').trim()
  const drugName = String(formData.get('drug_name') ?? '').trim()
  const formulation = String(formData.get('formulation') ?? '').trim()
  const strength = String(formData.get('strength') ?? '').trim() || null
  const unit = String(formData.get('unit') ?? '').trim()
  const initialQty = Number(formData.get('initial_quantity') ?? 0)
  const lowThreshold = Number(formData.get('low_stock_threshold') ?? 10)
  const unitPrice = formData.get('unit_price_ugx')
    ? Number(formData.get('unit_price_ugx'))
    : null
  const batchNumber = String(formData.get('batch_number') ?? '').trim() || null
  const expiresAt = String(formData.get('expires_at') ?? '').trim() || null
  const supplier = String(formData.get('supplier') ?? '').trim() || null
  const notes = String(formData.get('notes') ?? '').trim() || null

  if (!drugName || !formulation || !unit) {
    return { success: false, error: 'Drug, formulation, and unit are required' }
  }

  const supabase = createServiceClient()

  const { data: item, error } = await supabase
    .from('pharmacy_stock_items')
    .insert({
      clinic_id: staff.clinic_id,
      drug_code: drugCode || drugName.toUpperCase().replace(/\s+/g, '_'),
      drug_name: drugName,
      formulation,
      strength,
      unit,
      quantity_on_hand: 0,
      low_stock_threshold: lowThreshold,
      unit_price_ugx: unitPrice,
      batch_number: batchNumber,
      expires_at: expiresAt,
      supplier,
      notes,
    })
    .select('id')
    .single()

  if (error || !item) {
    return { success: false, error: error?.message ?? 'Failed to create stock item' }
  }

  if (initialQty > 0) {
    const { error: movementError } = await supabase
      .from('pharmacy_stock_movements')
      .insert({
        stock_item_id: item.id,
        clinic_id: staff.clinic_id,
        movement_type: 'received',
        quantity_delta: initialQty,
        recorded_by: staff.id,
        batch_number: batchNumber,
        expires_at: expiresAt,
        notes: 'Opening balance',
      })
    if (movementError) {
      return { success: false, error: movementError.message }
    }
  }

  revalidatePath('/dashboard/pharmacy/stock')
  return { success: true }
}

export async function recordPharmacyStockMovement(formData: FormData): Promise<ActionResult> {
  const staff = await getStaff()
  if (!staff) return { success: false, error: 'Not authenticated' }
  if (staff.role !== 'dispenser' && staff.role !== 'admin') {
    return { success: false, error: 'Only dispensers and admins can adjust stock' }
  }

  const stockItemId = String(formData.get('stock_item_id') ?? '')
  const movementType = String(formData.get('movement_type') ?? '')
  const rawQty = Number(formData.get('quantity') ?? 0)
  const batchNumber = String(formData.get('batch_number') ?? '').trim() || null
  const expiresAt = String(formData.get('expires_at') ?? '').trim() || null
  const notes = String(formData.get('notes') ?? '').trim() || null

  if (!stockItemId || !movementType || !Number.isFinite(rawQty) || rawQty === 0) {
    return { success: false, error: 'Quantity must be non-zero' }
  }

  // Sign the delta based on movement type: receives/adjusted-up/transfer-in are
  // positive; dispenses/expired/transfer-out are negative. `adjusted` accepts
  // either sign so the form's quantity field can carry a leading -.
  const negativeKinds = new Set(['dispensed', 'expired', 'transferred_out'])
  const positiveKinds = new Set(['received', 'transferred_in'])
  const delta = positiveKinds.has(movementType)
    ? Math.abs(rawQty)
    : negativeKinds.has(movementType)
      ? -Math.abs(rawQty)
      : rawQty

  const supabase = createServiceClient()

  // Confirm the stock item belongs to this clinic before mutating.
  const { data: item, error: itemErr } = await supabase
    .from('pharmacy_stock_items')
    .select('id, clinic_id')
    .eq('id', stockItemId)
    .single()
  if (itemErr || !item || item.clinic_id !== staff.clinic_id) {
    return { success: false, error: 'Stock item not found' }
  }

  const { error } = await supabase
    .from('pharmacy_stock_movements')
    .insert({
      stock_item_id: stockItemId,
      clinic_id: staff.clinic_id,
      movement_type: movementType,
      quantity_delta: delta,
      recorded_by: staff.id,
      batch_number: batchNumber,
      expires_at: expiresAt,
      notes,
    })

  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/pharmacy/stock')
  revalidatePath('/dashboard/stock-overview')
  return { success: true }
}

export async function setPharmacyStockActive(id: string, active: boolean): Promise<ActionResult> {
  const staff = await getStaff()
  if (!staff) return { success: false, error: 'Not authenticated' }
  if (staff.role !== 'dispenser' && staff.role !== 'admin') {
    return { success: false, error: 'Only dispensers and admins can edit stock' }
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('pharmacy_stock_items')
    .update({ active })
    .eq('id', id)
    .eq('clinic_id', staff.clinic_id)

  if (error) return { success: false, error: error.message }
  revalidatePath('/dashboard/pharmacy/stock')
  return { success: true }
}
