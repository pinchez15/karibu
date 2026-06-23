import type { OnboardingManifest, OnboardingModule } from '@karibu/shared'

export async function loadOnboardingManifest(): Promise<OnboardingManifest> {
  const res = await fetch('/onboarding/manifest.json', { cache: 'no-store' })
  if (!res.ok) throw new Error('Could not load onboarding manifest')
  return res.json() as Promise<OnboardingManifest>
}

export function mergeOnboardingModules(
  manifest: OnboardingManifest,
  completedIds: Set<string>,
): Array<OnboardingModule & { completed: boolean }> {
  return [...manifest.modules]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((module) => ({
      ...module,
      completed: completedIds.has(module.id),
    }))
}
