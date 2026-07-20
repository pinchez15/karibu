'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { STAFF_ROLE_LABELS } from '@/lib/staff-roles'
import { resendStaffInvitationAction, revokeStaffInvitationAction } from './actions'

export type PendingInviteRow = {
  id: string
  email: string
  display_name: string
  role: string
  created_at: string
}

export function PendingInvitesList({ invites }: { invites: PendingInviteRow[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  )

  function run(
    invitationId: string,
    action: 'resend' | 'revoke',
    fn: (id: string) => Promise<{ success: boolean; error?: string }>,
  ) {
    setBusyId(invitationId)
    setMessage(null)
    startTransition(async () => {
      const result = await fn(invitationId)
      setBusyId(null)
      if (result.success) {
        setMessage({
          type: 'success',
          text:
            action === 'resend'
              ? 'Invitation resent. They will receive a new secure link by email.'
              : 'Invitation removed. You can send a new invite from the form above.',
        })
        router.refresh()
      } else {
        setMessage({ type: 'error', text: result.error ?? 'Action failed' })
      }
    })
  }

  return (
    <section className="rounded-2xl border border-border bg-muted/40 p-6">
      <h3 className="text-lg font-semibold">Pending invitations ({invites.length})</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        People who have not joined yet. Each invite is sent securely to their email and expires
        after 30 days. Resend if they did not receive it; remove to clear a stale invite so
        you can send a fresh one.
      </p>

      {message && (
        <p
          className={`mt-3 text-sm ${message.type === 'error' ? 'text-destructive' : 'text-green'}`}
          role="status"
        >
          {message.text}
        </p>
      )}

      <ul className="mt-4 space-y-3">
        {invites.map((invite) => {
          const busy = pending && busyId === invite.id
          return (
            <li
              key={invite.id}
              className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-medium">{invite.display_name}</p>
                <p className="text-sm text-muted-foreground">{invite.email}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {STAFF_ROLE_LABELS[invite.role as keyof typeof STAFF_ROLE_LABELS] ??
                    invite.role}{' '}
                  · sent {new Date(invite.created_at).toLocaleString()}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(invite.id, 'resend', resendStaffInvitationAction)}
                  className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-60"
                >
                  {busy ? 'Working…' : 'Resend'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(invite.id, 'revoke', revokeStaffInvitationAction)}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-60"
                >
                  {busy ? 'Working…' : 'Remove'}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
