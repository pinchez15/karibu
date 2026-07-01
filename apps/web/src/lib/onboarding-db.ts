import 'server-only'

import { createServiceClient } from '@/lib/supabase'
import type { OnboardingStatus, Staff } from '@karibu/shared'

/** Must match onboarding_required_modules() in migration 079 and public/onboarding/manifest.json. */
export const ONBOARDING_REQUIRED_MODULE_IDS = [
  'records-register',
  'nurse-vitals',
  'clinician-note-pharmacy',
  'lab-result',
  'pharmacy-dispense',
  'billing-payment',
] as const

export type OnboardingModuleCompleteResult = {
  module_id: string
  completed: boolean
  completed_at: string | null
  modules_done: number
  modules_required: number
}

export async function getOnboardingStatusForStaff(staff: Staff): Promise<OnboardingStatus> {
  const supabase = createServiceClient()

  const { data: progress, error } = await supabase
    .from('staff_onboarding_progress')
    .select('module_id, completed_at, score, total')
    .eq('staff_id', staff.id)
    .order('module_id')

  if (error) throw error

  return {
    completed: Boolean(staff.onboarding_completed_at),
    completed_at: staff.onboarding_completed_at,
    required_modules: [...ONBOARDING_REQUIRED_MODULE_IDS],
    progress: progress ?? [],
  }
}

export async function completeOnboardingModuleForStaff(
  staff: Staff,
  moduleId: string,
  score?: number | null,
  total?: number | null,
): Promise<OnboardingModuleCompleteResult> {
  if (!(ONBOARDING_REQUIRED_MODULE_IDS as readonly string[]).includes(moduleId)) {
    throw new Error(`Unknown onboarding module: ${moduleId}`)
  }

  const supabase = createServiceClient()
  const now = new Date().toISOString()

  const { error: upsertError } = await supabase.from('staff_onboarding_progress').upsert(
    {
      staff_id: staff.id,
      module_id: moduleId,
      completed_at: now,
      score: score ?? null,
      total: total ?? null,
    },
    { onConflict: 'staff_id,module_id' },
  )

  if (upsertError) throw upsertError

  const { data: doneRows, error: countError } = await supabase
    .from('staff_onboarding_progress')
    .select('module_id')
    .eq('staff_id', staff.id)
    .in('module_id', [...ONBOARDING_REQUIRED_MODULE_IDS])

  if (countError) throw countError

  const modulesDone = doneRows?.length ?? 0
  const modulesRequired = ONBOARDING_REQUIRED_MODULE_IDS.length
  let completedAt = staff.onboarding_completed_at

  if (modulesDone >= modulesRequired && !completedAt) {
    const { data: updated, error: staffError } = await supabase
      .from('staff')
      .update({ onboarding_completed_at: now, updated_at: now })
      .eq('id', staff.id)
      .select('onboarding_completed_at')
      .single()

    if (staffError) throw staffError
    completedAt = updated.onboarding_completed_at
  }

  return {
    module_id: moduleId,
    completed: completedAt != null,
    completed_at: completedAt,
    modules_done: modulesDone,
    modules_required: modulesRequired,
  }
}
