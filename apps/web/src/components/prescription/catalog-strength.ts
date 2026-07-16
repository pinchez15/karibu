import type {
  DispenseUnit,
  DoseUnit,
  PrescriptionForm,
} from '@karibu/shared'

/**
 * Structured interpretation of a catalog strength string (e.g. "500mg cap",
 * "125mg/5mL susp", "625mg tab"). PHARM-4 stores strength as structured fields;
 * the seed catalog only carries free-text strengths, so we parse them here.
 *
 * IMPORTANT for the quantity compute: when `dose_unit === 'mg'`,
 * `computePrescriptionQuantity` divides the mg dose by `strength_amount` to get
 * units-per-dose. For a solid (tab/cap) that means mg-per-unit (e.g. 500). For a
 * liquid written as a ratio ("125mg/5mL") that means the *concentration* in
 * mg/mL (125 / 5 = 25), because one dispense unit of a liquid is 1 mL. So this
 * parser normalizes a ratio strength to a per-mL concentration.
 */
export interface ParsedCatalogStrength {
  /** mg (or IU) per one dispense unit; for liquids, the mg/mL concentration. */
  strength_amount: number | null
  /** Canonical strength unit: 'mg' for solids, 'mg/mL' for a concentration, etc. */
  strength_unit: string | null
  /** Dosage form inferred from the trailing keyword. */
  form: PrescriptionForm | null
  /** Unit stock is counted in at the counter. */
  dispense_unit: DispenseUnit | null
  /** True when the strength was written as a concentration ratio (mg per mL). */
  isConcentration: boolean
}

const EMPTY: ParsedCatalogStrength = {
  strength_amount: null,
  strength_unit: null,
  form: null,
  dispense_unit: null,
  isConcentration: false,
}

/** Trailing form keyword -> (form, dispense_unit). Order matters: longest first. */
const FORM_KEYWORDS: Array<{
  match: RegExp
  form: PrescriptionForm
  dispense_unit: DispenseUnit
}> = [
  { match: /\b(caps?|capsules?)\b/i, form: 'capsule', dispense_unit: 'cap' },
  { match: /\b(tabs?|tablets?)\b/i, form: 'tablet', dispense_unit: 'tab' },
  { match: /\b(susp|suspension)\b/i, form: 'suspension', dispense_unit: 'mL' },
  { match: /\b(syr|syrup)\b/i, form: 'syrup', dispense_unit: 'mL' },
  { match: /\b(soln|solution)\b/i, form: 'solution', dispense_unit: 'mL' },
  { match: /\b(inj|injection|amp|ampoule)\b/i, form: 'injection', dispense_unit: 'vial' },
  { match: /\bvial\b/i, form: 'vial', dispense_unit: 'vial' },
  { match: /\bsachet\b/i, form: 'sachet', dispense_unit: 'sachet' },
  { match: /\b(drops?)\b/i, form: 'drops', dispense_unit: 'drop' },
  { match: /\binhaler\b/i, form: 'inhaler', dispense_unit: 'inhaler' },
]

/** Normalize a bare amount+unit to a mg value where sensible (g -> mg). */
function normalizeToMg(
  amount: number,
  unit: string,
): { amount: number; unit: string } {
  const u = unit.toLowerCase()
  if (u === 'g') return { amount: amount * 1000, unit: 'mg' }
  if (u === 'mg') return { amount, unit: 'mg' }
  if (u === 'mcg') return { amount, unit: 'mcg' }
  if (u === 'iu') return { amount, unit: 'IU' }
  if (u === '%') return { amount, unit: '%' }
  return { amount, unit }
}

/**
 * Parse a catalog strength string into structured fields. Best-effort: returns
 * nulls for the parts it can't interpret (e.g. "tablet", "sachet", "20/120 mg"
 * combination products) while still recovering the form / dispense unit so the
 * UI can offer sensible defaults. Never throws.
 */
export function parseCatalogStrength(raw: string): ParsedCatalogStrength {
  const text = (raw ?? '').trim()
  if (!text) return { ...EMPTY }

  // 1. Form / dispense unit from the trailing keyword.
  let form: PrescriptionForm | null = null
  let dispense_unit: DispenseUnit | null = null
  for (const kw of FORM_KEYWORDS) {
    if (kw.match.test(text)) {
      form = kw.form
      dispense_unit = kw.dispense_unit
      break
    }
  }

  // 2. Concentration ratio, e.g. "125mg/5mL", "10IU/mL", "228mg/5mL".
  const conc = text.match(
    /(\d+(?:\.\d+)?)\s*(mg|g|mcg|IU)\s*\/\s*(\d+(?:\.\d+)?)?\s*m[lL]/i,
  )
  if (conc) {
    const numerator = Number(conc[1])
    const perMl = conc[3] ? Number(conc[3]) : 1
    const { amount, unit } = normalizeToMg(numerator, conc[2])
    const concentration = perMl > 0 ? amount / perMl : amount
    return {
      strength_amount: round3(concentration),
      strength_unit: `${unit}/mL`,
      form: form ?? 'suspension',
      dispense_unit: dispense_unit ?? 'mL',
      isConcentration: true,
    }
  }

  // 3. Reject combination products ("20/120 mg") — two amounts, no ratio unit.
  //    We can't represent them as a single strength_amount, so leave it null.
  if (/\d+\s*\/\s*\d+/.test(text)) {
    return { ...EMPTY, form, dispense_unit }
  }

  // 4. Simple amount+unit, e.g. "500mg", "625mg tab", "1g", "50%", "60mg vial".
  const simple = text.match(/(\d+(?:\.\d+)?)\s*(mg|g|mcg|IU|%)/i)
  if (simple) {
    const { amount, unit } = normalizeToMg(Number(simple[1]), simple[2])
    return {
      strength_amount: round3(amount),
      strength_unit: unit,
      form,
      dispense_unit,
      isConcentration: false,
    }
  }

  // 5. No numeric strength at all (e.g. "tablet", "sachet").
  return { ...EMPTY, form, dispense_unit }
}

function round3(v: number): number {
  return Math.round((v + Number.EPSILON) * 1000) / 1000
}

/** Map a dispense unit to the dose_unit clinicians would enter it in, if any. */
export function doseUnitForDispense(
  dispense: DispenseUnit | null | undefined,
): DoseUnit | null {
  switch (dispense) {
    case 'tab':
      return 'tab'
    case 'cap':
      return 'cap'
    case 'mL':
    case 'bottle':
      return 'mL'
    case 'drop':
      return 'drop'
    case 'puff':
    case 'inhaler':
      return 'puff'
    default:
      return null
  }
}
