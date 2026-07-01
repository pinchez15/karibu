/** Uganda MoH / WHO VHF suspect-case screening (mirrors Android OutbreakScreeningRules). */

export const EBOLA_PROTOCOL = 'ebola'
export const FEVER_THRESHOLD_C = 38.0
export const MIN_SYMPTOMS = 3

export const VHF_SYMPTOMS = [
  { slug: 'headache', label: 'Headache' },
  { slug: 'vomiting', label: 'Vomiting / nausea' },
  { slug: 'anorexia', label: 'Loss of appetite' },
  { slug: 'diarrhoea', label: 'Diarrhoea' },
  { slug: 'lethargy', label: 'Intense fatigue / lethargy' },
  { slug: 'abdominal_pain', label: 'Abdominal pain' },
  { slug: 'muscle_pain', label: 'Muscle or joint pain' },
  { slug: 'difficulty_swallowing', label: 'Difficulty swallowing' },
  { slug: 'difficulty_breathing', label: 'Difficulty breathing' },
  { slug: 'hiccups', label: 'Hiccups' },
] as const

export type VhfSymptomSlug = (typeof VHF_SYMPTOMS)[number]['slug']

export type EbolaScreenInput = {
  tempC: number | null
  epidemiologicalContact: boolean
  unexplainedBleeding: boolean
  symptoms: VhfSymptomSlug[]
}

export function screenEbola(input: EbolaScreenInput): {
  isSuspect: boolean
  triggers: string[]
} {
  const triggers: string[] = []
  if (input.tempC == null || input.tempC < FEVER_THRESHOLD_C) {
    return { isSuspect: false, triggers: [] }
  }
  triggers.push(`Fever ${input.tempC}°C (≥ ${FEVER_THRESHOLD_C}°C)`)

  let qualifies = false
  if (input.epidemiologicalContact) {
    triggers.push('Epidemiological contact reported')
    qualifies = true
  }
  if (input.unexplainedBleeding) {
    triggers.push('Unexplained bleeding')
    qualifies = true
  }
  if (input.symptoms.length >= MIN_SYMPTOMS) {
    const labels = input.symptoms
      .map((s) => VHF_SYMPTOMS.find((v) => v.slug === s)?.label ?? s)
      .join(', ')
    triggers.push(`${input.symptoms.length} constitutional symptoms: ${labels}`)
    qualifies = true
  }

  return { isSuspect: qualifies, triggers }
}
