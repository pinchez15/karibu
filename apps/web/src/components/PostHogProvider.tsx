'use client'

import posthog from 'posthog-js'
import { PostHogProvider as PHProvider, usePostHog } from 'posthog-js/react'
import { useEffect } from 'react'
import { useUser } from '@clerk/nextjs'

if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
    capture_pageview: true,
    capture_pageleave: true,
  })
}

function PostHogIdentify() {
  const { user } = useUser()
  const ph = usePostHog()

  useEffect(() => {
    if (user && ph) {
      ph.identify(user.id, {
        email: user.primaryEmailAddress?.emailAddress,
        name: user.fullName,
      })
    }
  }, [user, ph])

  return null
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    return <>{children}</>
  }

  return (
    <PHProvider client={posthog}>
      <PostHogIdentify />
      {children}
    </PHProvider>
  )
}
