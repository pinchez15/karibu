/**
 * Deterministic danger-sign rules for HC III (docs/ai-clinical-assist.md).
 * Mirrors Android CriticalAlertRules.kt — no AI; clinician is final authority.
 */

export type AlertTier = 'critical' | 'confirm'

export type CriticalAlertCandidate = {
  ruleSlug: string
  confirmQuestion: string
  clinicalPrompt: string
  librarySlug: string | null
  tier: AlertTier
}

export type PatientForAlerts = {
  dateOfBirth: string | null
}

export type VitalsForAlerts = {
  temp_c?: number | null
  spo2_pct?: number | null
  bp_systolic?: number | null
  bp_diastolic?: number | null
  resp_rate?: number | null
  muac_cm?: number | null
}

const CRITICAL_RULES = new Set([
  'hypoxia',
  'hyperpyrexia',
  'fast_breathing',
  'hypertensive_crisis',
  'severe_hypotension',
  'severe_acute_malnutrition',
])

export function tierFor(ruleSlug: string): AlertTier {
  return CRITICAL_RULES.has(ruleSlug) ? 'critical' : 'confirm'
}

function ageYears(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null
  const dob = new Date(dateOfBirth)
  if (Number.isNaN(dob.getTime())) return null
  const today = new Date()
  let years = today.getFullYear() - dob.getFullYear()
  const monthDelta = today.getMonth() - dob.getMonth()
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < dob.getDate())) {
    years -= 1
  }
  return years
}

function fastBreathingThreshold(years: number): number {
  if (years < 1) return 50
  if (years < 5) return 40
  return 30
}

function bpText(sys: number | null | undefined, dia: number | null | undefined): string {
  return `${sys ?? '—'}/${dia ?? '—'}`
}

export function evaluateCriticalAlerts(
  patient: PatientForAlerts | null,
  vitals: VitalsForAlerts | null,
): CriticalAlertCandidate[] {
  if (!vitals) return []

  const years = ageYears(patient?.dateOfBirth ?? null)
  const out: CriticalAlertCandidate[] = []

  function add(
    slug: string,
    question: string,
    prompt: string,
    library: string | null = null,
  ) {
    out.push({
      ruleSlug: slug,
      confirmQuestion: question,
      clinicalPrompt: prompt,
      librarySlug: library,
      tier: tierFor(slug),
    })
  }

  const temp = vitals.temp_c ?? null
  const spo2 = vitals.spo2_pct ?? null
  const sys = vitals.bp_systolic ?? null
  const dia = vitals.bp_diastolic ?? null
  const rr = vitals.resp_rate ?? null
  const muac = vitals.muac_cm ?? null

  if (spo2 != null && spo2 < 90) {
    add(
      'hypoxia',
      `SpO₂ ${spo2}% — hypoxia.`,
      'Give oxygen and manage or refer per the HC III emergency protocol. Re-check on room air and on oxygen.',
    )
  }
  if (temp != null && temp >= 40.0) {
    add(
      'hyperpyrexia',
      `Temperature ${temp}°C — hyperpyrexia.`,
      'Start active cooling and antipyretics; look for serious infection and IMCI danger signs.',
    )
  }
  if (rr != null && years != null && rr >= fastBreathingThreshold(years)) {
    add(
      'fast_breathing',
      `Respiratory rate ${rr}/min — fast breathing for age.`,
      'Classify pneumonia and screen for danger signs (IMCI). Consider oxygen and referral if severe.',
    )
  }
  if (years != null && years >= 12) {
    if ((sys != null && sys >= 180) || (dia != null && dia >= 120)) {
      add(
        'hypertensive_crisis',
        `BP ${bpText(sys, dia)} — severe hypertension.`,
        'Assess for a hypertensive emergency / end-organ damage per Uganda Clinical Guidelines.',
      )
    }
    if (sys != null && sys < 90) {
      add(
        'severe_hypotension',
        `BP ${bpText(sys, dia)} — possible shock.`,
        'Assess perfusion and mental state; resuscitate and refer if shock is confirmed.',
      )
    }
  }
  if (muac != null && muac < 11.5 && years != null && years < 5) {
    add(
      'severe_acute_malnutrition',
      `MUAC ${muac} cm — severe acute malnutrition.`,
      'Check for bilateral oedema and complications; manage or refer per IMAM.',
    )
  }
  if (years != null && years < 1 && temp != null && temp >= 39.4 && temp < 40.0) {
    add(
      'infant_high_fever',
      `Was this temperature (${temp}°C) entered correctly?`,
      'If confirmed, consider serious bacterial infection and a meningitis workup per IMCI danger signs.',
    )
  }

  return out
}
