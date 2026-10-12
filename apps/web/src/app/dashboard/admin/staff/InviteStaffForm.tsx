'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import type { StaffRole } from '@karibu/shared'
import { inviteClinicStaffAction } from './actions'

const INPUT_CLASS =
  'mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base'

export function InviteStaffForm({
  roles,
}: {
  roles: Array<{ value: StaffRole; label: string }>
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  )

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setMessage(null)
    startTransition(async () => {
      const result = await inviteClinicStaffAction(formData)
      if (result.success) {
        setMessage({
          type: 'success',
          text:
            result.status === 'provisioned'
              ? 'They already had a Karibu sign-in and have been added to this clinic.'
              : 'Invitation sent. They will receive an email to join this clinic.',
        })
        formRef.current?.reset()
        router.refresh()
      } else {
        setMessage({ type: 'error', text: result.error ?? 'Invitation failed' })
      }
    })
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="mt-6 grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-medium">
        First name
        <input name="first_name" className={INPUT_CLASS} />
      </label>
      <label className="text-sm font-medium">
        Last name
        <input name="last_name" className={INPUT_CLASS} />
      </label>
      <label className="text-sm font-medium sm:col-span-2">
        Email
        <input name="email" type="email" required className={INPUT_CLASS} />
      </label>
      <label className="text-sm font-medium sm:col-span-2">
        Clinical role
        <select name="role" defaultValue="clinical_officer" className={INPUT_CLASS}>
          {roles.map((role) => (
            <option key={role.value} value={role.value}>
              {role.label}
            </option>
          ))}
        </select>
      </label>
      <div className="space-y-3 sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-5 py-2.5 text-base font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {pending ? 'Sending…' : 'Send invitation'}
        </button>
        {message && (
          <p
            className={`text-sm ${message.type === 'error' ? 'text-destructive' : 'text-green'}`}
            role="status"
          >
            {message.text}
          </p>
        )}
      </div>
    </form>
  )
}
