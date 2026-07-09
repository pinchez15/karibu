import { describe, expect, it } from 'vitest'
import { clerkPasswordErrorMessage } from './AcceptInvitationClient'

describe('clerkPasswordErrorMessage', () => {
  it('maps form_password_pwned to a plain-language breach warning', () => {
    const msg = clerkPasswordErrorMessage('form_password_pwned', 'Password has been found in an online data breach.')
    expect(msg).toBe(
      'This password appears in a public data breach — pick a different one (a short phrase works well).',
    )
  })

  it('maps form_password_length_too_short to the min-length line', () => {
    const msg = clerkPasswordErrorMessage('form_password_length_too_short', 'Password is too short.')
    expect(msg).toBe('Use at least 8 characters.')
  })

  it('falls through to the raw message for an unknown code', () => {
    const msg = clerkPasswordErrorMessage('form_identifier_exists', 'That email is already registered.')
    expect(msg).toBe('That email is already registered.')
  })

  it('falls through to the raw message when there is no code at all', () => {
    const msg = clerkPasswordErrorMessage(undefined, 'Something went wrong')
    expect(msg).toBe('Something went wrong')
  })
})
