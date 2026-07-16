import { describe, expect, it } from 'vitest'
import type { QueueItem } from '@karibu/shared'
import type { ClinicAppointment } from '@/lib/calendar-events'
import {
  buildNeedsAttention,
  countWaiting,
  countWithClinician,
  groupAppointmentsByDay,
  hmisDueLabel,
} from './dashboard-briefing-helpers'

function queueItem(status: QueueItem['queue_status']): QueueItem {
  return {
    visit_id: `v-${status}-${Math.random()}`,
    patient_id: 'p1',
    patient_name: 'Test',
    patient_phone: '',
    queue_position: 1,
    queue_status: status,
    priority: 'normal',
    chief_complaint: null,
    checked_in_at: '',
    nurse_id: null,
    nurse_name: null,
    doctor_id: null,
    doctor_name: null,
    wait_minutes: 0,
  }
}

function appt(id: string, scheduled_at: string, patient_id: string | null = null): ClinicAppointment {
  return {
    id,
    patient_id,
    patient_name: patient_id ? 'Jane' : null,
    event_type: 'follow_up',
    title: null,
    reason: null,
    scheduled_at,
    scheduled_end: null,
    unit: null,
    status: 'scheduled',
  }
}

describe('queue derivations', () => {
  it('counts waiting and with-clinician independently', () => {
    const queue = [
      queueItem('waiting'),
      queueItem('waiting'),
      queueItem('with_nurse'),
      queueItem('ready_for_doctor'),
      queueItem('with_doctor'),
    ]
    expect(countWaiting(queue)).toBe(2)
    expect(countWithClinician(queue)).toBe(2)
  })

  it('returns zero on an empty queue (no crash)', () => {
    expect(countWaiting([])).toBe(0)
    expect(countWithClinician([])).toBe(0)
  })
})

describe('buildNeedsAttention', () => {
  it('orders rows most-urgent first: stock > finalize > partial > balances', () => {
    const rows = buildNeedsAttention({
      toFinalize: 3,
      outOfStockCount: 2,
      outstandingBalances: 5,
      partialDispenses: 1,
    })
    expect(rows.map((r) => r.id)).toEqual(['stock', 'finalize', 'partial', 'balances'])
    expect(rows[0].severity).toBeGreaterThan(rows[rows.length - 1].severity)
  })

  it('drops categories whose count is zero', () => {
    const rows = buildNeedsAttention({
      toFinalize: 0,
      outOfStockCount: 0,
      outstandingBalances: 4,
      partialDispenses: 0,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('balances')
    expect(rows[0].detail).toContain('4')
  })

  it('returns an empty list when everything is clear', () => {
    expect(
      buildNeedsAttention({
        toFinalize: 0,
        outOfStockCount: 0,
        outstandingBalances: 0,
        partialDispenses: 0,
      }),
    ).toEqual([])
  })

  it('singularises detail copy for a count of one', () => {
    const rows = buildNeedsAttention({
      toFinalize: 1,
      outOfStockCount: 1,
      outstandingBalances: 1,
      partialDispenses: 1,
    })
    const stock = rows.find((r) => r.id === 'stock')!
    expect(stock.detail).toBe('1 item unavailable')
  })
})

describe('groupAppointmentsByDay', () => {
  const now = new Date(2026, 6, 17, 8, 0) // Fri 17 Jul 2026, local

  it('produces N consecutive buckets starting today, marking today', () => {
    const buckets = groupAppointmentsByDay([], 8, now)
    expect(buckets).toHaveLength(8)
    expect(buckets[0].isToday).toBe(true)
    expect(buckets[0].dayNumber).toBe(17)
    expect(buckets[1].dayNumber).toBe(18)
    expect(buckets.slice(1).every((b) => b.isToday === false)).toBe(true)
  })

  it('buckets appointments into the correct day and sorts by start time', () => {
    const appts = [
      appt('late', new Date(2026, 6, 18, 14, 0).toISOString()),
      appt('early', new Date(2026, 6, 18, 9, 0).toISOString()),
      appt('today', new Date(2026, 6, 17, 11, 0).toISOString(), 'p9'),
    ]
    const buckets = groupAppointmentsByDay(appts, 8, now)
    expect(buckets[0].items.map((a) => a.id)).toEqual(['today'])
    // Day 18 holds both, earliest first.
    expect(buckets[1].items.map((a) => a.id)).toEqual(['early', 'late'])
  })

  it('ignores appointments outside the window', () => {
    const appts = [appt('past', new Date(2026, 6, 1, 9, 0).toISOString())]
    const buckets = groupAppointmentsByDay(appts, 8, now)
    expect(buckets.every((b) => b.items.length === 0)).toBe(true)
  })
})

describe('hmisDueLabel', () => {
  it('targets the 7th of the following month', () => {
    expect(hmisDueLabel(new Date(2026, 6, 17))).toBe('7 Aug')
    expect(hmisDueLabel(new Date(2026, 11, 20))).toBe('7 Jan')
  })
})
