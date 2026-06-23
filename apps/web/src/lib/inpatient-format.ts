/** Shared inpatient display helpers (mirrors Android WardCensusScreen). */

export function wardLabel(ward: string): string {
  return ward === 'maternity' ? 'Maternity' : 'General'
}

export function ageBandFromDob(dob: string | null): string | null {
  if (!dob) return null
  const d = new Date(`${dob.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  let years = now.getUTCFullYear() - d.getUTCFullYear()
  let months = now.getUTCMonth() - d.getUTCMonth()
  let days = now.getUTCDate() - d.getUTCDate()
  if (days < 0) {
    months -= 1
    days += 30
  }
  if (months < 0) {
    years -= 1
    months += 12
  }
  if (years >= 1) return `${years}y`
  if (months >= 1) return `${months}m`
  return `${Math.max(days, 0)}d`
}

export function ageYearsFromDob(dob: string | null): number | null {
  if (!dob) return null
  const d = new Date(`${dob.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  let years = now.getUTCFullYear() - d.getUTCFullYear()
  const m = now.getUTCMonth() - d.getUTCMonth()
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) years -= 1
  return years
}

export function dayOfStay(admittedAt: string): string {
  const admitted = new Date(admittedAt)
  if (Number.isNaN(admitted.getTime())) return ''
  const days = Math.floor((Date.now() - admitted.getTime()) / 86_400_000)
  return `Day ${days + 1}`
}

export function lastObsLabel(lastObservedAt: string | null): string {
  if (!lastObservedAt) return 'No obs yet'
  const t = new Date(lastObservedAt)
  if (Number.isNaN(t.getTime())) return ''
  const mins = Math.floor((Date.now() - t.getTime()) / 60_000)
  if (mins < 1) return 'Obs just now'
  if (mins < 60) return `Obs ${mins}m ago`
  if (mins < 1440) return `Obs ${Math.floor(mins / 60)}h ago`
  return `Obs ${Math.floor(mins / 1440)}d ago`
}

export function timeAgo(iso: string): string {
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return ''
  const mins = Math.floor((Date.now() - t.getTime()) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`
  return `${Math.floor(mins / 1440)}d ago`
}
