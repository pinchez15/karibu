'use server'

import { auth, clerkClient } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase'
import { requireProvisioningAccess, requireStaff } from '@/lib/auth'

const DEPARTMENTS = ['opd', 'anc', 'maternity', 'family_planning', 'immunization'] as const
const STAFF_ROLES = [
  'admin',
  'doctor',
  'nurse',
  'clinical_officer',
  'midwife',
  'nursing_assistant',
  'records_officer',
  'lab_tech',
  'dispenser',
] as const

type Department = typeof DEPARTMENTS[number]
type StaffRole = typeof STAFF_ROLES[number]

function asText(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value.trim() : ''
}

function assertDepartmentList(values: FormDataEntryValue[]): Department[] {
  return values
    .map((value) => (typeof value === 'string' ? value : ''))
    .filter((value): value is Department => (DEPARTMENTS as readonly string[]).includes(value))
}

function assertRole(value: FormDataEntryValue | null): StaffRole {
  const role = typeof value === 'string' ? value : ''
  if (!(STAFF_ROLES as readonly string[]).includes(role)) {
    throw new Error('Invalid staff role')
  }
  return role as StaffRole
}

function orgRoleFor(role: StaffRole): 'org:admin' | 'org:member' {
  return role === 'admin' ? 'org:admin' : 'org:member'
}

async function saveClinicDepartments(clinicId: string, departments: Department[]) {
  const supabase = createServiceClient()
  await supabase.from('clinic_departments').delete().eq('clinic_id', clinicId)

  if (departments.length > 0) {
    const rows = departments.map((department) => ({ clinic_id: clinicId, department }))
    const { error } = await supabase.from('clinic_departments').insert(rows)
    if (error) throw error
  }
}

async function upsertStaffRecord(params: {
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

async function syncMembershipRole(params: {
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

export async function createClinicAction(formData: FormData) {
  const actor = await requireProvisioningAccess()
  const { userId } = await auth()
  if (!userId) throw new Error('Unauthorized')

  const name = asText(formData.get('name'))
  const slug = asText(formData.get('slug'))
  const timezone = asText(formData.get('timezone')) || 'Africa/Kampala'
  const departments = assertDepartmentList(formData.getAll('departments'))

  if (!name || !slug) {
    throw new Error('Clinic name and slug are required')
  }

  const clerk = await clerkClient()
  const organization = await clerk.organizations.createOrganization({
    name,
    slug,
    createdBy: userId,
  })

  const supabase = createServiceClient()
  const { data: clinic, error } = await supabase
    .from('clinics')
    .insert({
      name,
      slug,
      timezone,
      phone: asText(formData.get('phone')) || null,
      umdpc_number: asText(formData.get('umdpc_number')) || null,
      diocese: asText(formData.get('diocese')) || null,
      district: asText(formData.get('district')) || null,
      subcounty: asText(formData.get('subcounty')) || null,
      parish: asText(formData.get('parish')) || null,
      village: asText(formData.get('village')) || null,
      level: asText(formData.get('level')) || null,
      clerk_organization_id: organization.id,
      is_active: true,
    })
    .select('id')
    .single()

  if (error || !clinic) {
    throw error ?? new Error('Failed to create clinic')
  }

  await saveClinicDepartments(clinic.id, departments)

  // Bootstrap visibility for the actor if they are creating the first platform page
  // before a dedicated superadmin seed exists.
  await supabase.from('superadmins').upsert({
    clerk_user_id: actor.userId,
    email: actor.email ?? 'unknown@example.com',
    display_name: actor.displayName ?? actor.email ?? actor.userId,
    is_active: true,
  }, { onConflict: 'clerk_user_id' })

  revalidatePath('/dashboard/superadmin')
}

export async function updateClinicAction(formData: FormData) {
  await requireProvisioningAccess()

  const clinicId = asText(formData.get('clinic_id'))
  if (!clinicId) throw new Error('Missing clinic id')

  const name = asText(formData.get('name'))
  const slug = asText(formData.get('slug'))
  const timezone = asText(formData.get('timezone')) || 'Africa/Kampala'
  const departments = assertDepartmentList(formData.getAll('departments'))

  const supabase = createServiceClient()
  const { data: clinic, error: clinicError } = await supabase
    .from('clinics')
    .select('clerk_organization_id')
    .eq('id', clinicId)
    .single()

  if (clinicError || !clinic) {
    throw clinicError ?? new Error('Clinic not found')
  }

  const { error } = await supabase
    .from('clinics')
    .update({
      name,
      slug,
      timezone,
      phone: asText(formData.get('phone')) || null,
      umdpc_number: asText(formData.get('umdpc_number')) || null,
      diocese: asText(formData.get('diocese')) || null,
      district: asText(formData.get('district')) || null,
      subcounty: asText(formData.get('subcounty')) || null,
      parish: asText(formData.get('parish')) || null,
      village: asText(formData.get('village')) || null,
      level: asText(formData.get('level')) || null,
      is_active: formData.get('is_active') === 'on',
    })
    .eq('id', clinicId)

  if (error) throw error

  if (clinic.clerk_organization_id) {
    const clerk = await clerkClient()
    await clerk.organizations.updateOrganization(clinic.clerk_organization_id, {
      name,
      slug,
    })
  }

  await saveClinicDepartments(clinicId, departments)
  revalidatePath('/dashboard/superadmin')
}

export async function inviteStaffAction(formData: FormData) {
  const actor = await requireProvisioningAccess()
  const clinicId = asText(formData.get('clinic_id'))
  const email = asText(formData.get('email')).toLowerCase()
  const firstName = asText(formData.get('first_name'))
  const lastName = asText(formData.get('last_name'))
  const displayName = [firstName, lastName].filter(Boolean).join(' ') || email.split('@')[0]
  const role = assertRole(formData.get('role'))

  if (!clinicId || !email) {
    throw new Error('Clinic and email are required')
  }

  const supabase = createServiceClient()
  const { data: clinic, error: clinicError } = await supabase
    .from('clinics')
    .select('id, clerk_organization_id')
    .eq('id', clinicId)
    .single()

  if (clinicError || !clinic?.clerk_organization_id) {
    throw clinicError ?? new Error('Clinic is not linked to a Clerk organization')
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
      await clerk.organizations.createOrganizationMembership({
        organizationId: clinic.clerk_organization_id,
        userId: existingUser.id,
        role: orgRoleFor(role),
      })
    } else {
      await syncMembershipRole({
        organizationId: clinic.clerk_organization_id,
        userId: existingUser.id,
        role,
      })
    }

    await upsertStaffRecord({
      clerkUserId: existingUser.id,
      clinicId,
      email,
      displayName,
      role,
    })

    await supabase
      .from('staff_invitations')
      .upsert({
        clinic_id: clinicId,
        clerk_organization_id: clinic.clerk_organization_id,
        email,
        display_name: displayName,
        role,
        status: 'accepted',
        invited_by_clerk_user_id: actor.userId,
        accepted_at: new Date().toISOString(),
      }, { onConflict: 'clinic_id,email,status' })
  } else {
    const invitation = await clerk.organizations.createOrganizationInvitation({
      organizationId: clinic.clerk_organization_id,
      emailAddress: email,
      role: orgRoleFor(role),
      inviterUserId: actor.userId,
    })

    const inviterStaff = await (async () => {
      try {
        return await requireStaff()
      } catch {
        return null
      }
    })()

    const { error } = await supabase
      .from('staff_invitations')
      .upsert({
        clinic_id: clinicId,
        clerk_organization_id: clinic.clerk_organization_id,
        clerk_invitation_id: invitation.id,
        email,
        display_name: displayName,
        role,
        status: 'pending',
        invited_by_staff_id: inviterStaff?.id ?? null,
        invited_by_clerk_user_id: actor.userId,
      }, { onConflict: 'clerk_invitation_id' })

    if (error) throw error
  }

  revalidatePath('/dashboard/superadmin')
}

export async function updateProvisionedStaffAction(formData: FormData) {
  await requireProvisioningAccess()

  const staffId = asText(formData.get('staff_id'))
  const clinicId = asText(formData.get('clinic_id'))
  const role = assertRole(formData.get('role'))
  const active = formData.get('is_active') === 'on'

  if (!staffId || !clinicId) {
    throw new Error('Missing staff identifiers')
  }

  const supabase = createServiceClient()
  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .select('clerk_user_id, clinic:clinics!staff_clinic_id_fkey(clerk_organization_id)')
    .eq('id', staffId)
    .single()

  if (staffError || !staff) {
    throw staffError ?? new Error('Staff member not found')
  }

  const { error } = await supabase
    .from('staff')
    .update({
      role,
      is_active: active,
      deactivated_at: active ? null : new Date().toISOString(),
    })
    .eq('id', staffId)
    .eq('clinic_id', clinicId)

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

  revalidatePath('/dashboard/superadmin')
}
