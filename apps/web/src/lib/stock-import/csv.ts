/**
 * Lightweight CSV helpers for stock bulk import (RFC 4180-ish).
 * No external dependency — clinic staff may upload exports from Excel/Sheets.
 */

export function escapeCsvField(value: string | number): string {
  if (typeof value === 'number') return String(value)
  if (!value.includes(',') && !value.includes('"') && !value.includes('\n')) return value
  return `"${value.replace(/"/g, '""')}"`
}

export function rowToCsv(fields: (string | number)[]): string {
  return fields.map(escapeCsvField).join(',')
}

/** Parse a single CSV line respecting quoted fields. */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      fields.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current.trim())
  return fields
}

export function parseCsv(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  if (!normalized) return []

  const rows: string[][] = []
  let currentLine = ''
  let inQuotes = false

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i]
    if (ch === '"') {
      inQuotes = !inQuotes
      currentLine += ch
    } else if (ch === '\n' && !inQuotes) {
      if (currentLine.trim()) rows.push(parseCsvLine(currentLine))
      currentLine = ''
    } else {
      currentLine += ch
    }
  }
  if (currentLine.trim()) rows.push(parseCsvLine(currentLine))
  return rows
}

/** Parse tab-separated paste from Excel / Google Sheets. */
export function parseTsv(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  if (!normalized) return []
  return normalized
    .split('\n')
    .map((line) => line.split('\t').map((cell) => cell.trim()))
    .filter((row) => row.some((cell) => cell.length > 0))
}

export function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

export function mapRowsByHeader(
  rows: string[][],
  columnMap: Record<string, string>,
): Record<string, string>[] {
  if (rows.length === 0) return []

  const [headerRow, ...dataRows] = rows
  const headers = headerRow.map(normalizeHeader)

  const indexByField: Record<string, number> = {}
  for (const [canonical, aliases] of Object.entries(columnMap)) {
    const aliasList = aliases.split('|').map(normalizeHeader)
    const idx = headers.findIndex((h) => aliasList.includes(h) || h === canonical)
    if (idx >= 0) indexByField[canonical] = idx
  }

  return dataRows
    .filter((row) => row.some((cell) => cell.trim().length > 0))
    .map((row) => {
      const obj: Record<string, string> = {}
      for (const [field, idx] of Object.entries(indexByField)) {
        obj[field] = (row[idx] ?? '').trim()
      }
      return obj
    })
}

export const PHARMACY_CSV_COLUMNS = [
  'name',
  'code',
  'strength',
  'formulation',
  'unit',
  'quantity',
  'low_at',
  'batch',
  'expires',
  'supplier',
  'notes',
] as const

export const LAB_CSV_COLUMNS = [
  'name',
  'code',
  'category',
  'unit',
  'quantity',
  'low_at',
  'batch',
  'expires',
  'supplier',
  'notes',
] as const

export const PHARMACY_COLUMN_MAP: Record<string, string> = {
  name: 'name|drug_name|drug|item|medicine|medication',
  code: 'code|drug_code|sku',
  strength: 'strength|dose|dosage',
  formulation: 'formulation|form|type',
  unit: 'unit|units|uom',
  quantity: 'quantity|qty|amount|on_hand|opening_qty|opening_quantity|stock',
  low_at: 'low_at|low_stock|low_threshold|reorder',
  batch: 'batch|batch_number|lot',
  expires: 'expires|expiry|expires_at|exp_date',
  supplier: 'supplier|vendor',
  notes: 'notes|comment|remarks',
}

export const LAB_COLUMN_MAP: Record<string, string> = {
  name: 'name|test_name|item|test|material',
  code: 'code|test_code|sku',
  category: 'category|type',
  unit: 'unit|units|uom',
  quantity: 'quantity|qty|amount|on_hand|opening_qty|opening_quantity|stock',
  low_at: 'low_at|low_stock|low_threshold|reorder',
  batch: 'batch|batch_number|lot',
  expires: 'expires|expiry|expires_at|exp_date',
  supplier: 'supplier|vendor',
  notes: 'notes|comment|remarks',
}

export function pharmacyTemplateCsv(): string {
  const header = rowToCsv([...PHARMACY_CSV_COLUMNS])
  const example = rowToCsv([
    'Amoxicillin',
    'AMOX',
    '500mg',
    'tablet',
    'tablets',
    120,
    20,
    'BATCH-001',
    '2026-12-31',
    'NMS',
    'Opening stock from paper list',
  ])
  return `${header}\n${example}\n`
}

export function labTemplateCsv(kind: 'lab' | 'clinical'): string {
  const header = rowToCsv([...LAB_CSV_COLUMNS])
  const example =
    kind === 'clinical'
      ? rowToCsv([
          'Examination gloves (medium)',
          '',
          'consumable',
          'boxes',
          5,
          2,
          '',
          '',
          'Joint Medical Stores',
          '',
        ])
      : rowToCsv([
          'Malaria RDT (25-test kit)',
          'MAL_RDT',
          'rdt_kit',
          'kits',
          3,
          1,
          'LOT-4421',
          '2026-06-30',
          'SD Bioline',
          '',
        ])
  return `${header}\n${example}\n`
}

export function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
