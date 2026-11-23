// The phone's offline queue for field writes (spec §9: visit logs and notes
// queue locally and sync later). localStorage is enough: entries are a few
// hundred bytes, and every write is idempotent on a client-generated id, so a
// replay after a half-finished send cannot duplicate.

export interface OutboxEntry {
  id: string
  accountId: string
  kind: string
  notes: string
  at: string
}

const KEY = 'ko_outbox_v1'

export function readOutbox(storage: Pick<Storage, 'getItem'>): OutboxEntry[] {
  try {
    const parsed = JSON.parse(storage.getItem(KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function writeOutbox(storage: Pick<Storage, 'setItem'>, entries: OutboxEntry[]) {
  storage.setItem(KEY, JSON.stringify(entries))
}

export type SendResult = { ok: true } | { ok: false; message: string }

/**
 * Sends queued entries oldest first. An entry leaves the queue when the server
 * accepts it OR refuses it (a refusal will not succeed on retry). It stays
 * queued only when the send itself fails, which is what no signal looks like.
 */
export async function flushOutbox(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  send: (entry: OutboxEntry) => Promise<SendResult>,
): Promise<{ sent: number; rejected: string[]; remaining: number }> {
  let sent = 0
  const rejected: string[] = []
  for (const entry of readOutbox(storage)) {
    let result: SendResult
    try {
      result = await send(entry)
    } catch {
      break // offline: keep this and everything after it, in order
    }
    if (result.ok) sent++
    else rejected.push(result.message)
    writeOutbox(storage, readOutbox(storage).filter((e) => e.id !== entry.id))
  }
  return { sent, rejected, remaining: readOutbox(storage).length }
}
