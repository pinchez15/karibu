/**
 * CSV / TSV parsing for bulk stock import.
 * Column order matches clinic spreadsheet templates (name … unit_price … notes).
 */

export type ColumnDef = {
  key: string
  label: string
  required?: boolean
  placeholder?: string
  /** Right-align numeric price column like a spreadsheet. */
  align?: 'left' | 'right'
}

/** Pharmacy stock CSV columns (matches clinic pharmacy-stock template). */
export const PHARMACY_CSV_COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'name', required: true, placeholder: 'Amoxicillin' },
  { key: 'brand_generic', label: 'brand_generic', placeholder: 'Flagyl' },
  { key: 'code', label: 'code', placeholder: 'AMOX' },
  { key: 'strength', label: 'strength', placeholder: '500mg' },
  { key: 'formulation', label: 'formulation', placeholder: 'tablet' },
  { key: 'unit', label: 'unit', required: true, placeholder: 'tablets' },
  { key: 'quantity', label: 'quantity', placeholder: '0' },
  { key: 'unit_price', label: 'unit_price', placeholder: '3000', align: 'right' },
  { key: 'low_at', label: 'low_at', placeholder: '10' },
  { key: 'batch', label: 'batch', placeholder: '' },
  { key: 'expires', label: 'expires', placeholder: 'YYYY-MM-DD' },
  { key: 'supplier', label: 'supplier', placeholder: '' },
  { key: 'notes', label: 'notes', placeholder: '' },
]

/** Lab materials CSV columns. */
export const LAB_CSV_COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'name', required: true, placeholder: 'Malaria RDT' },
  { key: 'brand_generic', label: 'brand_generic', placeholder: '' },
  { key: 'code', label: 'code', placeholder: 'MAL_RDT' },
  { key: 'category', label: 'category', placeholder: 'rdt_kit' },
  { key: 'unit', label: 'unit', required: true, placeholder: 'tests' },
  { key: 'quantity', label: 'quantity', placeholder: '0' },
  { key: 'unit_price', label: 'unit_price', placeholder: '2000', align: 'right' },
  { key: 'low_at', label: 'low_at', placeholder: '5' },
  { key: 'batch', label: 'batch', placeholder: '' },
  { key: 'expires', label: 'expires', placeholder: 'YYYY-MM-DD' },
  { key: 'supplier', label: 'supplier', placeholder: '' },
  { key: 'notes', label: 'notes', placeholder: '' },
]

/** Clinical supplies — same shape as lab; category defaults to consumable on import. */
export const CLINICAL_CSV_COLUMNS: ColumnDef[] = LAB_CSV_COLUMNS

export const PHARMACY_COLUMN_MAP: Record<string, string> = {
  name: 'name',
  drug: 'name',
  drug_name: 'name',
  medication: 'name',
  medicine: 'name',
  brand: 'brand_generic',
  brand_generic: 'brand_generic',
  brand_generi: 'brand_generic',
  brand_name: 'brand_generic',
  code: 'code',
  drug_code: 'code',
  strength: 'strength',
  dose: 'strength',
  formulation: 'formulation',
  form: 'formulation',
  unit: 'unit',
  units: 'unit',
  qty: 'quantity',
  quantity: 'quantity',
  qoh: 'quantity',
  count: 'quantity',
  stock: 'quantity',
  unit_price: 'unit_price',
  price: 'unit_price',
  unit_price_ugx: 'unit_price',
  price_ugx: 'unit_price',
  low_at: 'low_at',
  low: 'low_at',
  threshold: 'low_at',
  low_stock: 'low_at',
  batch: 'batch',
  batch_number: 'batch',
  expires: 'expires',
  expiry: 'expires',
  expires_at: 'expires',
  exp: 'expires',
  supplier: 'supplier',
  vendor: 'supplier',
  notes: 'notes',
  note: 'notes',
}

export const LAB_COLUMN_MAP: Record<string, string> = {
  name: 'name',
  test: 'name',
  test_name: 'name',
  item: 'name',
  brand: 'brand_generic',
  brand_generic: 'brand_generic',
  brand_generi: 'brand_generic',
  code: 'code',
  test_code: 'code',
  category: 'category',
  type: 'category',
  unit: 'unit',
  units: 'unit',
  qty: 'quantity',
  quantity: 'quantity',
  qoh: 'quantity',
  count: 'quantity',
  stock: 'quantity',
  unit_price: 'unit_price',
  price: 'unit_price',
  unit_price_ugx: 'unit_price',
  price_ugx: 'unit_price',
  low_at: 'low_at',
  low: 'low_at',
  threshold: 'low_at',
  batch: 'batch',
  batch_number: 'batch',
  expires: 'expires',
  expiry: 'expires',
  expires_at: 'expires',
  supplier: 'supplier',
  notes: 'notes',
  note: 'notes',
}

export function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if ((c === ',' && !inQuotes) || c === '\r') {
      out.push(cur.trim())
      cur = ''
    } else {
      cur += c
    }
  }
  out.push(cur.trim())
  return out
}

export function parseCsv(text: string): string[][] {
  const lines = text.split(/\n/).filter((l) => l.trim().length > 0)
  return lines.map(parseCsvLine)
}

export function parseTsv(text: string): string[][] {
  return text
    .split(/\n/)
    .filter((l) => l.trim().length > 0)
    .map((line) => line.split('\t').map((c) => c.trim()))
}

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

export function mapRowsByHeader(
  rows: string[][],
  columnMap: Record<string, string>,
): Record<string, string>[] {
  if (rows.length === 0) return []

  const headerRow = rows[0]
  const normalized = headerRow.map(normalizeHeader)
  const hasHeader = normalized.some((h) => h in columnMap)

  const dataRows = hasHeader ? rows.slice(1) : rows
  const fieldKeys = hasHeader
    ? normalized.map((h) => columnMap[h] ?? h)
    : null

  return dataRows
    .filter((row) => row.some((c) => c.trim().length > 0))
    .map((row) => {
      const obj: Record<string, string> = {}
      if (fieldKeys) {
        fieldKeys.forEach((key, i) => {
          if (key && row[i] !== undefined) obj[key] = row[i]
        })
      } else {
        row.forEach((val, i) => {
          obj[`col_${i}`] = val
        })
      }
      return obj
    })
}

export function rowsToCsv(columns: ColumnDef[], dataRows: Record<string, string>[]): string {
  const header = columns.map((c) => c.key).join(',')
  const lines = dataRows.map((row) =>
    columns
      .map((c) => {
        const v = row[c.key] ?? ''
        if (v.includes(',') || v.includes('"') || v.includes('\n')) {
          return `"${v.replace(/"/g, '""')}"`
        }
        return v
      })
      .join(','),
  )
  return [header, ...lines].join('\n')
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Sample rows for template download — mirrors clinic spreadsheet examples. */
export const PHARMACY_TEMPLATE_ROWS: Record<string, string>[] = [
  {
    name: 'Vitamin B Complex',
    brand_generic: '',
    code: 'VITB_INJ',
    strength: '100mls',
    formulation: 'injection',
    unit: 'vials',
    quantity: '40',
    unit_price: '3000',
    low_at: '',
    batch: '',
    expires: '',
    supplier: '',
    notes: '',
  },
  {
    name: 'Metronidazole',
    brand_generic: 'Flagyl',
    code: 'METR_INJ',
    strength: '',
    formulation: 'injection',
    unit: 'vials',
    quantity: '22',
    unit_price: '5000',
    low_at: '',
    batch: '',
    expires: '',
    supplier: '',
    notes: '',
  },
  {
    name: 'Paracetamol',
    brand_generic: '',
    code: 'PARA_100ML',
    strength: '100ml',
    formulation: 'liquid',
    unit: 'bottles',
    quantity: '30',
    unit_price: '6000',
    low_at: '',
    batch: '',
    expires: '',
    supplier: '',
    notes: '',
  },
]

export const LAB_TEMPLATE_ROWS: Record<string, string>[] = [
  {
    name: 'Malaria RDT',
    brand_generic: '',
    code: 'MAL_RDT',
    category: 'rdt_kit',
    unit: 'tests',
    quantity: '5425',
    unit_price: '2000',
    low_at: '',
    batch: '',
    expires: '',
    supplier: '',
    notes: '',
  },
  {
    name: 'Blood Slide (BS)',
    brand_generic: '',
    code: 'BLOODSLI',
    category: 'slide_stain',
    unit: 'tests',
    quantity: '50',
    unit_price: '2000',
    low_at: '',
    batch: '',
    expires: '',
    supplier: '',
    notes: 'Added from price list (lab service)',
  },
]

export const CLINICAL_TEMPLATE_ROWS: Record<string, string>[] = [
  {
    name: 'Syringes 2mls',
    brand_generic: '',
    code: 'SYR_2ML',
    category: 'consumable',
    unit: 'pieces',
    quantity: '4',
    unit_price: '500',
    low_at: '',
    batch: '',
    expires: '',
    supplier: '',
    notes: '',
  },
  {
    name: 'GIV set',
    brand_generic: '',
    code: 'GIVSET',
    category: 'consumable',
    unit: 'pieces',
    quantity: '2',
    unit_price: '1000',
    low_at: '',
    batch: '',
    expires: '',
    supplier: '',
    notes: 'Added from price list',
  },
]

export function pharmacyTemplateCsv(): string {
  return rowsToCsv(PHARMACY_CSV_COLUMNS, PHARMACY_TEMPLATE_ROWS)
}

export function labTemplateCsv(kind: 'lab' | 'clinical'): string {
  const rows = kind === 'clinical' ? CLINICAL_TEMPLATE_ROWS : LAB_TEMPLATE_ROWS
  return rowsToCsv(LAB_CSV_COLUMNS, rows)
}
