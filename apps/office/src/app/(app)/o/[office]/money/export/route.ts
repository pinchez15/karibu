// CSV for the accountant (spec §7.G). An export of invoices and payments, not a ledger.
import { getOfficeScope } from '@/lib/auth'
import { rpc } from '@/lib/db'
import { fromMinor } from '@/lib/money'

type Export = { invoices: Record<string, unknown>[]; payments: Record<string, unknown>[] }

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v)
  // Quote, and defuse spreadsheet formulas in text a clinic or payer supplied.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return `"${safe.replace(/"/g, '""')}"`
}

function toCsv(columns: string[], rows: Record<string, unknown>[], moneyColumns: string[]): string {
  const lines = rows.map((r) => columns.map((c) =>
    moneyColumns.includes(c) && typeof r[c] === 'number' ? fromMinor(r[c] as number, String(r.currency)) : cell(r[c])).join(','))
  return [columns.join(','), ...lines].join('\r\n')
}

export async function GET(_req: Request, { params }: { params: Promise<{ office: string }> }) {
  const { office: slug } = await params
  const scope = await getOfficeScope(slug)
  const data = await rpc<Export>('office_money_export', { p_office_id: scope.office_id })
  const csv = [
    'INVOICES',
    toCsv(['number', 'clinic', 'issue_date', 'due_date', 'period_start', 'description', 'currency', 'amount', 'amount_paid', 'status', 'efris_reference'], data.invoices, ['amount', 'amount_paid']),
    '',
    'PAYMENTS',
    toCsv(['paid_at', 'method', 'reference', 'payer_name', 'payer_phone', 'currency', 'amount', 'invoice', 'clinic', 'confirmed'], data.payments, ['amount']),
  ].join('\r\n')
  return new Response(`﻿${csv}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="karibu-office-${slug}-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
