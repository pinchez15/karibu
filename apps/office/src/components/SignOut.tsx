'use client'

import { SignOutButton } from '@clerk/nextjs'

/** Signs out and drops the pages the service worker kept for reading without signal. */
export function SignOut({ label }: { label: string }) {
  return (
    <SignOutButton>
      <button
        className="btn-secondary w-full"
        onClick={() => navigator.serviceWorker?.controller?.postMessage('clear')}
      >
        {label}
      </button>
    </SignOutButton>
  )
}
