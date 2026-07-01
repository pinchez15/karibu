/** Clerk organization invitation / membership errors for Admin → Staff. */

type ClerkApiError = {
  errors?: Array<{ code?: string; longMessage?: string; message?: string }>
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
