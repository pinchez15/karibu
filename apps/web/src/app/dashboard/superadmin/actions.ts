'use server'

import { auth, clerkClient } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase'
import { requireProvisioningAccess, requireStaff } from '@/lib/auth'
import { assertStaffRole } from '@/lib/staff-roles'
import {
  inviteStaffToClinic,
  updateClinicStaffRole,
} from '@/lib/staff-provisioning'
import type { ClinicWorkflowConfig, OpdPatientFilter, VisitDepartment } from '@karibu/shared'

const DEPARTMENTS = ['opd', 'anc', 'maternity', 'family_planning', 'immunization'] as const

type Department = typeof DEPARTMENTS[number]

function asText(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value.trim() : ''
}

function assertDepartmentList(values: FormDataEntryValue[]): Department[] {
  return values
    .map((value) => (typeof value === 'string' ? value : ''))
    .filter((value): value is Department => (DEPARTMENTS as readonly string[]).includes(value))
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

  await supabase.from('superadmins').upsert(
    {
      clerk_user_id: actor.userId,
      email: actor.email ?? 'unknown@example.com',
      display_name: actor.displayName ?? actor.email ?? actor.userId,
      is_active: true,
    },
    { onConflict: 'clerk_user_id' },
  )

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
      diocese: asText(formData.get('diocese')) || null,
      district: asText(formData.get('district')) || null,
      subcounty: asText(formData.get('subcounty')) || null,
      parish: asText(formData.get('parish')) || null,
      village: asText(formData.get('village')) || null,
      level: asText(formData.get('level')) || null,
      phone: asText(formData.get('phone')) || null,
      umdpc_number: asText(formData.get('umdpc_number')) || null,
      is_active: formData.get('is_active') === 'on',
    })
    .eq('id', clinicId)

  if (error) throw error

  await saveClinicDepartments(clinicId, departments)
  revalidatePath('/dashboard/superadmin')
}

export async function inviteStaffAction(formData: FormData) {
  const actor = await requireProvisioningAccess()
  const clinicId = asText(formData.get('clinic_id'))
  const email = asText(formData.get('email')).toLowerCase()
  const firstName = asText(formData.get('first_name'))
  const lastName = asText(formData.get('last_name'))
  const role = assertStaffRole(asText(formData.get('role')))

  if (!clinicId || !email) {
    throw new Error('Clinic and email are required')
  }

  await inviteStaffToClinic({
    clinicId,
    email,
    firstName,
    lastName,
    role,
    invitedByClerkUserId: actor.userId,
    invitedByStaffId: (await requireStaff().catch(() => null))?.id ?? null,
  })

  revalidatePath('/dashboard/superadmin')
  revalidatePath('/dashboard/admin/staff')
}

export async function updateProvisionedStaffAction(formData: FormData) {
  await requireProvisioningAccess()

  const staffId = asText(formData.get('staff_id'))
  const clinicId = asText(formData.get('clinic_id'))
  const role = assertStaffRole(asText(formData.get('role')))
  const active = formData.get('is_active') === 'on'

  if (!staffId || !clinicId) {
    throw new Error('Missing staff identifiers')
  }

  await updateClinicStaffRole({
    staffId,
    clinicId,
    role,
    isActive: active,
  })

  revalidatePath('/dashboard/superadmin')
  revalidatePath('/dashboard/admin/staff')
}

const OPD_FILTERS: OpdPatientFilter[] = [
  'waiting',
  'needs_vitals',
  'with_clinician',
  'awaiting_labs',
  'at_pharmacy',
  'done_today',
]

export async function updateClinicWorkflowConfigAction(formData: FormData) {
  await requireProvisioningAccess()

  const clinicId = asText(formData.get('clinic_id'))
  if (!clinicId) throw new Error('Missing clinic id')

  const defaultOpdFilters = formData
    .getAll('default_opd_filters')
    .map((value) => (typeof value === 'string' ? value : ''))
    .filter((value): value is OpdPatientFilter => OPD_FILTERS.includes(value as OpdPatientFilter))

  const prominentDepartments = formData
    .getAll('prominent_departments')
    .map((value) => (typeof value === 'string' ? value : ''))
    .filter((value): value is VisitDepartment =>
      (DEPARTMENTS as readonly string[]).includes(value),
    )

  const enabledProtocolSlugs = asText(formData.get('enabled_protocol_slugs'))
    .split(',')
    .map((slug) => slug.trim())
    .filter(Boolean)

  const workflowConfig: ClinicWorkflowConfig = {
    default_opd_filters: defaultOpdFilters.length > 0 ? defaultOpdFilters : ['waiting', 'done_today'],
    prominent_departments: prominentDepartments.length > 0 ? prominentDepartments : ['opd'],
    show_physical_queue_filter: formData.get('show_physical_queue_filter') === 'on',
    enabled_protocol_slugs: enabledProtocolSlugs,
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('clinics')
    .update({ workflow_config: workflowConfig })
    .eq('id', clinicId)

  if (error) throw error
  revalidatePath('/dashboard/superadmin')
}

export async function updateProtocolEnrollmentAction(formData: FormData) {
  await requireProvisioningAccess()

  const clinicId = asText(formData.get('clinic_id'))
  const protocolId = asText(formData.get('protocol_id'))
  const enabled = formData.get('enabled') === 'on'

  if (!clinicId || !protocolId) {
    throw new Error('Missing enrollment identifiers')
  }

  const supabase = createServiceClient()
  const { error } = await supabase.from('clinic_protocol_enrollments').upsert(
    {
      clinic_id: clinicId,
      protocol_id: protocolId,
      enabled,
    },
    { onConflict: 'clinic_id,protocol_id' },
  )

  if (error) throw error
  revalidatePath('/dashboard/superadmin')
}
