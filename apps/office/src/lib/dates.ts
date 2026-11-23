import type { TFn } from '@/i18n'

const DAY = 86_400_000

export function daysSince(iso: string, now = Date.now()): number {
  return Math.floor((now - new Date(iso).getTime()) / DAY)
}

export function relativeDay(iso: string, t: TFn, now = Date.now()): string {
  const d = daysSince(iso, now)
  if (d <= 0) return t('common.today')
  if (d === 1) return t('common.yesterday')
  return t('common.daysAgo', { n: d })
}

/** "23 Nov 2026" in the office's timezone. Partners and clinics are in Uganda today. */
export function shortDate(iso: string, timeZone = 'Africa/Kampala'): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone }).format(new Date(iso))
}

export function monthLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso))
}
