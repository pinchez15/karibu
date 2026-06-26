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
