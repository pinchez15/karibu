import type { ReviewPanelVisit } from './load-visit'
import { sectionsToClinicianText } from '@/lib/clinical-note-sections'

export function formatPatientDemographics(patient: ReviewPanelVisit['patient']): {
  sexLabel: string
  ageLabel: string
  missingSex: boolean
  missingAge: boolean
} {
  const sexLabel =
    patient.sex === 'M' ? 'Male' : patient.sex === 'F' ? 'Female' : 'Not recorded'

  let ageLabel = 'Not recorded'
  if (patient.dob_precision === 'exact' && patient.date_of_birth) {
    const dob = new Date(patient.date_of_birth)
    const years = Math.floor(
      (Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
    )
    ageLabel = `DOB ${dob.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} (${years} yrs)`
  } else if (patient.dob_precision === 'year_only' && patient.birth_year) {
    ageLabel = `Born ${patient.birth_year}`
  } else if (patient.dob_precision === 'age_estimate' && patient.approximate_age != null) {
    ageLabel = `~${patient.approximate_age} years (estimate)`
  }

  return {
    sexLabel,
    ageLabel,
    missingSex: patient.sex == null,
    missingAge: patient.dob_precision === 'unknown',
  }
}

export function buildNotePreview(visit: ReviewPanelVisit): string {
  if (visit.clinician_note_content?.trim()) {
    return visit.clinician_note_content.trim()
  }
  const fromSections = sectionsToClinicianText(visit.initialNoteSections).trim()
  if (fromSections) return fromSections
  return visit.provider_notes?.transcript?.trim() ?? ''
}

export function hasDiagnosis(visit: ReviewPanelVisit): boolean {
  const dx =
    visit.diagnosis?.trim() ||
    visit.initialNoteSections.diagnosis?.trim() ||
    ''
  return dx.length > 0
}
