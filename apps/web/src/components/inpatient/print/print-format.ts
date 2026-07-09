/** Pure formatting helpers for the inpatient print views (B3/B4). Kept
 *  dependency-free (no server/client boundary) so they're easy to unit test. */

export type PrintFacility = {
  name: string
  phone: string | null
  umdpc_number: string | null
  district: string | null
  subcounty: string | null
}

export function facilityAddressLine(facility: PrintFacility): string | null {
  const parts = [facility.subcounty, facility.district].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : null
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Whole days between admission and discharge, minimum 1 (day of admission counts). */
export function lengthOfStayDays(admittedAt: string, dischargedAt: string | null): number | null {
  if (!dischargedAt) return null
  const admitted = new Date(admittedAt).getTime()
  const discharged = new Date(dischargedAt).getTime()
  if (Number.isNaN(admitted) || Number.isNaN(discharged)) return null
  return Math.max(1, Math.round((discharged - admitted) / 86_400_000) + 1)
}

export function ageDisplay(dob: string | null): string {
  if (!dob) return '—'
  const d = new Date(`${dob.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return '—'
  const now = new Date()
  let years = now.getUTCFullYear() - d.getUTCFullYear()
  const m = now.getUTCMonth() - d.getUTCMonth()
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) years -= 1
  return years >= 0 ? `${years}y` : '—'
}

export function capitalize(text: string | null | undefined): string {
  if (!text) return '—'
  return text.charAt(0).toUpperCase() + text.slice(1)
}
