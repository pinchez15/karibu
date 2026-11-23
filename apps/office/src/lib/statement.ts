// Statement CSV -> payment rows (spec §7.G). Banks and operators each export
// their own columns, so headers are matched loosely and anything unreadable is
// reported back row by row rather than silently dropped.
import { parseCsv } from './csv'

export interface StatementRow {
  amount: number
  method: 'momo_mtn' | 'airtel' | 'bank' | 'cash'
  reference?: string
  payer_phone?: string
  payer_name?: string
  paid_at?: string
  raw_evidence: string
}

const ALIASES: [RegExp, keyof StatementRow | 'date' | 'credit'][] = [
  [/^(amount|amt|value)$/, 'amount'],
  [/^(credit|money in|paid in|deposit|cr)$/, 'credit'],
  [/^(date|time|transaction date|txn date|value date|completed)$/, 'date'],
  [/(reference|ref|transaction id|txn id|trans id|tid|receipt)/, 'reference'],
  [/(phone|msisdn|number|from account|sender number)/, 'payer_phone'],
  [/(name|from|sender|payer|narration|description|details)/, 'payer_name'],
  [/^(method|channel|network|type)$/, 'method'],
]

function methodOf(value: string | undefined, fallback: StatementRow['method']): StatementRow['method'] {
  const v = (value ?? '').toLowerCase()
  if (/mtn|momo/.test(v)) return 'momo_mtn'
  if (/airtel/.test(v)) return 'airtel'
  if (/bank|eft|rtgs|cheque/.test(v)) return 'bank'
  if (/cash/.test(v)) return 'cash'
  return fallback
}

function isoDate(value: string | undefined): string | undefined {
  if (!value) return undefined
  const dmy = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T](\d{1,2}):(\d{2}))?/)
  const t = dmy
    ? Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]), Number(dmy[4] ?? 12) - 3, Number(dmy[5] ?? 0))
    : Date.parse(value)
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined
}

export function statementRowsFromCsv(input: string, fallback: StatementRow['method'] = 'bank'): { rows: StatementRow[]; skipped: number } {
  const lines = parseCsv(input)
  if (lines.length < 2) return { rows: [], skipped: 0 }
  const keys = lines[0].map((h) => ALIASES.find(([re]) => re.test(h.trim().toLowerCase()))?.[1] ?? null)
  if (!keys.includes('amount') && !keys.includes('credit')) throw new Error('NO_AMOUNT_COLUMN')

  const rows: StatementRow[] = []
  let skipped = 0
  for (const cells of lines.slice(1)) {
    const get = (k: string) => {
      const i = keys.indexOf(k as never)
      return i >= 0 ? (cells[i] ?? '').trim() : undefined
    }
    // Money in only: a credit column wins; a negative amount is money out.
    const rawAmount = get('credit') || get('amount') || ''
    const amount = Number(rawAmount.replace(/[^0-9.-]/g, ''))
    if (!Number.isFinite(amount) || amount <= 0) { skipped++; continue }
    rows.push({
      amount: Math.round(amount),
      method: methodOf(get('method'), fallback),
      reference: get('reference') || undefined,
      payer_phone: get('payer_phone')?.replace(/[^\d+]/g, '') || undefined,
      payer_name: get('payer_name') || undefined,
      paid_at: isoDate(get('date')),
      raw_evidence: cells.join(',').slice(0, 2000),
    })
  }
  return { rows, skipped }
}
