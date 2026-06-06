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

export async function isSuperadmin(): Promise<boolean> {
  const { userId } = await auth()
  if (!userId) return false

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('superadmins')
    .select('id')
    .eq('clerk_user_id', userId)
    .eq('is_active', true)
    .maybeSingle()

  return Boolean(data)
}

export async function hasProvisioningAccess(): Promise<boolean> {
  if (await isSuperadmin()) {
    return true
  }

  const supabase = createServiceClient()
  const { count } = await supabase
    .from('superadmins')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)

  // Bootstrap fallback before the first superadmin row is seeded.
  if ((count ?? 0) === 0) {
    return isAdmin()
  }

  return false
}

export async function requireProvisioningAccess(): Promise<{ userId: string; email: string | null; displayName: string | null }> {
  const { userId } = await auth()
  if (!userId) {
    throw new Error('Unauthorized')
  }

  const allowed = await hasProvisioningAccess()
  if (!allowed) {
    throw new Error('Not authorized')
  }

  const user = await currentUser()
  const email = user?.emailAddresses.find((entry) => entry.id === user.primaryEmailAddressId)?.emailAddress
    ?? user?.emailAddresses[0]?.emailAddress
    ?? null
  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.username || null

  return {
    userId,
    email,
    displayName,
  }
}

/**
 * Region-outbreak control surface.
 *
 * Returns `'all'` for platform superadmins, otherwise the list of dioceses the
 * current user coordinates (active rows in `diocese_coordinators`). An empty
 * array means the user has no outbreak-control access.
 */
export async function getCoordinatorScope(): Promise<'all' | string[]> {
  if (await isSuperadmin()) {
    return 'all'
  }

  const { userId } = await auth()
  if (!userId) return []

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('diocese_coordinators')
    .select('diocese')
    .eq('clerk_user_id', userId)
    .eq('is_active', true)

  return (data ?? []).map((row) => row.diocese as string)
}

export function scopeCoversDiocese(scope: 'all' | string[], diocese: string | null): boolean {
  if (scope === 'all') return true
  if (!diocese) return false
  return scope.includes(diocese)
}

export async function requireOutbreakAccess(): Promise<{
  userId: string
  email: string | null
  displayName: string | null
  scope: 'all' | string[]
}> {
  const { userId } = await auth()
  if (!userId) {
    throw new Error('Unauthorized')
  }

  const scope = await getCoordinatorScope()
  if (scope !== 'all' && scope.length === 0) {
    throw new Error('Not authorized to manage region protocols')
  }

  const user = await currentUser()
  const email = user?.emailAddresses.find((entry) => entry.id === user.primaryEmailAddressId)?.emailAddress
    ?? user?.emailAddresses[0]?.emailAddress
    ?? null
  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.username || null

  return { userId, email, displayName, scope }
}
