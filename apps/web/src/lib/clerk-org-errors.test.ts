import { describe, expect, it } from 'vitest'
import { formatClerkInviteError, isClerkInvitationRevokeNoOpError } from './clerk-org-errors'

describe('isClerkInvitationRevokeNoOpError', () => {
  it('returns true when Clerk says the invitation is no longer pending', () => {
    expect(
      isClerkInvitationRevokeNoOpError({
        errors: [
          {
            code: 'organization_invitation_not_pending',
            message: 'not pending',
            longMessage: 'The organization invitation is not in the "pending" status.',
          },
        ],
      }),
    ).toBe(true)
  })

  it('returns true for already-revoked and missing invitations', () => {
    expect(
      isClerkInvitationRevokeNoOpError({
        errors: [{ code: 'invitation_already_revoked' }],
      }),
    ).toBe(true)
    expect(
      isClerkInvitationRevokeNoOpError({
        errors: [{ code: 'invitation_not_found' }],
      }),
    ).toBe(true)
  })

  it('returns false for unrelated Clerk errors', () => {
    expect(
      isClerkInvitationRevokeNoOpError({
        errors: [{ code: 'organization_membership_quota_exceeded' }],
      }),
    ).toBe(false)
  })
})

describe('formatClerkInviteError', () => {
  it('explains the missing org-admin permission instead of echoing Clerk', () => {
    const text = formatClerkInviteError({
      errors: [{ longMessage: 'Current user is missing an organization permission.' }],
    })
    expect(text).toMatch(/not an admin of this clinic/)
  })

  it('passes other Clerk messages through', () => {
    expect(formatClerkInviteError({ errors: [{ longMessage: 'Email is invalid.' }] })).toBe(
      'Email is invalid.',
    )
  })
})
