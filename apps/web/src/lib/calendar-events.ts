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
    hint: 'Linked to a patient chart',
  },
  drive: {
    label: 'Immunization drive / outreach',
    shortLabel: 'Drive',
    color: '#0d9488',
    textColor: '#ffffff',
    hint: 'Clinic-wide event (e.g. immunization day)',
  },
  admin: {
    label: 'Admin / clinic task',
    shortLabel: 'Admin',
    color: '#64748b',
    textColor: '#ffffff',
    hint: 'Meetings, stock count, reporting',
  },
  external_lab_agency: {
    label: 'External lab / agency visit',
    shortLabel: 'Lab / agency',
    color: '#c27803',
    textColor: '#ffffff',
    hint: 'Outside lab pickup or agency visit',
  },
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
