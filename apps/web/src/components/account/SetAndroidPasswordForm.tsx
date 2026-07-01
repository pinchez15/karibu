'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useUser } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { setStaffLoginPassword } from '@/app/dashboard/settings/actions'

const MIN_LENGTH = 8

export function SetAndroidPasswordForm({
  title = 'Create your Android password',
  description = 'Karibu on your phone signs in with email and password. Pick one now — you will use the same email address.',
  onComplete,
  compact = false,
}: {
  title?: string
  description?: string
  onComplete?: () => void
  compact?: boolean
}) {
  const router = useRouter()
  const { user, isLoaded } = useUser()
  const [pending, startTransition] = useTransition()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (!isLoaded) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }

  if (user?.passwordEnabled || done) {
    return (
      <p className="text-sm text-body">
        Password is set. Use <span className="font-medium">{user?.primaryEmailAddress?.emailAddress}</span>{' '}
        and this password to sign in on the Karibu Android app.
      </p>
    )
  }

  function submit() {
    setError(null)
    if (password.length < MIN_LENGTH) {
      setError(`Use at least ${MIN_LENGTH} characters.`)
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    startTransition(async () => {
      const result = await setStaffLoginPassword(password)
      if (!result.success) {
        setError(result.error)
        return
      }
      setDone(true)
      await user?.reload()
      onComplete?.()
      router.refresh()
    })
  }

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      <div>
        <h2 className={compact ? 'text-base font-semibold' : 'text-lg font-semibold'}>{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium">Password</label>
          <Input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1"
            minLength={MIN_LENGTH}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Confirm password</label>
          <Input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="mt-1"
            minLength={MIN_LENGTH}
          />
        </div>
      </div>

      <Button onClick={submit} disabled={pending} className="bg-cobalt hover:bg-cobalt/90">
        {pending ? 'Saving…' : 'Save password'}
      </Button>
    </div>
  )
}
