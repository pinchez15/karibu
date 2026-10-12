import { redirect } from 'next/navigation'
import { currentUser } from '@clerk/nextjs/server'
import { SignOutButton } from '@clerk/nextjs'
import { getStaff } from '@/lib/auth'

export const metadata = {
  title: 'No clinic access — KaribuEHR',
}

/**
 * Landing spot for someone signed in to Clerk who has no active staff row
 * (invited the wrong way, invited to the wrong organization, or deactivated).
 * Dashboard pages send staff-less users here instead of `/`, which middleware
 * bounces straight back to `/dashboard` — an infinite redirect.
 */
export default async function NoAccessPage() {
  const user = await currentUser()
  if (!user) redirect('/')

  const staff = await getStaff()
  if (staff) redirect('/dashboard')

  const email = user.primaryEmailAddress?.emailAddress

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
        <h1 className="text-xl font-semibold">No clinic access yet</h1>
        <p className="mt-3 text-base text-muted-foreground">
          {email ? (
            <>
              You are signed in as <strong className="text-foreground">{email}</strong>, but this
              account is not linked to a clinic in Karibu.
            </>
          ) : (
            'This account is not linked to a clinic in Karibu.'
          )}
        </p>
        <p className="mt-3 text-base text-muted-foreground">
          Ask your clinic admin to invite you from Admin → Staff. If you were already invited,
          use the link in that email.
        </p>
        <SignOutButton redirectUrl="/">
          <button
            type="button"
            className="mt-6 rounded-lg border border-border px-5 py-2.5 text-base font-medium hover:bg-muted"
          >
            Sign out
          </button>
        </SignOutButton>
      </div>
    </main>
  )
}
