'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { getStaff, isAdmin } from '@/lib/auth'
import { assertStaffRole } from '@/lib/staff-roles'
import { inviteStaffToClinic, resendStaffInvitation, revokeStaffInvitation, updateClinicStaffRole } from '@/lib/staff-provisioning'
import { formatClerkInviteError } from '@/lib/clerk-org-errors'
import { createServiceClient } from '@/lib/supabase'
import type { StaffRole } from '@karibu/shared'

async function requireClinicAdmin() {
  const staff = await getStaff()
  if (!staff) throw new Error('Not authenticated')
  if (!(await isAdmin())) throw new Error('Not authorized')
  return staff
}

export async function inviteClinicStaffAction(formData: FormData) {
  const actor = await requireClinicAdmin()
  const { userId } = await auth()
  if (!userId) throw new Error('Unauthorized')

  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const firstName = String(formData.get('first_name') ?? '').trim()
  const lastName = String(formData.get('last_name') ?? '').trim()
  const role = assertStaffRole(String(formData.get('role') ?? ''))

  if (!email) throw new Error('Email is required')

  try {
    const result = await inviteStaffToClinic({
      clinicId: actor.clinic_id,
      email,
      firstName,
      lastName,
      role,
      invitedByClerkUserId: userId,
      invitedByStaffId: actor.id,
    })

    revalidatePath('/dashboard/admin/staff')
    return result
  } catch (err) {
    throw new Error(formatClerkInviteError(err))
  }
}

export async function revokeStaffInvitationAction(
  invitationId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const actor = await requireClinicAdmin()
    const { userId } = await auth()
    if (!userId) return { success: false, error: 'Unauthorized' }

    const supabase = createServiceClient()
    const { data: clinic } = await supabase
      .from('clinics')
      .select('clerk_organization_id')
      .eq('id', actor.clinic_id)
      .single()

    if (!clinic?.clerk_organization_id) {
      return { success: false, error: 'Clinic sign-in is not configured' }
    }

    await revokeStaffInvitation({
      invitationRowId: invitationId,
      clinicId: actor.clinic_id,
      clerkOrganizationId: clinic.clerk_organization_id,
      requestingClerkUserId: userId,
    })

    revalidatePath('/dashboard/admin/staff')
    return { success: true }
  } catch (err) {
    return { success: false, error: formatClerkInviteError(err) }
  }
}

export async function resendStaffInvitationAction(
  invitationId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const actor = await requireClinicAdmin()
    const { userId } = await auth()
    if (!userId) return { success: false, error: 'Unauthorized' }

    await resendStaffInvitation({
      invitationRowId: invitationId,
      clinicId: actor.clinic_id,
      invitedByClerkUserId: userId,
      invitedByStaffId: actor.id,
    })

    revalidatePath('/dashboard/admin/staff')
    return { success: true }
  } catch (err) {
    return { success: false, error: formatClerkInviteError(err) }
  }
}

export async function updateStaffRole(
  staffId: string,
  newRole: StaffRole,
): Promise<{ success: boolean; error?: string }> {
  try {
    const actor = await requireClinicAdmin()
    assertStaffRole(newRole)

    await updateClinicStaffRole({
      staffId,
      clinicId: actor.clinic_id,
      role: newRole,
      isActive: true,
    })

    revalidatePath('/dashboard/admin/staff')
    return { success: true }
  } catch (err) {
    console.error('Failed to update staff role:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update role',
    }
  }
}

export async function toggleStaffActive(
  staffId: string,
  activate: boolean,
): Promise<{ success: boolean; error?: string }> {
  try {
    const actor = await requireClinicAdmin()
    const supabase = createServiceClient()

    const { data: member, error: lookupError } = await supabase
      .from('staff')
      .select('role, clerk_user_id')
      .eq('id', staffId)
      .eq('clinic_id', actor.clinic_id)
      .single()

    if (lookupError || !member) {
      return { success: false, error: 'Staff member not found' }
    }

    await updateClinicStaffRole({
      staffId,
      clinicId: actor.clinic_id,
      role: member.role as StaffRole,
      isActive: activate,
    })

    revalidatePath('/dashboard/admin/staff')
    return { success: true }
  } catch (err) {
    console.error('Failed to toggle staff active status:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update staff member',
    }
  }
}
