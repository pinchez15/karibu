import { describe, expect, it } from 'vitest'
import { flushOutbox, readOutbox, writeOutbox, type OutboxEntry } from './outbox'

function memoryStorage() {
  const data = new Map<string, string>()
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
}

const entry = (id: string): OutboxEntry => ({ id, accountId: 'a', kind: 'call', notes: id, at: '2026-11-23T10:00:00Z' })

describe('flushOutbox', () => {
  it('keeps everything, in order, when there is no signal', async () => {
    const s = memoryStorage()
    writeOutbox(s, [entry('1'), entry('2')])
    const r = await flushOutbox(s, async () => { throw new Error('Failed to fetch') })
    expect(r).toEqual({ sent: 0, rejected: [], remaining: 2 })
    expect(readOutbox(s).map((e) => e.id)).toEqual(['1', '2'])
  })

  it('sends what it can and stops at the first network failure', async () => {
    const s = memoryStorage()
    writeOutbox(s, [entry('1'), entry('2'), entry('3')])
    const r = await flushOutbox(s, async (e) => {
      if (e.id === '2') throw new Error('offline')
      return { ok: true }
    })
    expect(r.sent).toBe(1)
    expect(readOutbox(s).map((e) => e.id)).toEqual(['2', '3'])
  })

  it('drops an entry the server refuses, and reports why', async () => {
    const s = memoryStorage()
    writeOutbox(s, [entry('1'), entry('2')])
    const r = await flushOutbox(s, async (e) => (e.id === '1' ? { ok: false, message: 'Clinic not found' } : { ok: true }))
    expect(r).toEqual({ sent: 1, rejected: ['Clinic not found'], remaining: 0 })
  })

  it('survives corrupted storage', () => {
    const s = memoryStorage()
    s.setItem('ko_outbox_v1', '{not json')
    expect(readOutbox(s)).toEqual([])
  })
})
