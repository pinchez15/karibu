// Deterministic English→Luganda rendering for medication directions on the
// dispense receipt (#13e). Print paths must not call an LLM, so this is a
// token map over the common HC III sig abbreviations/phrases. Free-text the
// map doesn't recognize is left in English; the bilingual safety footer always
// prints in both languages.

const FREQUENCY: [RegExp, string][] = [
  [/\b(t\.?d\.?s|three times (a )?(day|daily)|3x\/?day|8[ -]?hourly)\b/i, 'emirundi esatu buli lunaku'],
  [/\b(q\.?d\.?s|four times (a )?(day|daily)|4x\/?day|6[ -]?hourly)\b/i, 'emirundi ena buli lunaku'],
  [/\b(b\.?d|b\.?i\.?d|twice (a )?(day|daily)|2x\/?day|12[ -]?hourly)\b/i, 'emirundi ebiri buli lunaku'],
  [/\b(o\.?d|once (a )?(day|daily)|daily|1x\/?day|24[ -]?hourly)\b/i, 'omulundi gumu buli lunaku'],
  [/\b(nocte|at night|at bedtime)\b/i, 'ekiro nga tonnaba kwebaka'],
  [/\b(mane|in the morning)\b/i, 'ku makya'],
  [/\b(p\.?r\.?n|as needed|when required)\b/i, "ng'okyetaagisa"],
  [/\b(stat|immediately)\b/i, 'mangu ago'],
]

const ROUTE: [RegExp, string][] = [
  [/\b(p\.?o|by mouth|oral(ly)?)\b/i, 'mu kamwa'],
  [/\b(i\.?m|intramuscular)\b/i, 'empiso mu binywa'],
  [/\b(i\.?v|intravenous)\b/i, 'empiso mu musaayi'],
  [/\b(top(ical)?|apply)\b/i, 'siiga ku lususu'],
]

function translateDuration(s: string): string {
  return s
    .replace(/for\s+(\d+)\s*(days?|\/7|x\s*\d*\s*days?)/i, 'okumala ennaku $1')
    .replace(/for\s+(\d+)\s*(weeks?|\/52)/i, 'okumala wiiki $1')
}

/** Build the English sig line from structured fields. */
export function englishSig(parts: {
  dose_text?: string | null
  route_text?: string | null
  frequency_text?: string | null
  duration_text?: string | null
}): string {
  return [parts.dose_text, parts.route_text, parts.frequency_text, parts.duration_text]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(' ')
}

/** Best-effort Luganda rendering of the same sig via token substitution. */
export function lugandaSig(parts: {
  dose_text?: string | null
  route_text?: string | null
  frequency_text?: string | null
  duration_text?: string | null
}): string {
  let out = englishSig(parts)
  if (!out) return ''
  for (const [re, t] of [...ROUTE, ...FREQUENCY]) out = out.replace(re, t)
  out = translateDuration(out)
  return out
}

export const ENGLISH_SAFETY = ['Finish all the medicine.', 'Keep away from children.']
export const LUGANDA_SAFETY = ['Maliriza eddagala lyonna.', 'Tereka eddagala awatali baana.']
