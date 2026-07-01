'use server'

import { revalidatePath } from 'next/cache'
import { requireStaff } from '@/lib/auth'
import {
  completeOnboardingModuleForStaff,
  getOnboardingStatusForStaff,
} from '@/lib/onboarding-db'
import type { OnboardingStatus } from '@karibu/shared'
import type { OnboardingModuleCompleteResult } from '@/lib/onboarding-db'

export async function getOnboardingStatus(): Promise<OnboardingStatus> {
  const staff = await requireStaff()
  return getOnboardingStatusForStaff(staff)
}

/** Poll from web onboarding UI — progress is shared with Android via the same tables. */
export async function refreshOnboardingStatusAction(): Promise<OnboardingStatus> {
  return getOnboardingStatus()
}

export async function completeOnboardingModuleAction(
  moduleId: string,
  score?: number,
  total?: number,
): Promise<OnboardingModuleCompleteResult> {
  const staff = await requireStaff()
  const result = await completeOnboardingModuleForStaff(staff, moduleId, score, total)

  revalidatePath('/dashboard')
  revalidatePath('/onboarding')

  return result
}
