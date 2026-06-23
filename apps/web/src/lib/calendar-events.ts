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

export function toFullCalendarEvent(a: ClinicAppointment) {
  const meta = CLINIC_EVENT_META[a.event_type] ?? CLINIC_EVENT_META.admin
  const end = a.scheduled_end
    ? a.scheduled_end
    : new Date(new Date(a.scheduled_at).getTime() + 30 * 60 * 1000).toISOString()

  return {
    id: a.id,
    title: appointmentTitle(a),
    start: a.scheduled_at,
    end,
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
