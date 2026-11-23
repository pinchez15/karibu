// Small CSV reader for clinic list imports. Handles quoted fields, commas and
// newlines inside quotes, CRLF, and a UTF-8 BOM (Excel exports).

export function parseCsv(input: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const s = input.replace(/^﻿/, '')

  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',' || c === ';' || c === '\t') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((v) => v.trim() !== '')) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some((v) => v.trim() !== '')) rows.push(row)
  return rows
}

const HEADER_ALIASES: Record<string, string> = {
  name: 'name', clinic: 'name', facility: 'name', 'facility name': 'name', 'clinic name': 'name',
  district: 'district',
  level: 'facility_level', 'facility level': 'facility_level', facility_level: 'facility_level', type: 'facility_level',
  contact: 'contact_name', contact_name: 'contact_name', 'contact name': 'contact_name', 'in charge': 'contact_name',
  phone: 'contact_phone', contact_phone: 'contact_phone', 'contact phone': 'contact_phone', telephone: 'contact_phone',
  notes: 'notes', note: 'notes',
  staff: 'staff_count', staff_count: 'staff_count', 'number of staff': 'staff_count',
}

export interface ClinicImportRow {
  name: string
  district?: string
  facility_level?: string
  contact_name?: string
  contact_phone?: string
  notes?: string
  staff_count?: string
}

/** Maps a CSV with a header row to clinic rows. Throws if there is no name column. */
export function clinicRowsFromCsv(input: string): ClinicImportRow[] {
  const rows = parseCsv(input)
  if (rows.length < 2) return []
  const headers = rows[0].map((h) => HEADER_ALIASES[h.trim().toLowerCase()] ?? null)
  if (!headers.includes('name')) throw new Error('NO_NAME_COLUMN')
  return rows.slice(1).map((cells) => {
    const out: Record<string, string> = {}
    headers.forEach((key, i) => {
      const value = (cells[i] ?? '').trim()
      if (key && value) out[key] = value
    })
    return out as unknown as ClinicImportRow
  }).filter((r) => r.name)
}
