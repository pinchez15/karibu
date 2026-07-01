'use client'

import { Suspense, useEffect, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSignIn, useSignUp, useUser } from '@clerk/nextjs'
import { KaribuLockup } from '@/components/karibu-mark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const MIN_PASSWORD = 8

function clerkErrorMessage(err: unknown): string {
  const anyErr = err as { errors?: Array<{ message?: string }> }
  return anyErr.errors?.[0]?.message ?? (err instanceof Error ? err.message : 'Something went wrong')
}

function AcceptInvitationInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const ticket = searchParams?.get('__clerk_ticket')
  const accountStatus = searchParams?.get('__clerk_status')

  const { isLoaded: userLoaded, user } = useUser()
  const { isLoaded: signUpLoaded, signUp, setActive: setActiveSignUp } = useSignUp()
  const { isLoaded: signInLoaded, signIn, setActive: setActiveSignIn } = useSignIn()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [ticketHandled, setTicketHandled] = useState(false)

  const isLoaded = userLoaded && signUpLoaded && signInLoaded

  useEffect(() => {
    if (!isLoaded || !user) return
    router.replace('/onboarding')
  }, [isLoaded, user, router])

  useEffect(() => {
    if (!isLoaded || ticketHandled || !ticket) return
    if (accountStatus === 'sign_in') {
      startTransition(async () => {
        try {
          const result = await signIn!.create({
            strategy: 'ticket',
            ticket,
          })
          if (result.status === 'complete' && result.createdSessionId) {
            await setActiveSignIn!({ session: result.createdSessionId })
            setTicketHandled(true)
            router.replace('/onboarding')
            return
          }
          setError('Could not accept invitation. Ask your clinic admin to resend the invite.')
        } catch (e) {
          setError(clerkErrorMessage(e))
        }
      })
    }
  }, [isLoaded, ticket, accountStatus, ticketHandled, signIn, setActiveSignIn, router])

  if (!ticket) {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">This invitation link is missing or expired.</p>
      </div>
    )
  }

  if (!isLoaded) {
    return <p className="px-6 py-16 text-center text-sm text-muted-foreground">Loading…</p>
  }

  if (accountStatus === 'sign_in' && !ticketHandled) {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">Accepting your invitation…</p>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </div>
    )
  }

  if (accountStatus !== 'sign_up') {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          {error ?? 'Open the invitation link from your email to continue.'}
        </p>
      </div>
    )
  }

  function submitSignUp() {
    setError(null)
    if (password.length < MIN_PASSWORD) {
      setError(`Use at least ${MIN_PASSWORD} characters.`)
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    startTransition(async () => {
      try {
        const attempt = await signUp!.create({
          strategy: 'ticket',
          ticket: ticket!,
          password,
        })

        if (attempt.status === 'complete' && attempt.createdSessionId) {
          await setActiveSignUp!({ session: attempt.createdSessionId })
          router.replace('/onboarding')
          return
        }

        setError('Additional verification is required. Contact your clinic admin.')
      } catch (e) {
        setError(clerkErrorMessage(e))
      }
    })
  }

  return (
    <div className="min-h-screen bg-cobalt-ink text-white">
      <div className="px-6 pt-10">
        <KaribuLockup size={32} variant="onDark" />
      </div>
      <div className="mx-auto max-w-md px-6 py-10">
        <h1 className="text-2xl font-semibold">Join your clinic</h1>
        <p className="mt-2 text-sm text-white/85">
          Create a password for KaribuEHR on the web and on the Android app. You will sign in with
          this email and password on your phone.
        </p>

        {error && <p className="mt-4 text-sm text-red-200">{error}</p>}

        <div className="mt-6 space-y-3">
          <div>
            <label className="text-sm font-medium text-white/90">Password</label>
            <Input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 bg-white text-ink"
              minLength={MIN_PASSWORD}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-white/90">Confirm password</label>
            <Input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-1 bg-white text-ink"
              minLength={MIN_PASSWORD}
            />
          </div>
        </div>

        <Button
          onClick={submitSignUp}
          disabled={pending}
          className="mt-6 w-full bg-white text-cobalt-ink hover:bg-cobalt-soft"
        >
          {pending ? 'Creating account…' : 'Create account'}
        </Button>
      </div>
    </div>
  )
}

export function AcceptInvitationClient() {
  return (
    <Suspense fallback={<p className="px-6 py-16 text-center text-sm">Loading…</p>}>
      <AcceptInvitationInner />
    </Suspense>
  )
}
