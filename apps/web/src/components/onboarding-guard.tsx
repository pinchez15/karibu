'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'

export function OnboardingGuard({
  onboardingComplete,
  children,
}: {
  onboardingComplete: boolean
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const onOnboarding = pathname?.startsWith('/onboarding') ?? false

  useEffect(() => {
    if (!onboardingComplete && !onOnboarding) {
      router.replace('/onboarding')
    }
  }, [onboardingComplete, onOnboarding, router])

  if (!onboardingComplete && !onOnboarding) {
    return null
  }

  return <>{children}</>
}
