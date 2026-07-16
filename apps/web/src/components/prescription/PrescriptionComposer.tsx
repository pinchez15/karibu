'use client'

import { useMemo, useState, useTransition } from 'react'
import { AlertTriangle, Plus, Trash2 } from 'lucide-react'
import {
  DISPENSE_UNITS,
  DOSE_UNITS,
  PHARMACY_CATALOG_DRUGS,
  PHARMACY_DURATIONS,
  PHARMACY_ROUTES,
  computePrescriptionQuantity,
  formatPrescriptionSig,
  type DispenseUnit,
  type DoseUnit,
  type FrequencyCode,
  type PharmacyCatalogDrug,
  type QuantityComputeResult,
} from '@karibu/shared'
import type { PrescriptionLineInput } from '@/lib/validators/prescription'
import { doseUnitForDispense, parseCatalogStrength } from './catalog-strength'

// UI-only fields ride alongside the structured PrescriptionLineInput. Everything
// authoritative (dose_unit, frequency_code, duration_days, order_mode,
// dispense_unit, quantity_source, …) lives on PrescriptionLineInput itself.
export type DraftPrescriptionLine = PrescriptionLineInput & {
  id: string
  drugCode: string
  /** The selected catalog strength string, e.g. "500mg cap" (display + parse). */
  strength: string
  /** mL/puffs per container when dispense_unit is a container (bottle/inhaler). */
  containerSize: number | null
  /** Clinician explicitly acknowledged an out-of-range/incomplete compute. */
  confirmedWarning: boolean
}

/**
 * Scheduled frequencies emit the canonical UPPERCASE frequency_code. PRN is NOT
 * here — "as needed" is the order-mode toggle (fixed_quantity). STAT stays: it
 * computes exactly one dose.
 */
const SCHEDULED_FREQUENCIES: Array<{ code: FrequencyCode; label: string }> = [
  { code: 'OD', label: 'OD — once daily' },
  { code: 'BID', label: 'BID — twice daily' },
  { code: 'TID', label: 'TID — three times daily' },
  { code: 'QID', label: 'QID — four times daily' },
  { code: 'Q4H', label: 'Q4H — every 4 hours' },
  { code: 'Q6H', label: 'Q6H — every 6 hours' },
  { code: 'Q8H', label: 'Q8H — every 8 hours' },
  { code: 'Q12H', label: 'Q12H — every 12 hours' },
  { code: 'HS', label: 'HS — at bedtime' },
  { code: 'AC', label: 'AC — before meals' },
  { code: 'PC', label: 'PC — after meals' },
  { code: 'STAT', label: 'STAT — once now' },
]

const CONTAINER_DISPENSE_UNITS: DispenseUnit[] = ['bottle', 'inhaler']

function isStat(line: Pick<DraftPrescriptionLine, 'frequency_code'>): boolean {
  return (line.frequency_code ?? '').toUpperCase() === 'STAT'
}

function emptyLine(): DraftPrescriptionLine {
  return {
    id: crypto.randomUUID(),
    drugCode: '',
    strength: '',
    containerSize: null,
    confirmedWarning: false,
    medication_code: null,
    free_text_name: null,
    dose_text: null,
    route_text: 'PO',
    frequency_text: null,
    duration_text: null,
    quantity_prescribed: null,
    quantity_unit: null,
    frequency_code: 'BID',
    duration_days: 5,
    dose_amount: null,
    dose_unit: null,
    strength_amount: null,
    strength_unit: null,
    form: null,
    order_mode: 'scheduled',
    quantity_source: 'computed',
    dispense_unit: null,
    notes: null,
    source: 'manual',
  }
}

/** Run the canonical compute for a draft, or null when inputs are insufficient. */
export function computeForDraft(
  line: DraftPrescriptionLine,
): QuantityComputeResult | null {
  if (line.dose_amount == null || !line.dose_unit || !line.dispense_unit) {
    return null
  }
  if (line.order_mode === 'fixed_quantity') {
    return computePrescriptionQuantity({
      order_mode: 'fixed_quantity',
      dose_amount: line.dose_amount,
      dose_unit: line.dose_unit,
      dispense_unit: line.dispense_unit,
      fixed_quantity: line.quantity_prescribed ?? null,
    })
  }
  return computePrescriptionQuantity({
    order_mode: 'scheduled',
    frequency_code: line.frequency_code,
    duration_days: line.duration_days,
    dose_amount: line.dose_amount,
    dose_unit: line.dose_unit,
    strength_amount: line.strength_amount,
    dispense_unit: line.dispense_unit,
    container_size: line.containerSize,
  })
}

/**
 * Keep the computed quantity in sync unless the clinician has overridden it
 * (quantity_source === 'overridden') or is entering a fixed total. Accepting the
 * computed number keeps it "human-entered" per §0.
 */
function withComputedQuantity(line: DraftPrescriptionLine): DraftPrescriptionLine {
  if (line.order_mode === 'fixed_quantity') return line
  if (line.quantity_source === 'overridden') return line
  const result = computeForDraft(line)
  if (!result || result.quantity == null) return line
  return { ...line, quantity_prescribed: result.quantity, quantity_source: 'computed' }
}

export interface DraftLineValidation {
  issues: string[]
  computed: QuantityComputeResult | null
  needsConfirmation: boolean
}

/** Validate one draft line. Pure — used by the composer UI, the panel, and tests. */
export function validateDraftLine(line: DraftPrescriptionLine): DraftLineValidation {
  const issues: string[] = []
  if (!line.medication_code?.trim() && !line.free_text_name?.trim()) {
    issues.push('Select a drug')
  }
  if (line.dose_amount == null || line.dose_amount <= 0) {
    issues.push('Enter a dose amount')
  }
  if (!line.dose_unit) issues.push('Select a dose unit')
  if (!line.dispense_unit) issues.push('Select a dispense unit')

  if (line.order_mode === 'fixed_quantity') {
    if (line.quantity_prescribed == null || line.quantity_prescribed <= 0) {
      issues.push('Enter the total quantity')
    }
  } else {
    if (!line.frequency_code) issues.push('Select a frequency')
    if (!isStat(line) && (line.duration_days == null || line.duration_days <= 0)) {
      issues.push('Select a duration')
    }
    if (
      CONTAINER_DISPENSE_UNITS.includes(line.dispense_unit as DispenseUnit) &&
      (line.containerSize == null || line.containerSize <= 0)
    ) {
      issues.push('Enter the container size')
    }
  }

  const computed = computeForDraft(line)
  const needsConfirmation = computed?.needs_confirmation ?? false
  if (needsConfirmation && !line.confirmedWarning) {
    issues.push('Confirm the quantity warning')
  }
  return { issues, computed, needsConfirmation }
}

/** Only lines that actually name a drug are considered for submission. */
function activeDrafts(drafts: DraftPrescriptionLine[]): DraftPrescriptionLine[] {
  return drafts.filter((l) => l.medication_code?.trim() || l.free_text_name?.trim())
}

/** First blocking problem across all active lines, or null when ready to submit. */
export function draftLinesSubmitError(drafts: DraftPrescriptionLine[]): string | null {
  const active = activeDrafts(drafts)
  if (active.length === 0) return 'Add at least one medication line.'
  for (const line of active) {
    const { issues } = validateDraftLine(line)
    if (issues.length > 0) return issues[0]
  }
  return null
}

function doseText(line: DraftPrescriptionLine): string {
  if (line.dose_amount != null && line.dose_unit) {
    return `${line.dose_amount} ${line.dose_unit}`
  }
  return ''
}

/**
 * Emit fully-structured PrescriptionLineInput rows. `source` is hard-stamped
 * 'manual' — a line can never carry any other provenance from this surface.
 */
export function draftLinesToRpcInput(
  drafts: DraftPrescriptionLine[],
): PrescriptionLineInput[] {
  return activeDrafts(drafts).map((line) => {
    const fixed = line.order_mode === 'fixed_quantity'
    const stat = isStat(line)
    const frequency_code: FrequencyCode = fixed
      ? 'PRN'
      : ((line.frequency_code as FrequencyCode) ?? 'BID')
    const duration_days = fixed || stat ? null : (line.duration_days ?? null)
    return {
      medication_code: line.medication_code ?? null,
      free_text_name: line.free_text_name ?? null,
      // Derived text — the RPC re-derives authoritatively; sent for back-compat.
      dose_text: doseText(line) || null,
      route_text: line.route_text?.trim() || null,
      frequency_text: frequency_code,
      duration_text: null,
      quantity_prescribed: line.quantity_prescribed ?? null,
      quantity_unit: line.dispense_unit ?? null,
      frequency_code,
      duration_days,
      dose_amount: line.dose_amount ?? null,
      dose_unit: line.dose_unit ?? null,
      strength_amount: line.strength_amount ?? null,
      strength_unit: line.strength_unit ?? null,
      form: line.form ?? null,
      order_mode: line.order_mode ?? 'scheduled',
      // fixed_quantity totals are always human-entered → 'overridden'.
      quantity_source: fixed ? 'overridden' : (line.quantity_source ?? 'computed'),
      dispense_unit: line.dispense_unit ?? null,
      notes: line.notes?.trim() || null,
      source: 'manual' as const,
    }
  })
}

/** Apply a selected catalog strength: parse + set sensible dose defaults. */
function applyStrengthToLine(
  line: DraftPrescriptionLine,
  strength: string,
): DraftPrescriptionLine {
  const parsed = parseCatalogStrength(strength)
  let dose_unit: DoseUnit | null = line.dose_unit ?? null
  let dose_amount: number | null = line.dose_amount ?? null

  if (
    parsed.strength_amount != null &&
    !parsed.isConcentration &&
    (parsed.dispense_unit === 'tab' || parsed.dispense_unit === 'cap')
  ) {
    // Solid with a known mg strength: default to one unit, dosed in mg.
    dose_unit = 'mg'
    dose_amount = parsed.strength_amount
  } else if (parsed.isConcentration) {
    // Liquid: clinician enters the mg dose; we hold the concentration.
    dose_unit = 'mg'
    dose_amount = null
  } else {
    const fallback = doseUnitForDispense(parsed.dispense_unit)
    if (fallback) {
      dose_unit = fallback
      dose_amount = 1
    }
  }

  return withComputedQuantity({
    ...line,
    strength,
    strength_amount: parsed.strength_amount,
    strength_unit: parsed.strength_unit,
    form: parsed.form,
    dispense_unit: parsed.dispense_unit,
    dose_unit,
    dose_amount,
    quantity_source: 'computed',
    confirmedWarning: false,
  })
}

export function PrescriptionComposer({
  initialLines,
  disabled,
  onChange,
  catalog,
}: {
  initialLines?: DraftPrescriptionLine[]
  disabled?: boolean
  onChange: (lines: DraftPrescriptionLine[], summary: string) => void
  /** Clinic formulary from medication_catalog; falls back to bundled seed list. */
  catalog?: PharmacyCatalogDrug[]
}) {
  const drugs = catalog && catalog.length > 0 ? catalog : PHARMACY_CATALOG_DRUGS
  const [lines, setLines] = useState<DraftPrescriptionLine[]>(
    initialLines?.length ? initialLines : [emptyLine()],
  )
  const [, startTransition] = useTransition()

  const categories = useMemo(() => {
    const grouped = new Map<string, PharmacyCatalogDrug[]>()
    for (const drug of drugs) {
      const list = grouped.get(drug.category) ?? []
      list.push(drug)
      grouped.set(drug.category, list)
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [drugs])

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
    const drug = drugs.find((d) => d.code === line.drugCode)
    const name = drug?.name ?? line.free_text_name ?? ''
    if (!name.trim()) return ''
    const fixed = line.order_mode === 'fixed_quantity'
    return formatPrescriptionSig({
      drugName: name,
      strength: line.strength || undefined,
      quantityText:
        line.quantity_prescribed != null && line.dispense_unit
          ? `${line.quantity_prescribed} ${line.dispense_unit}`
          : undefined,
      route: line.route_text ?? undefined,
      frequency: fixed ? 'PRN' : (line.frequency_code ?? undefined),
      durationDays:
        !fixed && !isStat(line) ? (line.duration_days ?? undefined) : undefined,
      notes: line.notes ?? undefined,
    })
  }

  function updateLine(id: string, patch: Partial<DraftPrescriptionLine>) {
    emit(lines.map((l) => (l.id === id ? withComputedQuantity({ ...l, ...patch }) : l)))
  }

  function selectDrug(id: string, code: string) {
    const drug = drugs.find((d) => d.code === code)
    const base: DraftPrescriptionLine = {
      ...emptyLine(),
      id,
      drugCode: code,
      medication_code: code || null,
      free_text_name: drug?.name ?? null,
      route_text: drug?.defaultRoute ?? 'PO',
    }
    const defFreq = (drug?.defaultFrequency ?? 'BID').toUpperCase()
    if (defFreq === 'PRN') {
      base.order_mode = 'fixed_quantity'
      base.frequency_code = 'PRN'
    } else {
      base.order_mode = 'scheduled'
      base.frequency_code = defFreq as FrequencyCode
    }
    const withStrength = applyStrengthToLine(base, drug?.strengths[0] ?? '')
    emit(lines.map((l) => (l.id === id ? withStrength : l)))
  }

  return (
    <div className="space-y-4" data-testid="prescription-composer">
      {lines.map((line, index) => {
        const { computed, needsConfirmation, issues } = validateDraftLine(line)
        const fixed = line.order_mode === 'fixed_quantity'
        const stat = isStat(line)
        const isContainer = CONTAINER_DISPENSE_UNITS.includes(
          line.dispense_unit as DispenseUnit,
        )
        const overridden = line.quantity_source === 'overridden'
        const drug = drugs.find((d) => d.code === line.drugCode)
        return (
          <div
            key={line.id}
            className="rounded-xl border border-line-soft bg-card p-4"
            data-testid={`rx-draft-${index}`}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">
                Medication {index + 1}
              </p>
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
              {/* Drug */}
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block text-muted-foreground">Drug</span>
                <select
                  className="w-full rounded-md border border-line-soft px-3 py-2 text-sm"
                  value={line.drugCode}
                  onChange={(e) => selectDrug(line.id, e.target.value)}
                  disabled={disabled}
                  data-testid={`rx-drug-${index}`}
                >
                  <option value="">— Select drug —</option>
                  {categories.map(([cat, catDrugs]) => (
                    <optgroup key={cat} label={cat}>
                      {catDrugs.map((d) => (
                        <option key={d.code} value={d.code}>
                          {d.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              {/* Strength (structured via catalog select) */}
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Strength</span>
                <select
                  className="w-full rounded-md border border-line-soft px-3 py-2 text-sm"
                  value={line.strength}
                  onChange={(e) =>
                    updateLine(line.id, applyStrengthToLine(line, e.target.value))
                  }
                  disabled={disabled || !drug}
                  data-testid={`rx-strength-${index}`}
                >
                  {(drug?.strengths ?? []).length === 0 && <option value="">—</option>}
                  {(drug?.strengths ?? []).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>

              {/* Order mode */}
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Order type</span>
                <select
                  className="w-full rounded-md border border-line-soft px-3 py-2 text-sm"
                  value={line.order_mode ?? 'scheduled'}
                  onChange={(e) =>
                    updateLine(line.id, {
                      order_mode: e.target.value as 'scheduled' | 'fixed_quantity',
                      frequency_code:
                        e.target.value === 'fixed_quantity'
                          ? 'PRN'
                          : line.frequency_code === 'PRN'
                            ? 'BID'
                            : line.frequency_code,
                      quantity_source:
                        e.target.value === 'scheduled' ? 'computed' : 'overridden',
                      confirmedWarning: false,
                    })
                  }
                  disabled={disabled}
                  data-testid={`rx-order-mode-${index}`}
                >
                  <option value="scheduled">Scheduled (computed)</option>
                  <option value="fixed_quantity">PRN — fixed quantity</option>
                </select>
              </label>

              {/* Dose amount + unit */}
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Dose</span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  className="w-full rounded-md border border-line-soft px-3 py-2 text-sm"
                  value={line.dose_amount ?? ''}
                  onChange={(e) =>
                    updateLine(line.id, {
                      dose_amount: e.target.value ? Number(e.target.value) : null,
                      confirmedWarning: false,
                    })
                  }
                  disabled={disabled}
                  placeholder="500"
                  data-testid={`rx-dose-amount-${index}`}
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Dose unit</span>
                <select
                  className="w-full rounded-md border border-line-soft px-3 py-2 text-sm"
                  value={line.dose_unit ?? ''}
                  onChange={(e) =>
                    updateLine(line.id, {
                      dose_unit: (e.target.value || null) as DoseUnit | null,
                      confirmedWarning: false,
                    })
                  }
                  disabled={disabled}
                  data-testid={`rx-dose-unit-${index}`}
                >
                  <option value="">—</option>
                  {DOSE_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </label>

              {/* Route */}
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

              {/* Frequency (scheduled only) */}
              {!fixed && (
                <label className="block text-sm">
                  <span className="mb-1 block text-muted-foreground">Frequency</span>
                  <select
                    className="w-full rounded-md border border-line-soft px-3 py-2 text-sm"
                    value={line.frequency_code ?? 'BID'}
                    onChange={(e) =>
                      updateLine(line.id, {
                        frequency_code: e.target.value as FrequencyCode,
                        confirmedWarning: false,
                      })
                    }
                    disabled={disabled}
                    data-testid={`rx-frequency-${index}`}
                  >
                    {SCHEDULED_FREQUENCIES.map((f) => (
                      <option key={f.code} value={f.code}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {/* Duration (scheduled, non-STAT only) */}
              {!fixed && !stat && (
                <label className="block text-sm">
                  <span className="mb-1 block text-muted-foreground">Duration</span>
                  <select
                    className="w-full rounded-md border border-line-soft px-3 py-2 text-sm"
                    value={line.duration_days ?? ''}
                    onChange={(e) =>
                      updateLine(line.id, {
                        duration_days: e.target.value ? Number(e.target.value) : null,
                        confirmedWarning: false,
                      })
                    }
                    disabled={disabled}
                    data-testid={`rx-duration-${index}`}
                  >
                    <option value="">— Select —</option>
                    {PHARMACY_DURATIONS.map((d) => (
                      <option key={d.days} value={d.days}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {/* Dispense unit */}
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Dispense unit</span>
                <select
                  className="w-full rounded-md border border-line-soft px-3 py-2 text-sm"
                  value={line.dispense_unit ?? ''}
                  onChange={(e) =>
                    updateLine(line.id, {
                      dispense_unit: (e.target.value || null) as DispenseUnit | null,
                      confirmedWarning: false,
                    })
                  }
                  disabled={disabled}
                  data-testid={`rx-dispense-unit-${index}`}
                >
                  <option value="">—</option>
                  {DISPENSE_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </label>

              {/* Container size (container dispense units only) */}
              {isContainer && (
                <label className="block text-sm">
                  <span className="mb-1 block text-muted-foreground">
                    Container size ({line.dispense_unit === 'inhaler' ? 'puffs' : 'mL'})
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    className="w-full rounded-md border border-line-soft px-3 py-2 text-sm"
                    value={line.containerSize ?? ''}
                    onChange={(e) =>
                      updateLine(line.id, {
                        containerSize: e.target.value ? Number(e.target.value) : null,
                        confirmedWarning: false,
                      })
                    }
                    disabled={disabled}
                    data-testid={`rx-container-size-${index}`}
                  />
                </label>
              )}

              {/* Quantity */}
              <label className="block text-sm">
                <span className="mb-1 flex items-center justify-between text-muted-foreground">
                  <span>
                    {fixed ? 'Total quantity' : 'Qty to dispense'}
                    {!fixed && (
                      <span className="ml-1 text-[11px] uppercase tracking-wide">
                        ({overridden ? 'overridden' : 'computed'})
                      </span>
                    )}
                  </span>
                  {!fixed && overridden && (
                    <button
                      type="button"
                      className="text-[11px] font-medium text-primary hover:underline"
                      onClick={() =>
                        updateLine(line.id, {
                          quantity_source: 'computed',
                          confirmedWarning: false,
                        })
                      }
                      disabled={disabled}
                    >
                      Reset to computed
                    </button>
                  )}
                </span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  className="w-full rounded-md border border-line-soft px-3 py-2 text-sm"
                  value={line.quantity_prescribed ?? ''}
                  onChange={(e) =>
                    updateLine(line.id, {
                      quantity_prescribed: e.target.value
                        ? Number(e.target.value)
                        : null,
                      quantity_source: 'overridden',
                      confirmedWarning: false,
                    })
                  }
                  disabled={disabled}
                  data-testid={`rx-quantity-${index}`}
                />
              </label>
            </div>

            {/* Inline warning that requires explicit confirmation. */}
            {needsConfirmation && (
              <div
                className="mt-3 rounded-md border border-amber/40 bg-amber-soft p-3 text-xs"
                data-testid={`rx-warning-${index}`}
              >
                <p className="flex items-center gap-1 font-semibold text-amber-ink">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Check this dose before sending
                </p>
                <ul className="mt-1 list-disc pl-5 text-amber-ink/90">
                  {(computed?.flags ?? []).map((f) => (
                    <li key={f}>{flagMessage(f)}</li>
                  ))}
                </ul>
                <label className="mt-2 flex items-center gap-2 font-medium text-amber-ink">
                  <input
                    type="checkbox"
                    checked={line.confirmedWarning}
                    onChange={(e) =>
                      updateLine(line.id, { confirmedWarning: e.target.checked })
                    }
                    disabled={disabled}
                    data-testid={`rx-confirm-${index}`}
                  />
                  I confirm this is correct
                </label>
              </div>
            )}

            {issues.length > 0 && !needsConfirmation && (
              <p
                className="mt-2 text-xs text-muted-foreground"
                data-testid={`rx-issues-${index}`}
              >
                {issues[0]}
              </p>
            )}
          </div>
        )
      })}

      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-md border border-dashed border-line-soft px-3 py-2 text-sm font-medium"
        onClick={() => emit([...lines, emptyLine()])}
        disabled={disabled}
      >
        <Plus className="h-4 w-4" />
        Add medication
      </button>
    </div>
  )
}

function flagMessage(flag: string): string {
  switch (flag) {
    case 'units_per_dose_out_of_range':
      return 'Dose is unusually high or low for this strength.'
    case 'non_half_tablet_fraction':
      return 'Dose is not a whole or half tablet.'
    case 'strength_required_for_mg_dose':
      return 'A strength is needed to compute a mg dose.'
    case 'container_size_required':
      return 'Enter the container size to compute the number of containers.'
    case 'duration_required':
      return 'A duration is required for a scheduled order.'
    case 'frequency_not_schedulable':
      return 'This frequency cannot be scheduled — use a fixed quantity.'
    case 'fixed_quantity_required':
      return 'Enter the total quantity to dispense.'
    default:
      return flag
  }
}
