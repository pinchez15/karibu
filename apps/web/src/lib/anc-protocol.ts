/**
 * ANC protocol scheduling + gap detection (Uganda MOH ANC8).
 * Mirrors apps/android/.../domain/AncProtocol.kt
 */

export const ANC_SCHEDULE_WEEKS = [12, 20, 26, 30, 34, 36, 38, 40] as const
export const IPTP_TARGET = 3
const IPTP_START_WEEK = 20

export type AncProtocolStatus = {
  gestationWeeks: number | null
  contactsDone: number
  contactsDue: number
  iptpDone: number
  ancBehind: boolean
  iptpBehind: boolean
  dueSoon: boolean
  postDates: boolean
  gaps: string[]
}

function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(iso.slice(0, 10))
  return Number.isNaN(d.getTime()) ? null : d
}

function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime()
  return Math.floor(ms / (24 * 60 * 60 * 1000))
}

function weeksBetween(start: Date, end: Date): number {
  return Math.max(0, Math.floor(daysBetween(start, end) / 7))
}

export function eddFromLmp(lmp: Date): Date {
  const d = new Date(lmp)
  d.setDate(d.getDate() + 280)
  return d
}

export function gestationWeeks(lmp: string | null | undefined, today = new Date()): number | null {
  const lmpDate = parseDate(lmp)
  if (!lmpDate) return null
  return weeksBetween(lmpDate, today)
}

export function contactsDue(gestationWeeksVal: number | null): number {
  if (gestationWeeksVal == null) return 0
  return ANC_SCHEDULE_WEEKS.filter((w) => w <= gestationWeeksVal).length
}

export function ancProtocolStatus(input: {
  lmp: string | null | undefined
  edd: string | null | undefined
  contactsDone: number
  iptpDone: number
  today?: Date
}): AncProtocolStatus {
  const today = input.today ?? new Date()
  const ga = gestationWeeks(input.lmp, today)
  const due = contactsDue(ga)
  const ancBehind = input.contactsDone < due
  const iptpBehind = ga != null && ga >= IPTP_START_WEEK && input.iptpDone < IPTP_TARGET

  const lmpDate = parseDate(input.lmp)
  const eddDate = parseDate(input.edd) ?? (lmpDate ? eddFromLmp(lmpDate) : null)

  const postDates = eddDate != null && today > eddDate
  const dueSoon =
    eddDate != null &&
    !postDates &&
    today <= eddDate &&
    daysBetween(today, eddDate) <= 14

  const gaps: string[] = []
  if (ancBehind) gaps.push(`ANC ${input.contactsDone}/${due}`)
  if (iptpBehind) gaps.push(`IPTp ${input.iptpDone}/${IPTP_TARGET}`)
  if (postDates) gaps.push('Post-dates')
  else if (dueSoon) gaps.push('Due soon')

  return {
    gestationWeeks: ga,
    contactsDone: input.contactsDone,
    contactsDue: due,
    iptpDone: input.iptpDone,
    ancBehind,
    iptpBehind,
    dueSoon,
    postDates,
    gaps,
  }
}

/** Derive LMP from gestation weeks entered at registration (matches Android). */
export function lmpFromGestationWeeks(weeks: number, today = new Date()): string {
  const d = new Date(today)
  d.setDate(d.getDate() - weeks * 7)
  return d.toISOString().slice(0, 10)
}
