'use client'

import { useCallback, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Download,
  Loader2,
  Plus,
  Trash2,
  Upload,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import {
  CLINICAL_CSV_COLUMNS,
  LAB_CSV_COLUMNS,
  LAB_COLUMN_MAP,
  PHARMACY_CSV_COLUMNS,
  PHARMACY_COLUMN_MAP,
  type ColumnDef,
  downloadCsv,
  labTemplateCsv,
  mapRowsByHeader,
  parseCsv,
  parseTsv,
  pharmacyTemplateCsv,
} from '@/lib/stock-import/csv'
import {
  bulkImportLabStock,
  bulkImportPharmacyStock,
  type BulkImportResult,
  type ImportRowResult,
} from './actions'

type StockTab = 'pharmacy' | 'lab' | 'clinical'

const PHARMACY_COLUMNS = PHARMACY_CSV_COLUMNS
const LAB_COLUMNS = LAB_CSV_COLUMNS
const CLINICAL_COLUMNS = CLINICAL_CSV_COLUMNS

function emptyRow(columns: ColumnDef[]): Record<string, string> {
  return Object.fromEntries(columns.map((c) => [c.key, '']))
}

function blankRows(columns: ColumnDef[], count = 8): Record<string, string>[] {
  return Array.from({ length: count }, () => emptyRow(columns))
}

interface BulkStockImportClientProps {
  initialTab: StockTab
  canPharmacy: boolean
  canLab: boolean
  pharmacyMarkupPercent?: number
}

export function BulkStockImportClient({
  initialTab,
  canPharmacy,
  canLab,
  pharmacyMarkupPercent = 10,
}: BulkStockImportClientProps) {
  const defaultTab: StockTab = canPharmacy
    ? initialTab === 'pharmacy' || !canLab
      ? 'pharmacy'
      : initialTab
    : canLab
      ? initialTab === 'clinical'
        ? 'clinical'
        : 'lab'
      : 'pharmacy'

  const [tab, setTab] = useState<StockTab>(defaultTab)
  const [pharmacyRows, setPharmacyRows] = useState(() => blankRows(PHARMACY_COLUMNS))
  const [labRows, setLabRows] = useState(() => blankRows(LAB_COLUMNS))
  const [clinicalRows, setClinicalRows] = useState(() => blankRows(CLINICAL_COLUMNS))
  const [importResult, setImportResult] = useState<BulkImportResult | null>(null)
  const [pending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const activeColumns =
    tab === 'pharmacy' ? PHARMACY_COLUMNS : tab === 'clinical' ? CLINICAL_COLUMNS : LAB_COLUMNS

  const activeRows =
    tab === 'pharmacy' ? pharmacyRows : tab === 'clinical' ? clinicalRows : labRows

  const setActiveRows =
    tab === 'pharmacy' ? setPharmacyRows : tab === 'clinical' ? setClinicalRows : setLabRows

  const mergePastedRows = useCallback(
    (parsed: string[][]) => {
      if (parsed.length === 0) return

      const columnMap =
        tab === 'pharmacy' ? PHARMACY_COLUMN_MAP : LAB_COLUMN_MAP
      const columns = activeColumns

      let mapped: Record<string, string>[]
      const firstCell = parsed[0]?.[0] ?? ''
      const looksLikeHeader =
        parsed.length > 1 &&
        normalizeLoose(firstCell).match(/name|drug|item|test|medicine/)

      if (looksLikeHeader) {
        mapped = mapRowsByHeader(parsed, columnMap)
      } else if (parsed[0].length >= columns.length) {
        mapped = parsed.map((cells) => {
          const row: Record<string, string> = {}
          columns.forEach((col, idx) => {
            row[col.key] = cells[idx] ?? ''
          })
          return row
        })
      } else {
        mapped = mapRowsByHeader(
          [[...columns.map((c) => c.key), ...parsed[0]], ...parsed],
          columnMap,
        )
      }

      if (mapped.length === 0) return

      setActiveRows((prev) => {
        const firstEmpty = prev.findIndex((r) => !r.name?.trim())
        const base = firstEmpty >= 0 ? prev.slice(0, firstEmpty) : prev
        const merged = [...base, ...mapped]
        while (merged.length < 8) merged.push(emptyRow(columns))
        return merged
      })
    },
    [activeColumns, setActiveRows, tab],
  )

  function handlePaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData('text/plain')
    if (!text.includes('\t') && !text.includes('\n')) return
    e.preventDefault()
    const parsed = text.includes('\t') ? parseTsv(text) : parseCsv(text)
    mergePastedRows(parsed)
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      const parsed = parseCsv(text)
      if (parsed.length === 0) return
      const columnMap = tab === 'pharmacy' ? PHARMACY_COLUMN_MAP : LAB_COLUMN_MAP
      const mapped = mapRowsByHeader(parsed, columnMap)
      if (mapped.length > 0) {
        setActiveRows(() => {
          const merged = [...mapped]
          while (merged.length < 8) merged.push(emptyRow(activeColumns))
          return merged
        })
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  function updateCell(rowIndex: number, key: string, value: string) {
    setActiveRows((prev) =>
      prev.map((row, i) => (i === rowIndex ? { ...row, [key]: value } : row)),
    )
    setImportResult(null)
  }

  function addRow() {
    setActiveRows((prev) => [...prev, emptyRow(activeColumns)])
  }

  function removeRow(index: number) {
    setActiveRows((prev) => {
      const next = prev.filter((_, i) => i !== index)
      return next.length > 0 ? next : blankRows(activeColumns, 1)
    })
  }

  function downloadTemplate() {
    if (tab === 'pharmacy') {
      downloadCsv(pharmacyTemplateCsv(), 'pharmacy-stock.csv')
    } else if (tab === 'clinical') {
      downloadCsv(labTemplateCsv('clinical'), 'clinical-supplies.csv')
    } else {
      downloadCsv(labTemplateCsv('lab'), 'lab-stock.csv')
    }
  }

  function runImport() {
    setImportResult(null)
    startTransition(async () => {
      const result =
        tab === 'pharmacy'
          ? await bulkImportPharmacyStock(pharmacyRows)
          : await bulkImportLabStock(
              tab === 'clinical' ? clinicalRows : labRows,
              tab === 'clinical' ? 'consumable' : undefined,
            )
      setImportResult(result)
    })
  }

  const filledCount = activeRows.filter((r) => r.name?.trim()).length

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/dashboard/admin"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Admin
        </Link>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="h-4 w-4 mr-1" />
            Template CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4 mr-1" />
            Upload CSV
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleFileUpload}
          />
        </div>
      </div>

      <p className="text-sm text-muted-foreground max-w-3xl">
        Type rows below, paste from Excel or Google Sheets, or upload a CSV. Matching items
        (same drug code + strength + form, or same lab item + batch) get their quantity added
        rather than duplicated.{' '}
        <span className="text-foreground/80">
          Pharmacy <span className="font-mono tabular-nums">unit_price</span> is stock cost;
          patients are billed at +{pharmacyMarkupPercent}% on dispense.
        </span>
      </p>

      <Tabs value={tab} onValueChange={(v) => setTab(v as StockTab)}>
        <TabsList>
          {canPharmacy && (
            <TabsTrigger value="pharmacy">Medications</TabsTrigger>
          )}
          {canLab && (
            <>
              <TabsTrigger value="lab">Lab materials</TabsTrigger>
              <TabsTrigger value="clinical">Clinical supplies</TabsTrigger>
            </>
          )}
        </TabsList>

        {(['pharmacy', 'lab', 'clinical'] as const).map((t) => {
          if (t === 'pharmacy' && !canPharmacy) return null
          if (t !== 'pharmacy' && !canLab) return null
          const cols =
            t === 'pharmacy' ? PHARMACY_COLUMNS : t === 'clinical' ? CLINICAL_COLUMNS : LAB_COLUMNS
          const rows =
            t === 'pharmacy' ? pharmacyRows : t === 'clinical' ? clinicalRows : labRows

          return (
            <TabsContent key={t} value={t} className="mt-4">
              <SpreadsheetGrid
                columns={cols}
                rows={rows}
                onUpdate={t === tab ? updateCell : () => {}}
                onRemove={t === tab ? removeRow : () => {}}
                onPaste={t === tab ? handlePaste : undefined}
                readOnly={t !== tab}
              />
            </TabsContent>
          )
        })}
      </Tabs>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus className="h-4 w-4 mr-1" />
          Add row
        </Button>
        <Button type="button" onClick={runImport} disabled={pending || filledCount === 0}>
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              Importing…
            </>
          ) : (
            `Import ${filledCount} ${filledCount === 1 ? 'item' : 'items'}`
          )}
        </Button>
        {filledCount === 0 && (
          <span className="text-xs text-muted-foreground">Enter at least one name to import.</span>
        )}
      </div>

      {importResult && (
        <ImportResultsPanel result={importResult} tab={tab} />
      )}
    </div>
  )
}

function SpreadsheetGrid({
  columns,
  rows,
  onUpdate,
  onRemove,
  onPaste,
  readOnly,
}: {
  columns: ColumnDef[]
  rows: Record<string, string>[]
  onUpdate: (rowIndex: number, key: string, value: string) => void
  onRemove: (rowIndex: number) => void
  onPaste?: (e: React.ClipboardEvent) => void
  readOnly?: boolean
}) {
  const numericKeys = new Set(['quantity', 'unit_price', 'low_at'])

  return (
    <div
      className="border border-border rounded-xl overflow-auto bg-card"
      onPaste={readOnly ? undefined : onPaste}
    >
      <table className="w-full text-sm border-collapse min-w-[1100px]">
        <thead>
          <tr className="bg-muted/50 border-b border-border">
            <th className="w-10 px-2 py-2 text-left text-[11px] font-semibold text-muted-foreground">
              #
            </th>
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'px-2 py-2 text-[11px] font-semibold text-muted-foreground whitespace-nowrap',
                  col.align === 'right' ? 'text-right' : 'text-left',
                  col.key === 'name' && 'min-w-[140px]',
                  col.key === 'notes' && 'min-w-[160px]',
                )}
              >
                {col.label}
                {col.required && <span className="text-destructive ml-0.5">*</span>}
              </th>
            ))}
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-border/60 last:border-b-0 group">
              <td className="px-2 py-1 text-[11px] text-muted-foreground align-middle">
                {rowIndex + 1}
              </td>
              {columns.map((col) => (
                <td key={col.key} className="px-1 py-0.5 align-middle">
                  <input
                    type="text"
                    inputMode={numericKeys.has(col.key) ? 'numeric' : 'text'}
                    value={row[col.key] ?? ''}
                    onChange={(e) => onUpdate(rowIndex, col.key, e.target.value)}
                    placeholder={col.placeholder}
                    readOnly={readOnly}
                    className={cn(
                      'w-full text-sm border border-transparent rounded px-2 py-1.5 bg-transparent font-mono tabular-nums',
                      'hover:border-border focus:border-ring focus:bg-background focus:outline-none focus:ring-1 focus:ring-ring',
                      col.align === 'right' && 'text-right',
                      readOnly && 'pointer-events-none opacity-60',
                      !numericKeys.has(col.key) && 'font-sans',
                    )}
                  />
                </td>
              ))}
              <td className="px-1 py-0.5 align-middle">
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => onRemove(rowIndex)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-opacity"
                    aria-label={`Remove row ${rowIndex + 1}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!readOnly && (
        <div className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border bg-muted/30">
          Tip: copy rows from a spreadsheet and paste anywhere in the grid.
        </div>
      )}
    </div>
  )
}

function ImportResultsPanel({
  result,
  tab,
}: {
  result: BulkImportResult
  tab: StockTab
}) {
  const created = result.results.filter((r) => r.status === 'created').length
  const updated = result.results.filter((r) => r.status === 'updated').length
  const errors = result.results.filter((r) => r.status === 'error')

  const stockHref =
    tab === 'pharmacy' ? '/dashboard/pharmacy/stock' : '/dashboard/lab/stock'

  return (
    <div
      className={cn(
        'rounded-xl border p-4 space-y-3',
        result.success ? 'border-green-500/40 bg-green-500/5' : 'border-destructive/40 bg-destructive/5',
      )}
    >
      <div className="flex items-start gap-2">
        {result.success ? (
          <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
        ) : (
          <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        )}
        <div>
          <h3 className="font-semibold text-sm">
            {result.error && result.results.length === 0
              ? result.error
              : result.success
                ? 'Import complete'
                : 'Import finished with errors'}
          </h3>
          {result.results.length > 0 && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {created} created · {updated} updated
              {errors.length > 0 && ` · ${errors.length} failed`}
            </p>
          )}
        </div>
      </div>

      {result.results.length > 0 && (
        <ul className="max-h-48 overflow-auto text-sm divide-y divide-border/60 rounded-lg border border-border bg-card">
          {result.results.map((r) => (
            <ResultLine key={`${r.row}-${r.name}`} item={r} />
          ))}
        </ul>
      )}

      {result.success && (
        <Link href={stockHref} className="text-sm font-medium text-cobalt hover:underline">
          View stock list →
        </Link>
      )}
    </div>
  )
}

function ResultLine({ item }: { item: ImportRowResult }) {
  const color =
    item.status === 'created'
      ? 'text-green-700'
      : item.status === 'updated'
        ? 'text-cobalt'
        : item.status === 'error'
          ? 'text-destructive'
          : 'text-muted-foreground'

  return (
    <li className="flex items-start gap-2 px-3 py-2">
      <span className="text-[11px] text-muted-foreground w-8 shrink-0">#{item.row}</span>
      <span className="flex-1 min-w-0">
        <span className="font-medium">{item.name}</span>
        {item.message && (
          <span className={cn('block text-xs', color)}>{item.message}</span>
        )}
      </span>
      <span className={cn('text-xs font-medium capitalize shrink-0', color)}>{item.status}</span>
    </li>
  )
}

function normalizeLoose(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')
}

// Re-export column keys for tests
export { PHARMACY_CSV_COLUMNS, LAB_CSV_COLUMNS }
