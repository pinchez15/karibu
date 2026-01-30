import { auth, currentUser } from '@clerk/nextjs/server'
import { createServiceClient } from './supabase'
import type { Staff } from '@karibu/shared'

/**
 * Get the current staff member from Clerk auth
 * Must be called from a Server Component or API route
 */
export async function getStaff(): Promise<Staff | null> {
  const { userId } = await auth()

  if (!userId) {
    return null
  }

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('staff')
    .select('*')
    .eq('clerk_user_id', userId)
    .eq('is_active', true)
    .single()

  if (error || !data) {
    return null
  }

  return data as Staff
}

/**
 * Get the current staff member, throwing if not authenticated
 */
export async function requireStaff(): Promise<Staff> {
  const staff = await getStaff()

  if (!staff) {
    throw new Error('Unauthorized: Staff record not found')
  }

  return staff
}

/**
 * Get the current user's clinic ID
 */
export async function getClinicId(): Promise<string | null> {
  const staff = await getStaff()
  return staff?.clinic_id ?? null
}

/**
 * Check if current user has a specific role
 */
export async function hasRole(role: 'admin' | 'doctor' | 'nurse'): Promise<boolean> {
  const staff = await getStaff()
  if (!staff) return false

  // Admins have access to everything
  if (staff.role === 'admin') return true

  return staff.role === role
}

/**
 * Check if current user is an admin
 */
export async function isAdmin(): Promise<boolean> {
  const staff = await getStaff()
  return staff?.role === 'admin'
}
