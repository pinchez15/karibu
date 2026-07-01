import { clerkClient } from '@clerk/nextjs/server'
import { createServiceClient } from '@/lib/supabase'
import { getSiteUrl } from '@/lib/site-url'
import { assertStaffRole } from '@/lib/staff-roles'
import { formatClerkInviteError } from '@/lib/clerk-org-errors'
import type { StaffRole } from '@karibu/shared'

function orgRoleFor(role: StaffRole): 'org:admin' | 'org:member' {
  return role === 'admin' ? 'org:admin' : 'org:member'
}

export async function upsertStaffRecord(params: {
  clerkUserId: string
  clinicId: string
  email: string
  displayName: string
  role: StaffRole
}) {
  const supabase = createServiceClient()
  const { clerkUserId, clinicId, email, displayName, role } = params

  const { data: existing, error: lookupError } = await supabase
    .from('staff')
    .select('id')
    .eq('clerk_user_id', clerkUserId)
    .maybeSingle()

  if (lookupError) throw lookupError

  if (existing) {
    const { error } = await supabase
      .from('staff')
      .update({
        clinic_id: clinicId,
        email,
        display_name: displayName,
        role,
        is_active: true,
        deactivated_at: null,
      })
      .eq('id', existing.id)

    if (error) throw error
    return
  }

  const { error } = await supabase
    .from('staff')
    .insert({
      clerk_user_id: clerkUserId,
      clinic_id: clinicId,
      email,
      display_name: displayName,
      role,
      is_active: true,
      deactivated_at: null,
    })

  if (error) throw error
}

export async function syncMembershipRole(params: {
  organizationId: string
  userId: string
  role: StaffRole
}) {
  const clerk = await clerkClient()
  const desiredRole = orgRoleFor(params.role)
  const memberships = await clerk.organizations.getOrganizationMembershipList({
    organizationId: params.organizationId,
    userId: [params.userId],
    limit: 10,
  })
  const membership = memberships.data[0]
  if (!membership) return
  if (membership.role === desiredRole) return
  await clerk.organizations.updateOrganizationMembership({
    organizationId: params.organizationId,
    userId: params.userId,
    role: desiredRole,
  })
}

export async function inviteStaffToClinic(params: {
  clinicId: string
  email: string
  firstName: string
  lastName: string
  role: StaffRole
  invitedByClerkUserId: string
  invitedByStaffId?: string | null
}) {
  const email = params.email.trim().toLowerCase()
  const displayName =
    [params.firstName, params.lastName].filter(Boolean).join(' ') || email.split('@')[0]
  const role = assertStaffRole(params.role)

  const supabase = createServiceClient()
  const { data: clinic, error: clinicError } = await supabase
    .from('clinics')
    .select('id, clerk_organization_id')
    .eq('id', params.clinicId)
    .single()

  if (clinicError || !clinic?.clerk_organization_id) {
    throw clinicError ?? new Error('Clinic is not linked to sign-in for this site')
  }

  const clerk = await clerkClient()
  const existingUsers = await clerk.users.getUserList({
    emailAddress: [email],
    limit: 10,
  })
  const existingUser = existingUsers.data[0]

  if (existingUser) {
    const memberships = await clerk.organizations.getOrganizationMembershipList({
      organizationId: clinic.clerk_organization_id,
      userId: [existingUser.id],
      limit: 10,
    })

    if (!memberships.data[0]) {
      try {
        await clerk.organizations.createOrganizationMembership({
          organizationId: clinic.clerk_organization_id,
          userId: existingUser.id,
          role: orgRoleFor(role),
        })
      } catch (error) {
        throw new Error(formatClerkInviteError(error))
      }
    } else {
      await syncMembershipRole({
        organizationId: clinic.clerk_organization_id,
        userId: existingUser.id,
        role,
      })
    }

    await upsertStaffRecord({
      clerkUserId: existingUser.id,
      clinicId: params.clinicId,
      email,
      displayName,
      role,
    })

    await supabase.from('staff_invitations').upsert(
      {
        clinic_id: params.clinicId,
        clerk_organization_id: clinic.clerk_organization_id,
        email,
        display_name: displayName,
        role,
        status: 'accepted',
        invited_by_clerk_user_id: params.invitedByClerkUserId,
        invited_by_staff_id: params.invitedByStaffId ?? null,
        accepted_at: new Date().toISOString(),
      },
      { onConflict: 'clinic_id,email,status' },
    )

    return { status: 'provisioned' as const, email, displayName }
  }

  const { data: stalePending } = await supabase
    .from('staff_invitations')
    .select('id')
    .eq('clinic_id', params.clinicId)
    .eq('email', email)
    .eq('status', 'pending')
    .maybeSingle()

  if (stalePending) {
    await revokeStaffInvitation({
      invitationRowId: stalePending.id,
      clinicId: params.clinicId,
      clerkOrganizationId: clinic.clerk_organization_id,
      requestingClerkUserId: params.invitedByClerkUserId,
    })
  }

  let invitation
  try {
    invitation = await clerk.organizations.createOrganizationInvitation({
      organizationId: clinic.clerk_organization_id,
      emailAddress: email,
      role: orgRoleFor(role),
      inviterUserId: params.invitedByClerkUserId,
      redirectUrl: `${getSiteUrl()}/accept-invitation`,
    })
  } catch (error) {
    throw new Error(formatClerkInviteError(error))
  }

  const { error } = await supabase.from('staff_invitations').upsert(
    {
      clinic_id: params.clinicId,
      clerk_organization_id: clinic.clerk_organization_id,
      clerk_invitation_id: invitation.id,
      email,
      display_name: displayName,
      role,
      status: 'pending',
      invited_by_staff_id: params.invitedByStaffId ?? null,
      invited_by_clerk_user_id: params.invitedByClerkUserId,
    },
    { onConflict: 'clerk_invitation_id' },
  )

  if (error) throw error

  return { status: 'invited' as const, email, displayName }
}

export async function revokeStaffInvitation(params: {
  invitationRowId: string
  clinicId: string
  clerkOrganizationId: string
  requestingClerkUserId: string
}) {
  const supabase = createServiceClient()
  const { data: row, error: lookupError } = await supabase
    .from('staff_invitations')
    .select('id, clerk_invitation_id, status')
    .eq('id', params.invitationRowId)
    .eq('clinic_id', params.clinicId)
    .eq('status', 'pending')
    .maybeSingle()

  if (lookupError) throw lookupError
  if (!row) return

  if (row.clerk_invitation_id) {
    const clerk = await clerkClient()
    try {
      await clerk.organizations.revokeOrganizationInvitation({
        organizationId: params.clerkOrganizationId,
        invitationId: row.clerk_invitation_id,
        requestingUserId: params.requestingClerkUserId,
      })
    } catch (error) {
      const code = (error as { errors?: Array<{ code?: string }> }).errors?.[0]?.code
      if (code && !['resource_not_found', 'invitation_not_found'].includes(code)) {
        throw new Error(formatClerkInviteError(error))
      }
    }
  }

  const { error: updateError } = await supabase
    .from('staff_invitations')
    .update({ status: 'revoked' })
    .eq('id', params.invitationRowId)
    .eq('clinic_id', params.clinicId)

  if (updateError) throw updateError
}

export async function resendStaffInvitation(params: {
  invitationRowId: string
  clinicId: string
  invitedByClerkUserId: string
  invitedByStaffId: string
}) {
  const supabase = createServiceClient()
  const { data: row, error: lookupError } = await supabase
    .from('staff_invitations')
    .select('id, email, display_name, role, clinic_id')
    .eq('id', params.invitationRowId)
    .eq('clinic_id', params.clinicId)
    .eq('status', 'pending')
    .maybeSingle()

  if (lookupError) throw lookupError
  if (!row) throw new Error('Invitation not found or already accepted')

  const { data: clinic } = await supabase
    .from('clinics')
    .select('clerk_organization_id')
    .eq('id', params.clinicId)
    .single()

  if (!clinic?.clerk_organization_id) {
    throw new Error('Clinic is not linked to sign-in for this site')
  }

  await revokeStaffInvitation({
    invitationRowId: row.id,
    clinicId: params.clinicId,
    clerkOrganizationId: clinic.clerk_organization_id,
    requestingClerkUserId: params.invitedByClerkUserId,
  })

  const parts = row.display_name.trim().split(/\s+/)
  const firstName = parts[0] ?? ''
  const lastName = parts.slice(1).join(' ')

  return inviteStaffToClinic({
    clinicId: params.clinicId,
    email: row.email,
    firstName,
    lastName,
    role: assertStaffRole(row.role),
    invitedByClerkUserId: params.invitedByClerkUserId,
    invitedByStaffId: params.invitedByStaffId,
  })
}

export async function updateClinicStaffRole(params: {
  staffId: string
  clinicId: string
  role: StaffRole
  isActive: boolean
}) {
  const role = assertStaffRole(params.role)
  const supabase = createServiceClient()

  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .select('clerk_user_id, clinic:clinics!staff_clinic_id_fkey(clerk_organization_id)')
    .eq('id', params.staffId)
    .single()

  if (staffError || !staff) {
    throw staffError ?? new Error('Staff member not found')
  }

  const { error } = await supabase
    .from('staff')
    .update({
      role,
      is_active: params.isActive,
      deactivated_at: params.isActive ? null : new Date().toISOString(),
    })
    .eq('id', params.staffId)
    .eq('clinic_id', params.clinicId)

  if (error) throw error

  const organizationId = Array.isArray(staff.clinic)
    ? staff.clinic[0]?.clerk_organization_id
    : (staff.clinic as { clerk_organization_id?: string } | null)?.clerk_organization_id

  if (staff.clerk_user_id && organizationId) {
    await syncMembershipRole({
      organizationId,
      userId: staff.clerk_user_id,
      role,
    })
  }
}
