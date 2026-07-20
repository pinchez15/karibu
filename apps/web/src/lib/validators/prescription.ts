import {
  DISPENSE_UNITS,
  DOSE_UNITS,
  FREQUENCY_CODES,
  ORDER_MODES,
  QUANTITY_SOURCES,
} from '@karibu/shared';
import { z } from 'zod';

// §0 invariant: the AI has recording power, not prescribing power. A client may
// ONLY submit human-entered sources. `ai_suggested`/`manual_confirmed` are
// retired from the writable set — .parse() throws if they appear, and the RPC
// gate rejects them server-side as the true barrier.
export const PrescriptionSourceInputSchema = z.enum(['manual', 'legacy_text']);

export const PrescriptionLineInputSchema = z
  .object({
    medication_code: z.string().trim().optional().nullable(),
    free_text_name: z.string().trim().optional().nullable(),
    // Derived text — optional; the RPC re-derives these from the structured
    // fields. Retained for legacy/print back-compat.
    dose_text: z.string().trim().optional().nullable(),
    route_text: z.string().trim().optional().nullable(),
    frequency_text: z.string().trim().optional().nullable(),
    duration_text: z.string().trim().optional().nullable(),
    quantity_prescribed: z.number().positive().optional().nullable(),
    quantity_unit: z.string().trim().optional().nullable(),
    // --- PHARM-4 structured fields ---
    frequency_code: z.enum(FREQUENCY_CODES).optional().nullable(),
    duration_days: z.number().int().positive().optional().nullable(),
    dose_amount: z.number().positive().optional().nullable(),
    dose_unit: z.enum(DOSE_UNITS).optional().nullable(),
    strength_amount: z.number().positive().optional().nullable(),
    strength_unit: z.string().trim().optional().nullable(),
    form: z.string().trim().optional().nullable(),
    order_mode: z.enum(ORDER_MODES).optional().nullable(),
    quantity_source: z.enum(QUANTITY_SOURCES).optional().nullable(),
    dispense_unit: z.enum(DISPENSE_UNITS).optional().nullable(),
    notes: z.string().trim().optional().nullable(),
    source: PrescriptionSourceInputSchema.optional(),
  })
  .refine(
    (line) =>
      Boolean(line.medication_code?.trim()) || Boolean(line.free_text_name?.trim()),
    { message: 'Each line needs a drug or free-text name' },
  );

export const SubmitPharmacyOrderSchema = z.object({
  visitId: z.string().uuid(),
  lines: z.array(PrescriptionLineInputSchema).min(1),
  medicationsSummary: z.string().trim().optional(),
});

export const DispenseLineStatusSchema = z.enum([
  'dispensed',
  'partially_dispensed',
  'out_of_stock',
]);

export const CompleteDispenseLineSchema = z.object({
  prescription_order_id: z.string().uuid(),
  line_status: DispenseLineStatusSchema,
  quantity_dispensed: z.number().nonnegative().optional().nullable(),
  quantity_unit: z.string().trim().optional().nullable(),
  stock_item_id: z.string().uuid().optional().nullable(),
  stock_quantity: z.number().positive().optional().nullable(),
  batch_number: z.string().trim().optional().nullable(),
  substitute_medication_code: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

export const CompletePharmacyDispenseSchema = z.object({
  visitId: z.string().uuid(),
  lines: z.array(CompleteDispenseLineSchema).min(1),
  notes: z.string().trim().optional(),
});

export type PrescriptionLineInput = z.infer<typeof PrescriptionLineInputSchema>;
export type DispenseLineStatus = z.infer<typeof DispenseLineStatusSchema>;
export type CompleteDispenseLine = z.infer<typeof CompleteDispenseLineSchema>;

export function pharmacyTabForVisit(
  dispensingStatus: string,
  dispensedAt: string | null | undefined,
): 'waiting' | 'in_progress' | 'done_today' | null {
  if (dispensingStatus === 'not_started') return 'waiting';
  // Partial visits still need pharmacist action — keep them in the active queue.
  if (dispensingStatus === 'in_progress' || dispensingStatus === 'partial') {
    return 'in_progress';
  }
  if (['dispensed', 'out_of_stock'].includes(dispensingStatus)) {
    if (!dispensedAt) return 'done_today';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const at = new Date(dispensedAt);
    return at >= today ? 'done_today' : null;
  }
  return null;
}

export function aggregateDispensingStatus(
  lineStatuses: Array<
    | 'ordered'
    | 'dispensing'
    | 'dispensed'
    | 'partially_dispensed'
    | 'out_of_stock'
    | 'cancelled'
    | 'needs_clarification'
  >,
): 'not_started' | 'in_progress' | 'dispensed' | 'partial' | 'out_of_stock' {
  const active = lineStatuses.filter((s) => s !== 'cancelled');
  if (active.length === 0) return 'not_started';
  if (active.every((s) => s === 'dispensed')) return 'dispensed';
  if (active.every((s) => s === 'out_of_stock')) return 'out_of_stock';
  if (active.every((s) => s === 'needs_clarification')) return 'not_started';
  // Mid-session: keep To dispense while any line is still open — do not bounce
  // to Partial just because the first med of a multi-line Rx was finished.
  // Mirrors aggregate_visit_dispensing_status (migration 113).
  if (active.some((s) => s === 'ordered' || s === 'dispensing')) {
    return 'in_progress';
  }
  if (
    active.some((s) =>
      ['dispensed', 'partially_dispensed', 'out_of_stock'].includes(s),
    )
  ) {
    return 'partial';
  }
  if (active.some((s) => s === 'needs_clarification')) {
    return 'in_progress';
  }
  return 'in_progress';
}
