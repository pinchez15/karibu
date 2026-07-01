import { redirect } from 'next/navigation'
import { getStaff } from '@/lib/auth'
import { getOnboardingStatusForStaff } from '@/lib/onboarding-db'
import { EhrOnboardingClient } from './EhrOnboardingClient'

export const metadata = {
  title: 'KaribuEHR training',
  description: 'Self-guided training on real EHR workflows before registering patients.',
}

export default async function OnboardingPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')

  if (staff.onboarding_completed_at) {
    redirect('/dashboard')
  }

  const onboarding = await getOnboardingStatusForStaff(staff)
  const completedIds = onboarding.progress.map((row) => row.module_id)

  return (
    <EhrOnboardingClient
      initialCompletedIds={completedIds}
      allComplete={onboarding.completed}
    />
  )
}
