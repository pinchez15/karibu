import { redirect } from 'next/navigation'
import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import type { OnboardingManifest, OnboardingStatus } from '@karibu/shared'
import { readFile } from 'fs/promises'
import path from 'path'
import { OnboardingClient } from './OnboardingClient'

export const metadata = {
  title: 'KaribuEHR training',
  description: 'Required cross-role onboarding before registering patients.',
}

async function loadManifest(): Promise<OnboardingManifest> {
  const file = path.join(process.cwd(), 'public/onboarding/manifest.json')
  const raw = await readFile(file, 'utf8')
  return JSON.parse(raw) as OnboardingManifest
}

export default async function OnboardingPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')

  if (staff.onboarding_completed_at) {
    redirect('/dashboard')
  }

  const supabase = createServiceClient()
  const { data: status, error } = await supabase.rpc('rpc_get_onboarding_status')
  if (error) {
    throw new Error(error.message)
  }

  const onboarding = status as OnboardingStatus
  const manifest = await loadManifest()
  const completedIds = onboarding.progress.map((row) => row.module_id)

  return (
    <OnboardingClient
      manifest={manifest}
      initialCompletedIds={completedIds}
      allComplete={onboarding.completed}
    />
  )
}
