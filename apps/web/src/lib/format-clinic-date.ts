/** Clinic wall-clock timezone (Uganda). */
export const CLINIC_TIMEZONE = 'Africa/Kampala'

function clinicDateParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: CLINIC_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const year = parts.find((p) => p.type === 'year')?.value ?? '1970'
  const month = parts.find((p) => p.type === 'month')?.value ?? '01'
  const day = parts.find((p) => p.type === 'day')?.value ?? '01'
  return { year, month, day }
}

/** Start of a clinic calendar day as ISO timestamp (Africa/Kampala, UTC+3). */
export function clinicDayStartIso(dateIso: string): string {
  return `${dateIso}T00:00:00+03:00`
}

/** End of a clinic calendar day as ISO timestamp (Africa/Kampala, UTC+3). */
export function clinicDayEndIso(dateIso: string): string {
  return `${dateIso}T23:59:59.999+03:00`
}

/** ISO date (YYYY-MM-DD) in clinic local time — matches visit_date / kampala_today(). */
export function clinicTodayIso(now = new Date()): string {
  const { year, month, day } = clinicDateParts(now)
  return `${year}-${month}-${day}`
}

export function clinicMonthStartIso(now = new Date()): string {
  const { year, month } = clinicDateParts(now)
  return `${year}-${month}-01`
}

export function clinicYearStartIso(now = new Date()): string {
  const { year } = clinicDateParts(now)
  return `${year}-01-01`
}

/**
 * Readable date for clinic staff — en-UG locale, Kampala timezone.
 * Example: "Tuesday, 26 May 2026"
 */
export function formatClinicDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-UG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: CLINIC_TIMEZONE,
  }).format(date)
}

/** Short numeric date (DD/MM/YYYY). */
export function formatClinicDateShort(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-UG', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: CLINIC_TIMEZONE,
  }).format(date)
}
