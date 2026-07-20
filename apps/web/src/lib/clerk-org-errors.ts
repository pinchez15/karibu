/** Clerk organization invitation / membership errors for Admin → Staff. */

type ClerkApiError = {
  errors?: Array<{ code?: string; longMessage?: string; message?: string }>
}

/** Clerk errors where revoke is a no-op — the invitation is already inactive in Clerk. */
const CLERK_INVITATION_REVOKE_NO_OP_CODES = new Set([
  'resource_not_found',
  'invitation_not_found',
  'organization_invitation_not_pending',
  'invitation_already_revoked',
  'invitation_already_accepted',
])

export function isClerkInvitationRevokeNoOpError(error: unknown): boolean {
  const err = error as ClerkApiError
  return err?.errors?.some((e) => e.code && CLERK_INVITATION_REVOKE_NO_OP_CODES.has(e.code)) ?? false
}

export function isClerkOrgQuotaError(error: unknown): boolean {
  const err = error as ClerkApiError
  return err?.errors?.some((e) => e.code === 'organization_membership_quota_exceeded') ?? false
}

export function formatClerkInviteError(error: unknown): string {
  if (isClerkOrgQuotaError(error)) {
    return (
      'This clinic has reached its staff limit (active members plus pending invitations). ' +
      'Revoke unused invitations below, then try again.'
    )
  }

  const err = error as ClerkApiError
  const clerkMsg = err?.errors?.[0]?.longMessage ?? err?.errors?.[0]?.message
  if (clerkMsg) return clerkMsg
  if (error instanceof Error) return error.message
  return 'Invitation failed'
}
