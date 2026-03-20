'use server'

import { createServiceClient } from '@/lib/supabase'
import { getStaff, isAdmin } from '@/lib/auth'

export async function updateStaffRole(
  staffId: string,
  newRole: 'admin' | 'doctor' | 'nurse'
): Promise<{ success: boolean; error?: string }> {
  const currentStaff = await getStaff()
  if (!currentStaff) return { success: false, error: 'Not authenticated' }

  const admin = await isAdmin()
  if (!admin) return { success: false, error: 'Not authorized' }

  const supabase = createServiceClient()

  const { error } = await supabase
    .from('staff')
    .update({ role: newRole })
    .eq('id', staffId)
    .eq('clinic_id', currentStaff.clinic_id)

  if (error) {
    console.error('Failed to update staff role:', error)
    return { success: false, error: 'Failed to update role' }
  }

  return { success: true }
}

export async function toggleStaffActive(
  staffId: string,
  activate: boolean
): Promise<{ success: boolean; error?: string }> {
  const currentStaff = await getStaff()
  if (!currentStaff) return { success: false, error: 'Not authenticated' }

  const admin = await isAdmin()
  if (!admin) return { success: false, error: 'Not authorized' }

  const supabase = createServiceClient()

  const { error } = await supabase
    .from('staff')
    .update({
      is_active: activate,
      deactivated_at: activate ? null : new Date().toISOString(),
    })
    .eq('id', staffId)
    .eq('clinic_id', currentStaff.clinic_id)

  if (error) {
    console.error('Failed to toggle staff active status:', error)
    return { success: false, error: 'Failed to update staff member' }
  }

  return { success: true }
}
