import type { PrescriptionOrderLine } from '@karibu/shared'
import type { DraftPrescriptionLine } from './PrescriptionComposer'

/**
 * Re-hydrate stored prescription lines (incl. needs_clarification) into composer
 * drafts for resubmit. Structured fields (PHARM-4) are carried back verbatim so
 * the recomputed quantity matches what was originally sent; the line was already
 * vetted, so its warning is treated as confirmed. Legacy rows (no structured
 * fields) fall back to sensible defaults and the clinician re-enters them.
 */
export function prescriptionLinesToDrafts(
  lines: PrescriptionOrderLine[],
): DraftPrescriptionLine[] {
  return lines
    .filter((l) => l.status !== 'cancelled' && l.status !== 'dispensed')
    .map((line): DraftPrescriptionLine => {
      const orderMode = line.order_mode ?? 'scheduled'
      const strength =
        line.strength_amount != null && line.strength_unit
          ? `${line.strength_amount}${line.strength_unit}`
          : ''
      return {
        id: line.id,
        drugCode: line.medication_code ?? '',
        strength,
        containerSize: null,
        // Already-vetted line: don't re-block on the confirmation gate.
        confirmedWarning: true,
        medication_code: line.medication_code,
        free_text_name: line.free_text_name,
        dose_text: line.dose_text ?? null,
        route_text: line.route_text ?? 'PO',
        frequency_text: line.frequency_text ?? null,
        duration_text: line.duration_text ?? null,
        quantity_prescribed: line.quantity_prescribed,
        quantity_unit: line.quantity_unit ?? null,
        // --- structured (PHARM-4) ---
        frequency_code:
          line.frequency_code ?? (orderMode === 'fixed_quantity' ? 'PRN' : 'BID'),
        duration_days: line.duration_days ?? null,
        dose_amount: line.dose_amount ?? null,
        dose_unit: line.dose_unit ?? null,
        strength_amount: line.strength_amount ?? null,
        strength_unit: line.strength_unit ?? null,
        form: line.form ?? null,
        order_mode: orderMode,
        quantity_source: line.quantity_source ?? 'computed',
        dispense_unit: line.dispense_unit ?? null,
        notes: line.notes ?? null,
        source: 'manual' as const,
      }
    })
}
