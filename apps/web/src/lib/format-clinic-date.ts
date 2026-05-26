/** Clinic wall-clock timezone (Uganda). */
export const CLINIC_TIMEZONE = 'Africa/Kampala'

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
