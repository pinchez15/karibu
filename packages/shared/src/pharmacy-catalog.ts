/** HC III formulary — offline fallback when DB catalog is unavailable. */

export const PHARMACY_FREQUENCIES = [
  { code: 'OD', label: 'OD — once daily' },
  { code: 'BID', label: 'BID — twice daily' },
  { code: 'TID', label: 'TID — three times daily' },
  { code: 'QID', label: 'QID — four times daily' },
  { code: 'q4h', label: 'q4h — every 4 hours' },
  { code: 'q6h', label: 'q6h — every 6 hours' },
  { code: 'q8h', label: 'q8h — every 8 hours' },
  { code: 'q12h', label: 'q12h — every 12 hours' },
  { code: 'STAT', label: 'STAT — once now' },
  { code: 'HS', label: 'HS — at bedtime' },
  { code: 'AC', label: 'AC — before meals' },
  { code: 'PC', label: 'PC — after meals' },
  { code: 'PRN', label: 'PRN — as needed' },
] as const;

export const PHARMACY_ROUTES = [
  { code: 'PO', label: 'PO — oral' },
  { code: 'IV', label: 'IV — intravenous' },
  { code: 'IM', label: 'IM — intramuscular' },
  { code: 'SC', label: 'SC — subcutaneous' },
  { code: 'PR', label: 'PR — rectal' },
  { code: 'SL', label: 'SL — sublingual' },
  { code: 'Topical', label: 'Topical' },
  { code: 'Inhaled', label: 'Inhaled / neb' },
  { code: 'PV', label: 'PV — vaginal' },
  { code: 'OD/OS/OU', label: 'Ophthalmic' },
] as const;

export const PHARMACY_DURATIONS = [
  { days: 1, label: '1 day' },
  { days: 3, label: '3 days' },
  { days: 5, label: '5 days' },
  { days: 7, label: '7 days' },
  { days: 10, label: '10 days' },
  { days: 14, label: '14 days' },
  { days: 21, label: '21 days' },
  { days: 30, label: '30 days (1 month)' },
] as const;

export interface PharmacyCatalogDrug {
  code: string;
  name: string;
  aliases?: string[];
  strengths: string[];
  defaultFrequency?: string;
  defaultRoute?: string;
  category: string;
  warning?: string;
}

export const PHARMACY_CATALOG_DRUGS: PharmacyCatalogDrug[] = [
  {
    code: 'AL',
    name: 'Artemether/Lumefantrine (AL)',
    aliases: ['Coartem'],
    strengths: ['20/120 mg'],
    defaultFrequency: 'BID',
    category: 'Antimalarials',
  },
  {
    code: 'ARTESUNATE',
    name: 'Artesunate (IV/IM)',
    strengths: ['60mg vial'],
    defaultRoute: 'IV',
    defaultFrequency: 'STAT',
    category: 'Antimalarials',
    warning: 'Severe malaria only. Refer if HC III cannot administer.',
  },
  {
    code: 'AMOX',
    name: 'Amoxicillin',
    strengths: ['250mg cap', '500mg cap', '125mg/5mL susp', '250mg/5mL susp'],
    defaultFrequency: 'TID',
    category: 'Antibiotics',
  },
  {
    code: 'AMOX_CLAV',
    name: 'Amoxicillin / Clavulanic acid',
    strengths: ['625mg tab', '1g tab', '228mg/5mL susp'],
    defaultFrequency: 'BID',
    category: 'Antibiotics',
  },
  {
    code: 'COTRIM',
    name: 'Cotrimoxazole',
    strengths: ['480mg tab', '960mg tab', '240mg/5mL susp'],
    defaultFrequency: 'BID',
    category: 'Antibiotics',
  },
  {
    code: 'CIPRO',
    name: 'Ciprofloxacin',
    strengths: ['250mg tab', '500mg tab'],
    defaultFrequency: 'BID',
    category: 'Antibiotics',
  },
  {
    code: 'PARA',
    name: 'Paracetamol',
    strengths: ['500mg tab', '125mg/5mL susp'],
    defaultFrequency: 'PRN',
    category: 'Analgesics',
  },
  {
    code: 'IBU',
    name: 'Ibuprofen',
    strengths: ['400mg tab', '200mg tab'],
    defaultFrequency: 'TID',
    category: 'Analgesics',
  },
  {
    code: 'ORS',
    name: 'ORS (oral rehydration salts)',
    strengths: ['sachet'],
    defaultFrequency: 'PRN',
    category: 'Fluids',
  },
  {
    code: 'IRON_FOLATE',
    name: 'Iron + folic acid',
    strengths: ['tablet'],
    defaultFrequency: 'OD',
    category: 'Supplements',
  },
  {
    code: 'OXY',
    name: 'Oxytocin (IV/IM)',
    strengths: ['10IU/mL'],
    defaultRoute: 'IM',
    defaultFrequency: 'STAT',
    category: 'Obstetrics',
  },
  {
    code: 'MGSO4',
    name: 'Magnesium sulfate',
    strengths: ['50% inj'],
    defaultRoute: 'IM',
    defaultFrequency: 'STAT',
    category: 'Obstetrics',
  },
];

export function pharmacyDrugsByCategory(): Array<[string, PharmacyCatalogDrug[]]> {
  const grouped = new Map<string, PharmacyCatalogDrug[]>();
  for (const drug of PHARMACY_CATALOG_DRUGS) {
    const list = grouped.get(drug.category) ?? [];
    list.push(drug);
    grouped.set(drug.category, list);
  }
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function formatPrescriptionSig(input: {
  drugName: string;
  strength?: string;
  quantityText?: string;
  route?: string;
  frequency?: string;
  durationDays?: number;
  notes?: string;
}): string {
  const parts: string[] = [input.drugName];
  if (input.strength?.trim()) parts.push(input.strength.trim());
  if (input.quantityText?.trim()) parts.push(input.quantityText.trim());
  if (input.route) parts.push(input.route);
  if (input.frequency) parts.push(input.frequency);
  if (input.durationDays) parts.push(`x ${input.durationDays}d`);
  const base = parts.join(' ');
  return input.notes?.trim() ? `${base} (${input.notes.trim()})` : base;
}

export function prescriptionLineDisplayName(line: {
  medication_code?: string | null;
  free_text_name?: string | null;
}): string {
  if (line.free_text_name?.trim()) return line.free_text_name.trim();
  const drug = PHARMACY_CATALOG_DRUGS.find((d) => d.code === line.medication_code);
  return drug?.name ?? line.medication_code ?? 'Medication';
}

// =============================================================================
// PHARM-4 — structured course-of-treatment prescribing + computed quantity
// =============================================================================
//
// The canonical quantity-computation logic. A Kotlin mirror lives in
// HcDrugCatalog.kt (Agent E) and BOTH implementations are pinned by the golden
// vectors in packages/shared/src/__fixtures__/quantity-vectors.json. Do not
// change the arithmetic here without regenerating those vectors and updating
// the Kotlin mirror — the two must produce identical numbers (spec R6).

/**
 * Canonical frequency codes (uppercase). Mirrors HcDrugCatalog.Frequency.
 * Note: existing UI enums historically use lowercase q4h/q6h/q8h/q12h — the DB
 * RPC and this map normalize to UPPERCASE, so the canonical wire value is
 * uppercase (Q4H, not q4h). AC/PC are kept as meal-timing modifiers (spec R5).
 */
export const FREQUENCY_CODES = [
  'OD', 'BID', 'TID', 'QID', 'Q4H', 'Q6H', 'Q8H', 'Q12H', 'HS', 'STAT', 'PRN', 'AC', 'PC',
] as const;
export type FrequencyCode = (typeof FREQUENCY_CODES)[number];

/** Dose unit — the unit the dose amount is expressed in per administration. */
export const DOSE_UNITS = ['mg', 'mL', 'tab', 'cap', 'drop', 'puff'] as const;
export type DoseUnit = (typeof DOSE_UNITS)[number];

/**
 * Dispense unit — the unit stock is counted in at the counter. Distinct from
 * strength unit (mg, mg/mL). Includes container concepts (bottle, inhaler)
 * so the computed number is right for stock decrement (spec R5).
 */
export const DISPENSE_UNITS = [
  'tab', 'cap', 'mL', 'bottle', 'inhaler', 'sachet', 'vial', 'drop', 'puff', 'dose',
] as const;
export type DispenseUnit = (typeof DISPENSE_UNITS)[number];

/** Strength unit — belongs to the drug (e.g. 500 mg, 125 mg/5mL concentration). */
export const STRENGTH_UNITS = ['mg', 'mL', 'g', 'mcg', 'IU', '%', 'mg/mL', 'mg/5mL'] as const;
export type StrengthUnit = (typeof STRENGTH_UNITS)[number];

/** Dosage form (from catalog). */
export const PRESCRIPTION_FORMS = [
  'tablet', 'capsule', 'syrup', 'suspension', 'solution', 'injection',
  'inhaler', 'drops', 'sachet', 'cream', 'ointment', 'pessary', 'vial',
] as const;
export type PrescriptionForm = (typeof PRESCRIPTION_FORMS)[number];

/** scheduled = quantity computed; fixed_quantity = clinician enters total (PRN). */
export const ORDER_MODES = ['scheduled', 'fixed_quantity'] as const;
export type OrderMode = (typeof ORDER_MODES)[number];

/** Provenance of the dispensable quantity (R6 — replaces the retired manual_confirmed). */
export const QUANTITY_SOURCES = ['computed', 'overridden'] as const;
export type QuantitySource = (typeof QUANTITY_SOURCES)[number];

/**
 * frequency_code -> canonical doses per day. STAT maps to 1 but the compute
 * forces total_doses = 1 (one dose, ignores duration). PRN is not schedulable
 * (null) — it must ride the fixed_quantity path.
 */
export const FREQUENCY_PER_DAY: Record<FrequencyCode, number | null> = {
  OD: 1,
  BID: 2,
  TID: 3,
  QID: 4,
  Q4H: 6,
  Q6H: 4,
  Q8H: 3,
  Q12H: 2,
  HS: 1,
  AC: 3, // meal-timing modifier ~ TID
  PC: 3, // meal-timing modifier ~ TID
  STAT: 1,
  PRN: null,
};

/** Normalize a frequency code to uppercase and look up its doses/day. */
export function frequencyPerDay(code: string | null | undefined): number | null {
  if (!code) return null;
  const c = code.trim().toUpperCase();
  if (!(c in FREQUENCY_PER_DAY)) return null;
  return FREQUENCY_PER_DAY[c as FrequencyCode];
}

/** Container dispense units — computed amount is rounded UP to whole containers. */
const CONTAINER_DISPENSE_UNITS: DispenseUnit[] = ['bottle', 'inhaler'];

/**
 * Sanity range for units-per-dose on solid oral forms (tab/cap). Outside this
 * band (e.g. dose_amount=1mg on a 500mg drug -> 0.002 tab) the clinician must
 * explicitly confirm (spec R5). Ugandan practice allows half-tablets, so
 * fractions that are not multiples of 0.5 are also flagged.
 */
export const SANITY_MIN_UNITS_PER_DOSE = 0.25;
export const SANITY_MAX_UNITS_PER_DOSE = 4;

export interface QuantityComputeInput {
  /** 'scheduled' (compute) or 'fixed_quantity' (PRN — clinician enters total). */
  order_mode: OrderMode;
  /** Required for scheduled. Uppercase canonical code (Q4H, STAT, ...). */
  frequency_code?: string | null;
  /** Required for scheduled (except STAT, which is one dose). */
  duration_days?: number | null;
  /** Dose per administration, in dose_unit. */
  dose_amount: number;
  dose_unit: DoseUnit;
  /**
   * mg per one dispense unit — mg/tab for solids, or concentration (mg/mL) for
   * liquids. Only consulted when dose_unit = 'mg'.
   */
  strength_amount?: number | null;
  dispense_unit: DispenseUnit;
  /** Clinician-entered total for order_mode = 'fixed_quantity'. */
  fixed_quantity?: number | null;
  /** Units (mL or puffs) per container when dispense_unit is a container. */
  container_size?: number | null;
}

export interface QuantityComputeResult {
  /** Dispensable quantity in dispense_unit, or null when inputs are insufficient. */
  quantity: number | null;
  /** Units of dispense_unit per single administration (null for fixed_quantity). */
  units_per_dose: number | null;
  /** frequency_per_day * duration_days (1 for STAT); null for fixed_quantity. */
  total_doses: number | null;
  /** True when the clinician must explicitly confirm (out-of-range / missing data). */
  needs_confirmation: boolean;
  /** Machine-readable reasons for needs_confirmation. */
  flags: string[];
}

function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

/**
 * Compute the dispensable quantity for a prescription line. Deterministic;
 * pinned by quantity-vectors.json. Branches on dose_unit (spec R5):
 *   tab/cap/drop/puff/mL -> units_per_dose = dose_amount directly
 *   mg                    -> units_per_dose = dose_amount / strength_amount
 * Scheduled: quantity = units_per_dose * frequency_per_day * duration_days.
 * STAT: total_doses = 1. Container dispense units round UP to whole containers.
 */
export function computePrescriptionQuantity(
  input: QuantityComputeInput,
): QuantityComputeResult {
  const flags: string[] = [];

  // ---- fixed_quantity (PRN): clinician enters the total directly ----
  if (input.order_mode === 'fixed_quantity') {
    const q = input.fixed_quantity ?? null;
    const bad = q == null || q <= 0;
    if (bad) flags.push('fixed_quantity_required');
    return {
      quantity: bad ? null : roundTo(q as number, 3),
      units_per_dose: null,
      total_doses: null,
      needs_confirmation: bad,
      flags,
    };
  }

  // ---- scheduled: derive units_per_dose (in dispense_unit) ----
  let unitsPerDose: number | null;
  switch (input.dose_unit) {
    case 'tab':
    case 'cap':
    case 'drop':
    case 'puff':
    case 'mL':
      unitsPerDose = input.dose_amount;
      break;
    case 'mg':
      if (!input.strength_amount || input.strength_amount <= 0) {
        flags.push('strength_required_for_mg_dose');
        unitsPerDose = null;
      } else {
        unitsPerDose = input.dose_amount / input.strength_amount;
      }
      break;
    default:
      flags.push('unknown_dose_unit');
      unitsPerDose = null;
  }

  // ---- total_doses ----
  let totalDoses: number | null;
  const freq = (input.frequency_code ?? '').trim().toUpperCase();
  if (freq === 'STAT') {
    totalDoses = 1;
  } else {
    const perDay = frequencyPerDay(freq);
    if (perDay == null) {
      flags.push('frequency_not_schedulable');
      totalDoses = null;
    } else if (input.duration_days == null || input.duration_days <= 0) {
      flags.push('duration_required');
      totalDoses = null;
    } else {
      totalDoses = perDay * input.duration_days;
    }
  }

  if (unitsPerDose == null || totalDoses == null) {
    return {
      quantity: null,
      units_per_dose: unitsPerDose == null ? null : roundTo(unitsPerDose, 3),
      total_doses: totalDoses,
      needs_confirmation: true,
      flags,
    };
  }

  // ---- sanity band (solid oral forms only) ----
  let needs = false;
  const solid =
    input.dose_unit === 'tab' ||
    input.dose_unit === 'cap' ||
    (input.dose_unit === 'mg' &&
      (input.dispense_unit === 'tab' || input.dispense_unit === 'cap'));
  if (solid) {
    if (
      unitsPerDose < SANITY_MIN_UNITS_PER_DOSE ||
      unitsPerDose > SANITY_MAX_UNITS_PER_DOSE
    ) {
      flags.push('units_per_dose_out_of_range');
      needs = true;
    }
    if (Math.abs(unitsPerDose * 2 - Math.round(unitsPerDose * 2)) > 1e-9) {
      flags.push('non_half_tablet_fraction');
      needs = true;
    }
  }

  // ---- quantity (round UP to whole containers where applicable) ----
  let quantity = unitsPerDose * totalDoses;
  if (CONTAINER_DISPENSE_UNITS.includes(input.dispense_unit)) {
    if (!input.container_size || input.container_size <= 0) {
      flags.push('container_size_required');
      needs = true;
    } else {
      quantity = Math.ceil(quantity / input.container_size);
    }
  }

  return {
    quantity: roundTo(quantity, 3),
    units_per_dose: roundTo(unitsPerDose, 3),
    total_doses: totalDoses,
    needs_confirmation: needs,
    flags,
  };
}
