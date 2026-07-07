import type { PrescriptionOrderLine } from '@karibu/shared'
import type { DraftPrescriptionLine } from './PrescriptionComposer'

/** Map stored prescription lines (incl. needs_clarification) into composer drafts for resubmit. */
export function prescriptionLinesToDrafts(lines: PrescriptionOrderLine[]): DraftPrescriptionLine[] {
  return lines
    .filter((l) => l.status !== 'cancelled' && l.status !== 'dispensed')
    .map((line) => ({
      id: line.id,
      drugCode: line.medication_code ?? '',
      strength: '',
      medication_code: line.medication_code,
      free_text_name: line.free_text_name,
      dose_text: line.dose_text ?? '',
      route_text: line.route_text ?? 'PO',
      frequency_text: line.frequency_text ?? '',
      duration_text: line.duration_text ?? '',
      durationDays: null,
      quantity_prescribed: line.quantity_prescribed,
      quantity_unit: line.quantity_unit ?? '',
      notes: line.notes ?? '',
    }))
}
