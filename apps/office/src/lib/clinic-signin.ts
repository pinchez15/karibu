// Clerk calls for clinics an office provisions. The Clerk secret key lives in
// this app's server environment; the Supabase service-role key does not.
import 'server-only'
import { clerkClient } from '@clerk/nextjs/server'
import { ehrUrl } from './share'

/**
 * Creates the clinic's sign-in organization with NO creator. Passing
 * `createdBy` would make the partner an org admin, and the EHR's Clerk webhook
 * turns every org member into a `staff` row, which would give the partner
 * patient access. Partners must never be members of a clinic's organization.
 */
export async function createClinicOrganization(name: string, slug: string): Promise<string> {
  const clerk = await clerkClient()
  const org = await clerk.organizations.createOrganization({ name, slug })
  return org.id
}

export async function deleteClinicOrganization(organizationId: string) {
  const clerk = await clerkClient()
  await clerk.organizations.deleteOrganization(organizationId).catch(() => {})
}

/** Clerk only distinguishes admin from member; the Karibu role is kept in staff_invitations. */
export async function inviteToClinic(organizationId: string, email: string, role: string): Promise<string> {
  const clerk = await clerkClient()
  const invitation = await clerk.organizations.createOrganizationInvitation({
    organizationId,
    emailAddress: email,
    role: role === 'admin' ? 'org:admin' : 'org:member',
    redirectUrl: ehrUrl('/accept-invitation'),
  })
  return invitation.id
}

export async function revokeClinicInvitation(organizationId: string, invitationId: string) {
  const clerk = await clerkClient()
  await clerk.organizations.revokeOrganizationInvitation({ organizationId, invitationId }).catch(() => {})
}

export function isSlugTaken(error: unknown): boolean {
  const errors = (error as { errors?: { code?: string }[] })?.errors ?? []
  return errors.some((e) => e.code === 'form_identifier_exists' || e.code === 'duplicate_record')
}
