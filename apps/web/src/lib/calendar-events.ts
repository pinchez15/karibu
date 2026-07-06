export type ClinicEventType = 'follow_up' | 'drive' | 'admin' | 'external_lab_agency'

export type ClinicAppointment = {
  id: string
  patient_id: string | null
  patient_name: string | null
  event_type: ClinicEventType
  title: string | null
  reason: string | null
  scheduled_at: string
  scheduled_end: string | null
  unit: string | null
  status: string
}

export const CLINIC_EVENT_META: Record<
  ClinicEventType,
  { label: string; shortLabel: string; color: string; textColor: string; hint: string }
> = {
  follow_up: {
    label: 'Patient follow-up',
    shortLabel: 'Follow-up',
    color: '#1e5a8a',
    textColor: '#ffffff',
    hint: 'TB, HIV/ART, hypertension, ANC, or post-visit return — linked to patient chart',
  },
  drive: {
    label: 'Outreach / clinic day',
    shortLabel: 'Outreach',
    color: '#0d9488',
    textColor: '#ffffff',
    hint: 'Immunization (EPI), community mobilization, ANC day, or VHT coordination',
  },
  admin: {
    label: 'Admin / reporting',
    shortLabel: 'Admin',
    color: '#64748b',
    textColor: '#ffffff',
    hint: 'Morning handover, HMIS reporting, stock count, or staff meeting',
  },
  external_lab_agency: {
    label: 'Lab run / agency visit',
    shortLabel: 'Lab / agency',
    color: '#c27803',
    textColor: '#ffffff',
    hint: 'Hub lab sample transport, district supervisor, or partner agency visit',
  },
}

/** Quick-fill titles for HC III scheduling (no DB change — maps to existing event types). */
export const EVENT_TITLE_PRESETS: Partial<Record<ClinicEventType, string[]>> = {
  drive: [
    'Immunization drive (EPI)',
    'Outreach / community mobilization',
    'ANC clinic day',
    'ART clinic day',
    'VHT coordination meeting',
  ],
  admin: [
    'Morning handover',
    'HMIS 105 reporting deadline',
    'Monthly stock count',
    'Staff meeting',
  ],
  external_lab_agency: [
    'Hub lab sample run',
    'District supervisor visit',
    'Partner agency visit',
  ],
}

export function appointmentTitle(a: ClinicAppointment): string {
  if (a.patient_name) return a.patient_name
  if (a.title?.trim()) return a.title.trim()
  return CLINIC_EVENT_META[a.event_type]?.shortLabel ?? 'Event'
}

// The clinic is in Uganda (Africa/Kampala), which is permanently UTC+3 with no
// daylight saving. We render and enter the whole calendar in clinic-local time
// so a viewer in any timezone (e.g. an admin abroad) and the clinic staff see
// the same clock — otherwise FullCalendar shows each event in the viewer's
// browser timezone and times/days drift.
export const CLINIC_TZ = 'Africa/Kampala'
export const CLINIC_OFFSET_MS = 3 * 60 * 60 * 1000

/** UTC instant ISO -> naive ISO of the Kampala wall-clock (feed FullCalendar with timeZone="UTC"). */
export function utcToClinicNaiveIso(utcIso: string): string {
  return new Date(Date.parse(utcIso) + CLINIC_OFFSET_MS).toISOString().slice(0, 19)
}

/** Kampala wall-clock date ("2026-07-06") + time ("11:00") -> UTC instant ISO for storage. */
export function clinicFieldsToUtcIso(dateStr: string, timeStr: string): string {
  return new Date(`${dateStr}T${timeStr}:00+03:00`).toISOString()
}

/** UTC instant ISO -> Kampala {date,time} strings for form inputs. */
export function utcToClinicFields(utcIso: string): { date: string; time: string } {
  const naive = utcToClinicNaiveIso(utcIso)
  return { date: naive.slice(0, 10), time: naive.slice(11, 16) }
}

/** Today's date in the clinic timezone as "YYYY-MM-DD". */
export function clinicTodayStr(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** Format a UTC instant for display in clinic-local time. */
export function formatClinicDateTime(utcIso: string): string {
  return new Date(utcIso).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: CLINIC_TZ,
  })
}

export function toFullCalendarEvent(a: ClinicAppointment) {
  const meta = CLINIC_EVENT_META[a.event_type] ?? CLINIC_EVENT_META.admin
  const endUtc = a.scheduled_end
    ? a.scheduled_end
    : new Date(new Date(a.scheduled_at).getTime() + 30 * 60 * 1000).toISOString()

  return {
    id: a.id,
    title: appointmentTitle(a),
    start: utcToClinicNaiveIso(a.scheduled_at),
    end: utcToClinicNaiveIso(endUtc),
    backgroundColor: meta.color,
    borderColor: meta.color,
    textColor: meta.textColor,
    extendedProps: {
      eventType: a.event_type,
      patientId: a.patient_id,
      reason: a.reason,
      rawTitle: a.title,
    },
  }
}
