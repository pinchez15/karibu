'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import { Loader2 } from 'lucide-react'

export interface ConsultMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  created_at: string
}

interface ConsultChatClientProps {
  threadId: string
  initialMessages: ConsultMessage[]
  readOnly: boolean
}

export function ConsultChatClient({
  threadId,
  initialMessages,
  readOnly,
}: ConsultChatClientProps) {
  const router = useRouter()
  const { getToken } = useAuth()
  const [messages, setMessages] = useState(initialMessages)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [pending, startTransition] = useTransition()

  function send() {
    const text = draft.trim()
    if (!text || readOnly || !confirmed) return
    setError(null)
    startTransition(async () => {
      const clerkToken = await getToken()
      if (!clerkToken) {
        setError('Not signed in')
        return
      }
      const resp = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/consult-chat`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${clerkToken}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ thread_id: threadId, message: text }),
        },
      )
      const body = (await resp.json().catch(() => ({}))) as {
        error?: string
        assistant?: string
      }
      if (!resp.ok) {
        setError(body.error ?? `Request failed (${resp.status})`)
        return
      }
      setDraft('')
      const now = new Date().toISOString()
      setMessages((prev) => [
        ...prev,
        { id: `local-user-${now}`, role: 'user', content: text, created_at: now },
        {
          id: `local-asst-${now}`,
          role: 'assistant',
          content: body.assistant ?? '',
          created_at: now,
        },
      ])
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-amber-soft border border-amber/30 rounded-lg p-3 text-sm text-body space-y-2">
        <p>
          This consult uses a <strong>de-identified</strong> case summary only. Confirm before
          sending.
        </p>
        {!readOnly && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="rounded border-border"
            />
            <span>I confirm no patient names or identifiers are in my message.</span>
          </label>
        )}
      </div>

      {readOnly && (
        <p className="text-sm text-muted-foreground">Visit signed — thread is read-only.</p>
      )}

      <div className="space-y-3 min-h-[200px]">
        {messages.map((m) => (
          <div
            key={m.id}
            className={
              m.role === 'user'
                ? 'ml-8 bg-cobalt/10 border border-cobalt/20 rounded-lg p-3 text-sm'
                : 'mr-8 bg-card border border-border rounded-lg p-3 text-sm'
            }
          >
            <p className="text-xs text-muted-foreground mb-1 capitalize">{m.role}</p>
            <p className="whitespace-pre-wrap">{m.content}</p>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!readOnly && (
        <div className="flex gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask your second-opinion question…"
            rows={3}
            disabled={pending || !confirmed}
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none disabled:opacity-60"
          />
          <button
            type="button"
            onClick={send}
            disabled={pending || !confirmed || !draft.trim()}
            className="self-end bg-cobalt text-white rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-60 inline-flex items-center gap-2"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Send
          </button>
        </div>
      )}
    </div>
  )
}
