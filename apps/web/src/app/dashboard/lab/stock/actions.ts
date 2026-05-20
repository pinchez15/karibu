'use server'

import { revalidatePath } from 'next/cache'
import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'

// Lab stock actions. Mirrors pharmacy/stock/actions.ts in spirit but the
// lab inventory is simpler (no strength/formulation matrix — a "Malaria RDT
// 25-test kit" is a single SKU).

type ActionResult = { success: true } | { success: false; error: string }

export async function createLabStockItem(formData: FormData): Promise<ActionResult> {
  const staff = await getStaff()
  if (!staff) return { success: false, error: 'Not authenticated' }
  if (staff.role !== 'lab_tech' && staff.role !== 'admin') {
    return { success: false, error: 'Only lab techs and admins can edit stock' }
  }

  const testCode = String(formData.get('test_code') ?? '').trim() || null
  const testName = String(formData.get('test_name') ?? '').trim()
  const category = String(formData.get('category') ?? '').trim()
  const unit = String(formData.get('unit') ?? '').trim()
  const initialQty = Number(formData.get('initial_quantity') ?? 0)
  const lowThreshold = Number(formData.get('low_stock_threshold') ?? 5)
  const batchNumber = String(formData.get('batch_number') ?? '').trim() || null
  const expiresAt = String(formData.get('expires_at') ?? '').trim() || null
  const supplier = String(formData.get('supplier') ?? '').trim() || null
  const notes = String(formData.get('notes') ?? '').trim() || null

  if (!testName || !category || !unit) {
    return { success: false, error: 'Name, category, and unit are required' }
  }

  const supabase = createServiceClient()

  const { data: item, error } = await supabase
    .from('lab_stock_items')
    .insert({
      clinic_id: staff.clinic_id,
      test_code: testCode,
      test_name: testName,
      category,
      unit,
      quantity_on_hand: 0,
      low_stock_threshold: lowThreshold,
      batch_number: batchNumber,
      expires_at: expiresAt,
      supplier,
      notes,
    })
    .select('id')
    .single()

  if (error || !item) {
    return { success: false, error: error?.message ?? 'Failed to create lab stock item' }
  }

  if (initialQty > 0) {
    const { error: movementError } = await supabase
      .from('lab_stock_movements')
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

  revalidatePath('/dashboard/lab/stock')
  return { success: true }
}

export async function recordLabStockMovement(formData: FormData): Promise<ActionResult> {
  const staff = await getStaff()
  if (!staff) return { success: false, error: 'Not authenticated' }
  if (staff.role !== 'lab_tech' && staff.role !== 'admin') {
    return { success: false, error: 'Only lab techs and admins can adjust stock' }
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

  const negativeKinds = new Set(['consumed', 'expired', 'transferred_out'])
  const positiveKinds = new Set(['received', 'transferred_in'])
  const delta = positiveKinds.has(movementType)
    ? Math.abs(rawQty)
    : negativeKinds.has(movementType)
      ? -Math.abs(rawQty)
      : rawQty

  const supabase = createServiceClient()

  const { data: item, error: itemErr } = await supabase
    .from('lab_stock_items')
    .select('id, clinic_id')
    .eq('id', stockItemId)
    .single()
  if (itemErr || !item || item.clinic_id !== staff.clinic_id) {
    return { success: false, error: 'Stock item not found' }
  }

  const { error } = await supabase
    .from('lab_stock_movements')
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

  revalidatePath('/dashboard/lab/stock')
  revalidatePath('/dashboard/stock-overview')
  return { success: true }
}

export async function setLabStockActive(id: string, active: boolean): Promise<ActionResult> {
  const staff = await getStaff()
  if (!staff) return { success: false, error: 'Not authenticated' }
  if (staff.role !== 'lab_tech' && staff.role !== 'admin') {
    return { success: false, error: 'Only lab techs and admins can edit stock' }
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('lab_stock_items')
    .update({ active })
    .eq('id', id)
    .eq('clinic_id', staff.clinic_id)

  if (error) return { success: false, error: error.message }
  revalidatePath('/dashboard/lab/stock')
  return { success: true }
}
