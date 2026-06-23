import type { Staff } from '@karibu/shared'

export const ONBOARDING_REQUIRED_MESSAGE =
  'Complete KaribuEHR training before registering patients.'

export function staffNeedsOnboarding(staff: Staff): boolean {
  return !staff.onboarding_completed_at
}

/** Server-side guard before creating a new patient record. */
export function ensureCanRegisterPatients(staff: Staff): { error?: string } {
  if (staffNeedsOnboarding(staff)) {
    return { error: ONBOARDING_REQUIRED_MESSAGE }
  }
  return {}
}
