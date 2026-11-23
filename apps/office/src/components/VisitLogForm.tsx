'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { flushOutbox, readOutbox, writeOutbox, type OutboxEntry, type SendResult } from '@/lib/outbox'

type Labels = { kinds: Record<string, string>; placeholder: string; submit: string; logged: string; queued: string }

/**
 * Logs a visit or call. Works with no signal: the entry is saved on the phone
 * first and sent when a connection is available.
 */
export function VisitLogForm({ accountId, labels, send }: {
  accountId: string
  labels: Labels
  send: (entry: OutboxEntry) => Promise<SendResult>
}) {
  const router = useRouter()
  const [kind, setKind] = useState('call')
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState<{ tone: 'success' | 'warning' | 'danger'; text: string } | null>(null)
  const [pending, setPending] = useState(0)
  const [busy, setBusy] = useState(false)

  async function flush(announce: boolean) {
    const result = await flushOutbox(window.localStorage, send)
    setPending(result.remaining)
    if (result.rejected.length) setStatus({ tone: 'danger', text: result.rejected[0] })
    else if (result.remaining > 0) setStatus({ tone: 'warning', text: labels.queued })
    else if (announce && result.sent > 0) setStatus({ tone: 'success', text: labels.logged })
    if (result.sent > 0) router.refresh()
  }

  useEffect(() => {
    setPending(readOutbox(window.localStorage).length)
    const onOnline = () => void flush(true)
    window.addEventListener('online', onOnline)
    if (navigator.onLine) void flush(false)
    return () => window.removeEventListener('online', onOnline)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!notes.trim() || busy) return
    setBusy(true)
    const entry: OutboxEntry = { id: crypto.randomUUID(), accountId, kind, notes: notes.trim(), at: new Date().toISOString() }
    writeOutbox(window.localStorage, [...readOutbox(window.localStorage), entry])
    setNotes('')
    await flush(true)
    setBusy(false)
  }

  return (
    <form onSubmit={submit} className="card space-y-3">
      <select value={kind} onChange={(e) => setKind(e.target.value)} className="input" aria-label={labels.submit}>
        {Object.entries(labels.kinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="input" placeholder={labels.placeholder} required />
      <button className="btn-primary w-full" disabled={busy}>{labels.submit}</button>
      {status ? <p role="status" className={`notice-${status.tone}`}>{status.text}{pending > 0 ? ` (${pending})` : ''}</p> : null}
    </form>
  )
}
