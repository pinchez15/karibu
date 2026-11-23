'use client'

import { useEffect } from 'react'

/** Registers the service worker that keeps the last-seen pages readable with no signal. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, [])
  return null
}
