import { afterEach, describe, expect, it, vi } from 'vitest'
import { startOfTodayInTimezoneIso } from './clinic-time'

describe('startOfTodayInTimezoneIso', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns Kampala midnight after the UTC day has rolled but before Kampala has', () => {
    // 22:30Z is already 01:30 the next day in Kampala (UTC+3), so "today"
    // started at 21:00Z of the current UTC date.
    vi.setSystemTime(new Date('2026-07-06T22:30:00Z'))
    expect(startOfTodayInTimezoneIso('Africa/Kampala')).toBe('2026-07-06T21:00:00.000Z')
  })

  it('returns the previous UTC evening for a mid-morning UTC time', () => {
    // 10:00Z is 13:00 Kampala; local midnight was 21:00Z the previous day.
    vi.setSystemTime(new Date('2026-07-06T10:00:00Z'))
    expect(startOfTodayInTimezoneIso('Africa/Kampala')).toBe('2026-07-05T21:00:00.000Z')
  })

  it('defaults to Africa/Kampala', () => {
    vi.setSystemTime(new Date('2026-07-06T10:00:00Z'))
    expect(startOfTodayInTimezoneIso()).toBe('2026-07-05T21:00:00.000Z')
  })
})
