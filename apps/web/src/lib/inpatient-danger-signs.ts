/** Deterministic danger-sign evaluation for inpatient rounds (mirrors Android). */

export const INPATIENT_DANGER_ACTION = 'Consider referral · call the Clinical Officer'

const FEVER_C = 39.0
const HYPOXIA_SPO2 = 90
const SHOCK_SYSTOLIC = 90
const HYPERTENSIVE_SYSTOLIC = 180
const HYPERTENSIVE_DIASTOLIC = 120

export type InpatientObservation = {
  tempC?: number | null
  pulseBpm?: number | null
  respRate?: number | null
  bpSystolic?: number | null
  bpDiastolic?: number | null
  spo2Pct?: number | null
  avpu?: string | null
  imciNotFeeding?: boolean
  imciVomitingEverything?: boolean
  imciConvulsions?: boolean
  imciLethargicUnconscious?: boolean
}

export type DangerFinding = { slug: string; label: string }

export function fastBreathingThreshold(ageYears: number): number {
  if (ageYears < 1) return 50
  if (ageYears < 5) return 40
  return 30
}

export function evaluateInpatientDangerSigns(
  obs: InpatientObservation,
  ageYears: number | null,
): DangerFinding[] {
  const out: DangerFinding[] = []

  if (obs.spo2Pct != null && obs.spo2Pct < HYPOXIA_SPO2) {
    out.push({ slug: 'hypoxia', label: `SpO₂ ${obs.spo2Pct}% — hypoxia` })
  }
  if (obs.tempC != null && obs.tempC >= FEVER_C) {
    out.push({ slug: 'high_fever', label: `Temperature ${trimNum(obs.tempC)}°C` })
  }
  if (obs.respRate != null && ageYears != null && obs.respRate >= fastBreathingThreshold(ageYears)) {
    out.push({
      slug: 'fast_breathing',
      label: `Respiratory rate ${obs.respRate}/min — fast breathing for age`,
    })
  } else if (obs.respRate != null && ageYears == null && obs.respRate > 30) {
    out.push({ slug: 'fast_breathing', label: `Respiratory rate ${obs.respRate}/min` })
  }
  const avpu = obs.avpu?.toUpperCase()
  if (avpu === 'P') out.push({ slug: 'reduced_consciousness', label: 'Responds to pain only (AVPU P)' })
  if (avpu === 'U') out.push({ slug: 'reduced_consciousness', label: 'Unresponsive (AVPU U)' })

  if (ageYears != null && ageYears >= 12) {
    const sys = obs.bpSystolic
    const dia = obs.bpDiastolic
    if (sys != null && sys < SHOCK_SYSTOLIC) {
      out.push({ slug: 'shock', label: `BP ${bpText(sys, dia)} — possible shock` })
    }
    if (
      (sys != null && sys >= HYPERTENSIVE_SYSTOLIC) ||
      (dia != null && dia >= HYPERTENSIVE_DIASTOLIC)
    ) {
      out.push({ slug: 'hypertensive_crisis', label: `BP ${bpText(sys, dia)} — severe hypertension` })
    }
  }

  if (obs.imciNotFeeding) out.push({ slug: 'imci_not_feeding', label: 'Not feeding / drinking' })
  if (obs.imciVomitingEverything) out.push({ slug: 'imci_vomiting', label: 'Vomiting everything' })
  if (obs.imciConvulsions) out.push({ slug: 'imci_convulsions', label: 'Convulsions' })
  if (obs.imciLethargicUnconscious) out.push({ slug: 'imci_lethargic', label: 'Lethargic / unconscious' })

  return out
}

export function checkObservationRanges(v: {
  tempC?: number | null
  pulseBpm?: number | null
  respRate?: number | null
  bpSystolic?: number | null
  bpDiastolic?: number | null
  spo2Pct?: number | null
}): string[] {
  const out: string[] = []
  if (v.tempC != null && (v.tempC < 30 || v.tempC > 44)) {
    out.push(`Temperature ${trimNum(v.tempC)}°C looks unusual — entered correctly?`)
  }
  if (v.pulseBpm != null && (v.pulseBpm < 25 || v.pulseBpm > 250)) {
    out.push(`Pulse ${v.pulseBpm} bpm looks unusual — entered correctly?`)
  }
  if (v.respRate != null && (v.respRate < 5 || v.respRate > 80)) {
    out.push(`Respiratory rate ${v.respRate}/min looks unusual — entered correctly?`)
  }
  if (v.bpSystolic != null && (v.bpSystolic < 50 || v.bpSystolic > 280)) {
    out.push(`Systolic BP ${v.bpSystolic} looks unusual — entered correctly?`)
  }
  if (v.bpDiastolic != null && (v.bpDiastolic < 20 || v.bpDiastolic > 200)) {
    out.push(`Diastolic BP ${v.bpDiastolic} looks unusual — entered correctly?`)
  }
  if (
    v.bpSystolic != null &&
    v.bpDiastolic != null &&
    v.bpSystolic <= v.bpDiastolic
  ) {
    out.push(
      `BP ${v.bpSystolic}/${v.bpDiastolic} — systolic should be higher than diastolic. Entered correctly?`,
    )
  }
  if (v.spo2Pct != null && (v.spo2Pct < 50 || v.spo2Pct > 100)) {
    out.push(`SpO₂ ${v.spo2Pct}% looks unusual — entered correctly?`)
  }
  return out
}

function bpText(sys: number | null | undefined, dia: number | null | undefined): string {
  return `${sys ?? '—'}/${dia ?? '—'}`
}

function trimNum(d: number): string {
  return d === Math.trunc(d) ? String(Math.trunc(d)) : String(d)
}
