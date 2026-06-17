'use client'

import { useMemo, useState, useTransition } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import {
  PHARMACY_CATALOG_DRUGS,
  PHARMACY_DURATIONS,
  PHARMACY_FREQUENCIES,
  PHARMACY_ROUTES,
  formatPrescriptionSig,
  pharmacyDrugsByCategory,
} from '@karibu/shared'
import type { PrescriptionLineInput } from '@/lib/validators/prescription'

export type DraftPrescriptionLine = PrescriptionLineInput & {
  id: string
  drugCode: string
  strength: string
  durationDays: number | null
}

function emptyLine(): DraftPrescriptionLine {
  return {
    id: crypto.randomUUID(),
    drugCode: '',
    strength: '',
    medication_code: null,
    free_text_name: null,
    dose_text: '',
    route_text: 'PO',
    frequency_text: 'BID',
    duration_text: '',
    durationDays: null,
    quantity_prescribed: null,
    quantity_unit: '',
    notes: '',
  }
}

export function PrescriptionComposer({
  initialLines,
  disabled,
  onChange,
}: {
  initialLines?: DraftPrescriptionLine[]
  disabled?: boolean
  onChange: (lines: DraftPrescriptionLine[], summary: string) => void
}) {
  const [lines, setLines] = useState<DraftPrescriptionLine[]>(
    initialLines?.length ? initialLines : [emptyLine()],
  )
  const [, startTransition] = useTransition()

  const categories = useMemo(() => pharmacyDrugsByCategory(), [])

  function emit(next: DraftPrescriptionLine[]) {
    setLines(next)
    startTransition(() => {
      const summary = next
        .map((line) => lineToSummary(line))
        .filter(Boolean)
        .join('\n')
      onChange(next, summary)
    })
  }

  function lineToSummary(line: DraftPrescriptionLine): string {
    const drug = PHARMACY_CATALOG_DRUGS.find((d) => d.code === line.drugCode)
    const name = drug?.name ?? line.free_text_name ?? ''
    if (!name.trim()) return ''
    return formatPrescriptionSig({
      drugName: name,
      strength: line.strength || undefined,
      quantityText:
        line.quantity_prescribed && line.quantity_unit
          ? `${line.quantity_prescribed} ${line.quantity_unit}`
          : undefined,
      route: line.route_text ?? undefined,
      frequency: line.frequency_text ?? undefined,
      durationDays: line.durationDays ?? undefined,
      notes: line.notes ?? undefined,
    })
  }

  function updateLine(id: string, patch: Partial<DraftPrescriptionLine>) {
    emit(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  function selectDrug(id: string, code: string) {
    const drug = PHARMACY_CATALOG_DRUGS.find((d) => d.code === code)
    updateLine(id, {
      drugCode: code,
      medication_code: code,
      free_text_name: drug?.name ?? null,
      strength: drug?.strengths[0] ?? '',
      route_text: drug?.defaultRoute ?? 'PO',
      frequency_text: drug?.defaultFrequency ?? 'BID',
    })
  }

  function toRpcLines(drafts: DraftPrescriptionLine[]): PrescriptionLineInput[] {
    return drafts
      .map((line) => ({
        medication_code: line.medication_code,
        free_text_name: line.free_text_name,
        dose_text: line.dose_text?.trim() || null,
        route_text: line.route_text?.trim() || null,
        frequency_text: line.frequency_text?.trim() || null,
        duration_text: line.durationDays ? `${line.durationDays} days` : line.duration_text?.trim() || null,
        quantity_prescribed: line.quantity_prescribed,
        quantity_unit: line.quantity_unit?.trim() || null,
        notes: line.notes?.trim() || null,
        source: 'manual' as const,
      }))
      .filter((l) => l.medication_code || l.free_text_name)
  }

  return (
    <div className="space-y-4" data-testid="prescription-composer">
      {lines.map((line, index) => (
        <div
          key={line.id}
          className="rounded-xl border border-line-soft bg-card p-4"
          data-testid={`rx-draft-${index}`}
        >
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">Medication {index + 1}</p>
            {lines.length > 1 && (
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => emit(lines.filter((l) => l.id !== line.id))}
                disabled={disabled}
                aria-label="Remove line"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-muted-foreground">Drug</span>
              <select
                className="w-full rounded-md border border-line-soft px-3 py-2 text-sm"
                value={line.drugCode}
                onChange={(e) => selectDrug(line.id, e.target.value)}
                disabled={disabled}
              >
                <option value="">— Select drug —</option>
                {categories.map(([cat, drugs]) => (
                  <optgroup key={cat} label={cat}>
                    {drugs.map((d) => (
                      <option key={d.code} value={d.code}>
                        {d.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Strength</span>
              <input
                className="w-full rounded-md border border-line-soft px-3 py-2 text-sm"
                value={line.strength}
                onChange={(e) => updateLine(line.id, { strength: e.target.value })}
                disabled={disabled}
                list={`strengths-${line.id}`}
              />
              <datalist id={`strengths-${line.id}`}>
                {(PHARMACY_CATALOG_DRUGS.find((d) => d.code === line.drugCode)?.strengths ?? []).map(
                  (s) => (
                    <option key={s} value={s} />
                  ),
                )}
              </datalist>
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Dose</span>
              <input
                className="w-full rounded-md border border-line-soft px-3 py-2 text-sm"
                value={line.dose_text ?? ''}
                onChange={(e) => updateLine(line.id, { dose_text: e.target.value })}
                disabled={disabled}
                placeholder="500mg"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Route</span>
              <select
                className="w-full rounded-md border border-line-soft px-3 py-2 text-sm"
                value={line.route_text ?? 'PO'}
                onChange={(e) => updateLine(line.id, { route_text: e.target.value })}
                disabled={disabled}
              >
                {PHARMACY_ROUTES.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Frequency</span>
              <select
                className="w-full rounded-md border border-line-soft px-3 py-2 text-sm"
                value={line.frequency_text ?? 'BID'}
                onChange={(e) => updateLine(line.id, { frequency_text: e.target.value })}
                disabled={disabled}
              >
                {PHARMACY_FREQUENCIES.map((f) => (
                  <option key={f.code} value={f.code}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Duration</span>
              <select
                className="w-full rounded-md border border-line-soft px-3 py-2 text-sm"
                value={line.durationDays ?? ''}
                onChange={(e) =>
                  updateLine(line.id, {
                    durationDays: e.target.value ? Number(e.target.value) : null,
                  })
                }
                disabled={disabled}
              >
                <option value="">Custom / PRN</option>
                {PHARMACY_DURATIONS.map((d) => (
                  <option key={d.days} value={d.days}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Qty prescribed</span>
              <input
                type="number"
                min={0}
                className="w-full rounded-md border border-line-soft px-3 py-2 text-sm"
                value={line.quantity_prescribed ?? ''}
                onChange={(e) =>
                  updateLine(line.id, {
                    quantity_prescribed: e.target.value ? Number(e.target.value) : null,
                  })
                }
                disabled={disabled}
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Unit</span>
              <input
                className="w-full rounded-md border border-line-soft px-3 py-2 text-sm"
                value={line.quantity_unit ?? ''}
                onChange={(e) => updateLine(line.id, { quantity_unit: e.target.value })}
                disabled={disabled}
                placeholder="tabs, caps, mL"
              />
            </label>
          </div>
        </div>
      ))}

      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-md border border-dashed border-line-soft px-3 py-2 text-sm font-medium"
        onClick={() => emit([...lines, emptyLine()])}
        disabled={disabled}
      >
        <Plus className="h-4 w-4" />
        Add medication
      </button>

      {/* Expose converter for parent submit handlers */}
      <input type="hidden" data-rpc-lines={JSON.stringify(toRpcLines(lines))} readOnly />
    </div>
  )
}

export function draftLinesToRpcInput(drafts: DraftPrescriptionLine[]): PrescriptionLineInput[] {
  return drafts
    .map((line) => ({
      medication_code: line.medication_code,
      free_text_name: line.free_text_name,
      dose_text: line.dose_text?.trim() || null,
      route_text: line.route_text?.trim() || null,
      frequency_text: line.frequency_text?.trim() || null,
      duration_text: line.durationDays ? `${line.durationDays} days` : line.duration_text?.trim() || null,
      quantity_prescribed: line.quantity_prescribed,
      quantity_unit: line.quantity_unit?.trim() || null,
      notes: line.notes?.trim() || null,
      source: 'manual' as const,
    }))
    .filter((l) => l.medication_code || l.free_text_name)
}
