import { z } from 'zod';

export const PrescriptionLineInputSchema = z
  .object({
    medication_code: z.string().trim().optional().nullable(),
    free_text_name: z.string().trim().optional().nullable(),
    dose_text: z.string().trim().optional().nullable(),
    route_text: z.string().trim().optional().nullable(),
    frequency_text: z.string().trim().optional().nullable(),
    duration_text: z.string().trim().optional().nullable(),
    quantity_prescribed: z.number().positive().optional().nullable(),
    quantity_unit: z.string().trim().optional().nullable(),
    notes: z.string().trim().optional().nullable(),
    source: z
      .enum(['manual', 'manual_confirmed', 'ai_suggested', 'legacy_text'])
      .optional(),
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
  if (active.some((s) => s === 'needs_clarification')) return 'not_started';
  if (active.every((s) => s === 'dispensed')) return 'dispensed';
  if (active.every((s) => s === 'out_of_stock')) return 'out_of_stock';
  if (
    active.some((s) =>
      ['dispensed', 'partially_dispensed', 'out_of_stock'].includes(s),
    )
  ) {
    return 'partial';
  }
  return 'in_progress';
}
