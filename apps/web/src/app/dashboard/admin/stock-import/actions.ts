'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { broadcastClinicRefresh } from '@/lib/realtime-server'
import { clinicCatalogTag } from '@/lib/clinic-catalog'
import {
  type LabImportRow,
  type PharmacyImportRow,
  labImportRowSchema,
  pharmacyImportRowSchema,
} from '@/lib/stock-import/schemas'

export type ImportRowResult = {
  row: number
  name: string
  status: 'created' | 'updated' | 'skipped' | 'error'
  message?: string
}

export type BulkImportResult = {
  success: boolean
  results: ImportRowResult[]
  error?: string
}

function canImportPharmacy(role: string): boolean {
  return role === 'admin' || role === 'dispenser'
}

function canImportLab(role: string): boolean {
  return role === 'admin' || role === 'lab_tech'
}

function deriveDrugCode(name: string, code?: string): string {
  if (code?.trim()) return code.trim().toUpperCase()
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40) || 'ITEM'
}

async function upsertPharmacyRow(
  clinicId: string,
  staffId: string,
  row: PharmacyImportRow,
  rowIndex: number,
): Promise<ImportRowResult> {
  const supabase = createServiceClient()
  const drugCode = deriveDrugCode(row.name, row.code)

  let existingQuery = supabase
    .from('pharmacy_stock_items')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('drug_code', drugCode)
    .eq('formulation', row.formulation)

  existingQuery = row.strength
    ? existingQuery.eq('strength', row.strength)
    : existingQuery.is('strength', null)

  const { data: existing } = await existingQuery.maybeSingle()

  if (existing) {
    const { error: updateErr } = await supabase
      .from('pharmacy_stock_items')
      .update({
        drug_name: row.name,
        unit: row.unit,
        unit_price_ugx: row.unit_price_ugx,
        low_stock_threshold: row.low_at,
        batch_number: row.batch,
        expires_at: row.expires,
        supplier: row.supplier,
        notes: row.notes,
        active: true,
        is_unavailable: false,
      })
      .eq('id', existing.id)

    if (updateErr) {
      return { row: rowIndex, name: row.name, status: 'error', message: updateErr.message }
    }

    if (row.quantity > 0) {
      const { error: movErr } = await supabase.from('pharmacy_stock_movements').insert({
        stock_item_id: existing.id,
        clinic_id: clinicId,
        movement_type: 'received',
        quantity_delta: row.quantity,
        recorded_by: staffId,
        batch_number: row.batch,
        expires_at: row.expires,
        notes: 'Bulk import',
      })
      if (movErr) {
        return { row: rowIndex, name: row.name, status: 'error', message: movErr.message }
      }
    }

    return {
      row: rowIndex,
      name: row.name,
      status: 'updated',
      message: row.quantity > 0 ? `Added ${row.quantity} to existing item` : 'Updated metadata',
    }
  }

  const { data: item, error } = await supabase
    .from('pharmacy_stock_items')
    .insert({
      clinic_id: clinicId,
      drug_code: drugCode,
      drug_name: row.name,
      formulation: row.formulation,
      strength: row.strength,
      unit: row.unit,
      quantity_on_hand: 0,
      unit_price_ugx: row.unit_price_ugx,
      low_stock_threshold: row.low_at,
      batch_number: row.batch,
      expires_at: row.expires,
      supplier: row.supplier,
      notes: row.notes,
    })
    .select('id')
    .single()

  if (error || !item) {
    return { row: rowIndex, name: row.name, status: 'error', message: error?.message ?? 'Insert failed' }
  }

  if (row.quantity > 0) {
    const { error: movErr } = await supabase.from('pharmacy_stock_movements').insert({
      stock_item_id: item.id,
      clinic_id: clinicId,
      movement_type: 'received',
      quantity_delta: row.quantity,
      recorded_by: staffId,
      batch_number: row.batch,
      expires_at: row.expires,
      notes: 'Opening balance (bulk import)',
    })
    if (movErr) {
      return { row: rowIndex, name: row.name, status: 'error', message: movErr.message }
    }
  }

  return { row: rowIndex, name: row.name, status: 'created' }
}

async function upsertLabRow(
  clinicId: string,
  staffId: string,
  row: LabImportRow,
  rowIndex: number,
): Promise<ImportRowResult> {
  const supabase = createServiceClient()

  let query = supabase
    .from('lab_stock_items')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('test_name', row.name)

  if (row.batch) {
    query = query.eq('batch_number', row.batch)
  } else {
    query = query.is('batch_number', null)
  }

  const { data: existing } = await query.maybeSingle()

  if (existing) {
    const { error: updateErr } = await supabase
      .from('lab_stock_items')
      .update({
        test_code: row.code,
        category: row.category,
        unit: row.unit,
        unit_price_ugx: row.unit_price_ugx,
        low_stock_threshold: row.low_at,
        expires_at: row.expires,
        supplier: row.supplier,
        notes: row.notes,
        active: true,
      })
      .eq('id', existing.id)

    if (updateErr) {
      return { row: rowIndex, name: row.name, status: 'error', message: updateErr.message }
    }

    if (row.quantity > 0) {
      const { error: movErr } = await supabase.from('lab_stock_movements').insert({
        stock_item_id: existing.id,
        clinic_id: clinicId,
        movement_type: 'received',
        quantity_delta: row.quantity,
        recorded_by: staffId,
        batch_number: row.batch,
        expires_at: row.expires,
        notes: 'Bulk import',
      })
      if (movErr) {
        return { row: rowIndex, name: row.name, status: 'error', message: movErr.message }
      }
    }

    return {
      row: rowIndex,
      name: row.name,
      status: 'updated',
      message: row.quantity > 0 ? `Added ${row.quantity} to existing item` : 'Updated metadata',
    }
  }

  const { data: item, error } = await supabase
    .from('lab_stock_items')
    .insert({
      clinic_id: clinicId,
      test_code: row.code,
      test_name: row.name,
      category: row.category,
      unit: row.unit,
      quantity_on_hand: 0,
      unit_price_ugx: row.unit_price_ugx,
      low_stock_threshold: row.low_at,
      batch_number: row.batch,
      expires_at: row.expires,
      supplier: row.supplier,
      notes: row.notes,
    })
    .select('id')
    .single()

  if (error || !item) {
    return { row: rowIndex, name: row.name, status: 'error', message: error?.message ?? 'Insert failed' }
  }

  if (row.quantity > 0) {
    const { error: movErr } = await supabase.from('lab_stock_movements').insert({
      stock_item_id: item.id,
      clinic_id: clinicId,
      movement_type: 'received',
      quantity_delta: row.quantity,
      recorded_by: staffId,
      batch_number: row.batch,
      expires_at: row.expires,
      notes: 'Opening balance (bulk import)',
    })
    if (movErr) {
      return { row: rowIndex, name: row.name, status: 'error', message: movErr.message }
    }
  }

  return { row: rowIndex, name: row.name, status: 'created' }
}

export async function bulkImportPharmacyStock(
  rawRows: Record<string, string>[],
): Promise<BulkImportResult> {
  const staff = await getStaff()
  if (!staff) return { success: false, results: [], error: 'Not authenticated' }
  if (!canImportPharmacy(staff.role)) {
    return { success: false, results: [], error: 'Only admins and dispensers can import pharmacy stock' }
  }

  const nonEmpty = rawRows.filter((r) => (r.name ?? '').trim().length > 0)
  if (nonEmpty.length === 0) {
    return { success: false, results: [], error: 'No rows to import — add at least one drug name' }
  }

  const results: ImportRowResult[] = []
  for (let i = 0; i < nonEmpty.length; i++) {
    const parsed = pharmacyImportRowSchema.safeParse(nonEmpty[i])
    if (!parsed.success) {
      results.push({
        row: i + 1,
        name: nonEmpty[i].name ?? '(blank)',
        status: 'error',
        message: parsed.error.issues.map((issue) => issue.message).join('; '),
      })
      continue
    }
    results.push(await upsertPharmacyRow(staff.clinic_id, staff.id, parsed.data, i + 1))
  }

  const hasError = results.some((r) => r.status === 'error')
  revalidatePath('/dashboard/pharmacy/stock')
  revalidatePath('/dashboard/stock-overview')
  revalidatePath('/dashboard/admin/stock-import')
  revalidateTag(clinicCatalogTag(staff.clinic_id), 'max')
  void broadcastClinicRefresh(staff.clinic_id)

  return { success: !hasError, results }
}

export async function bulkImportLabStock(
  rawRows: Record<string, string>[],
  defaultCategory?: string,
): Promise<BulkImportResult> {
  const staff = await getStaff()
  if (!staff) return { success: false, results: [], error: 'Not authenticated' }
  if (!canImportLab(staff.role)) {
    return { success: false, results: [], error: 'Only admins and lab techs can import lab stock' }
  }

  const nonEmpty = rawRows.filter((r) => (r.name ?? '').trim().length > 0)
  if (nonEmpty.length === 0) {
    return { success: false, results: [], error: 'No rows to import — add at least one item name' }
  }

  const results: ImportRowResult[] = []
  for (let i = 0; i < nonEmpty.length; i++) {
    const rowInput = { ...nonEmpty[i] }
    if (defaultCategory && !rowInput.category?.trim()) {
      rowInput.category = defaultCategory
    }
    const parsed = labImportRowSchema.safeParse(rowInput)
    if (!parsed.success) {
      results.push({
        row: i + 1,
        name: nonEmpty[i].name ?? '(blank)',
        status: 'error',
        message: parsed.error.issues.map((issue) => issue.message).join('; '),
      })
      continue
    }
    results.push(await upsertLabRow(staff.clinic_id, staff.id, parsed.data, i + 1))
  }

  const hasError = results.some((r) => r.status === 'error')
  revalidatePath('/dashboard/lab/stock')
  revalidatePath('/dashboard/stock-overview')
  revalidatePath('/dashboard/admin/stock-import')
  revalidateTag(clinicCatalogTag(staff.clinic_id), 'max')
  void broadcastClinicRefresh(staff.clinic_id)

  return { success: !hasError, results }
}
