'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { createServiceClient } from '@/lib/supabase'
import { getStaff, isAdmin } from '@/lib/auth'
import { clinicCatalogTag } from '@/lib/clinic-catalog'

/**
 * Inventory management — what labs + drugs are available at this clinic.
 * Drives both the operational reality (clinicians know what they can order
 * here) and the AI prompt constraint (the review function only suggests
 * tests/drugs that are on the clinic's list, prefixing other suggestions
 * with "If available, consider...").
 *
 * Admin-only writes. Service-role client bypasses RLS; we explicitly
 * scope every UPDATE/INSERT by the caller's clinic_id.
 */

async function assertAdmin() {
  const staff = await getStaff()
  if (!staff) throw new Error('Not signed in')
  const admin = await isAdmin()
  if (!admin) throw new Error('Admin role required')
  return staff
}

export async function setLabAvailability(
  testName: string,
  isAvailable: boolean,
  notes?: string,
): Promise<{ success: true } | { success: false; error: string }> {
  let staff
  try {
    staff = await assertAdmin()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('clinic_lab_capabilities')
    .upsert(
      {
        clinic_id: staff.clinic_id,
        test_name: testName.trim(),
        is_available: isAvailable,
        notes: notes?.trim() || null,
        last_updated_by: staff.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'clinic_id,test_name' },
    )
  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/admin/inventory')
  revalidateTag(clinicCatalogTag(staff.clinic_id), 'max')
  return { success: true }
}

export async function setDrugAvailability(
  drugName: string,
  inStock: boolean,
  notes?: string,
): Promise<{ success: true } | { success: false; error: string }> {
  let staff
  try {
    staff = await assertAdmin()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('clinic_pharmacy_formulary')
    .upsert(
      {
        clinic_id: staff.clinic_id,
        drug_name: drugName.trim(),
        in_stock: inStock,
        notes: notes?.trim() || null,
        last_updated_by: staff.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'clinic_id,drug_name' },
    )
  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/admin/inventory')
  revalidateTag(clinicCatalogTag(staff.clinic_id), 'max')
  return { success: true }
}

export async function updateLabCatalogFields(
  testName: string,
  fields: {
    code?: string | null
    category?: string | null
    display_order?: number
    active?: boolean
  },
): Promise<{ success: true } | { success: false; error: string }> {
  let staff
  try {
    staff = await assertAdmin()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }

  const patch: Record<string, unknown> = {
    last_updated_by: staff.id,
    updated_at: new Date().toISOString(),
  }
  if (fields.code !== undefined) patch.code = fields.code?.trim() || null
  if (fields.category !== undefined) patch.category = fields.category?.trim() || null
  if (fields.display_order !== undefined) patch.display_order = fields.display_order
  if (fields.active !== undefined) patch.active = fields.active

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('clinic_lab_capabilities')
    .update(patch)
    .eq('clinic_id', staff.clinic_id)
    .eq('test_name', testName.trim())
  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/admin/inventory')
  return { success: true }
}

export async function updateDrugCatalogFields(
  drugName: string,
  fields: {
    code?: string | null
    category?: string | null
    display_order?: number
    active?: boolean
  },
): Promise<{ success: true } | { success: false; error: string }> {
  let staff
  try {
    staff = await assertAdmin()
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }

  const patch: Record<string, unknown> = {
    last_updated_by: staff.id,
    updated_at: new Date().toISOString(),
  }
  if (fields.code !== undefined) patch.code = fields.code?.trim() || null
  if (fields.category !== undefined) patch.category = fields.category?.trim() || null
  if (fields.display_order !== undefined) patch.display_order = fields.display_order
  if (fields.active !== undefined) patch.active = fields.active

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('clinic_pharmacy_formulary')
    .update(patch)
    .eq('clinic_id', staff.clinic_id)
    .eq('drug_name', drugName.trim())
  if (error) return { success: false, error: error.message }

  revalidatePath('/dashboard/admin/inventory')
  revalidateTag(clinicCatalogTag(staff.clinic_id), 'max')
  return { success: true }
}

export async function addCustomLab(
  testName: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const trimmed = testName.trim()
  if (trimmed.length < 2) return { success: false, error: 'Test name is too short' }
  return setLabAvailability(trimmed, true)
}

export async function addCustomDrug(
  drugName: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const trimmed = drugName.trim()
  if (trimmed.length < 2) return { success: false, error: 'Drug name is too short' }
  return setDrugAvailability(trimmed, true)
}
