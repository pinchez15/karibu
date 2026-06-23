'use server'

import { revalidatePath } from 'next/cache'
import { requireStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import type { OnboardingStatus } from '@karibu/shared'

export async function getOnboardingStatus(): Promise<OnboardingStatus> {
  await requireStaff()
  const supabase = createServiceClient()

  const { data, error } = await supabase.rpc('rpc_get_onboarding_status')
  if (error) throw error

  return data as OnboardingStatus
}

/** Poll from web onboarding UI — progress is shared with Android via RPC. */
export async function refreshOnboardingStatusAction(): Promise<OnboardingStatus> {
  return getOnboardingStatus()
}

export async function completeOnboardingModuleAction(
  moduleId: string,
  score?: number,
  total?: number,
) {
  await requireStaff()
  const supabase = createServiceClient()

  const { data, error } = await supabase.rpc('rpc_complete_onboarding_module', {
    p_module_id: moduleId,
    p_score: score ?? null,
    p_total: total ?? null,
  })
  if (error) throw error

  revalidatePath('/dashboard')
  revalidatePath('/onboarding')

  return data
}
