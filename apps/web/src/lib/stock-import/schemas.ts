import { z } from 'zod'

const optionalNumber = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === null || v === '') return undefined
    const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''))
    return Number.isFinite(n) ? n : undefined
  })

const optionalDate = z
  .string()
  .optional()
  .transform((v) => {
    if (!v?.trim()) return null
    const trimmed = v.trim()
    // Accept YYYY-MM-DD or DD/MM/YYYY (common on handwritten lists)
    const iso = /^\d{4}-\d{2}-\d{2}$/
    if (iso.test(trimmed)) return trimmed
    const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed)
    if (dmy) {
      const [, d, m, y] = dmy
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    }
    return trimmed
  })

export const PHARMACY_FORMULATIONS = [
  'tablet',
  'capsule',
  'liquid',
  'syrup',
  'suspension',
  'injection',
  'powder',
  'inhaler',
  'drops',
  'cream',
  'ointment',
  'sachet',
  'vial',
  'patch',
  'other',
] as const

export const LAB_CATEGORIES = [
  'rdt_kit',
  'reagent',
  'consumable',
  'slide_stain',
  'other',
] as const

export const pharmacyImportRowSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  code: z.string().optional().transform((v) => v?.trim() || undefined),
  strength: z.string().optional().transform((v) => v?.trim() || null),
  formulation: z
    .string()
    .optional()
    .transform((v) => {
      const raw = (v ?? 'tablet').trim().toLowerCase()
      const match = PHARMACY_FORMULATIONS.find((f) => f === raw || f.startsWith(raw))
      return match ?? 'other'
    }),
  unit: z.string().min(1, 'Unit is required'),
  quantity: optionalNumber.transform((n) => n ?? 0),
  low_at: optionalNumber.transform((n) => n ?? 10),
  batch: z.string().optional().transform((v) => v?.trim() || null),
  expires: optionalDate,
  supplier: z.string().optional().transform((v) => v?.trim() || null),
  notes: z.string().optional().transform((v) => v?.trim() || null),
})

export const labImportRowSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  code: z.string().optional().transform((v) => v?.trim() || null),
  category: z
    .string()
    .optional()
    .transform((v) => {
      const raw = (v ?? 'consumable').trim().toLowerCase().replace(/\s+/g, '_')
      const aliases: Record<string, (typeof LAB_CATEGORIES)[number]> = {
        rdt: 'rdt_kit',
        rdt_kit: 'rdt_kit',
        kit: 'rdt_kit',
        reagent: 'reagent',
        reagents: 'reagent',
        consumable: 'consumable',
        consumables: 'consumable',
        clinical: 'consumable',
        supply: 'consumable',
        supplies: 'consumable',
        slide: 'slide_stain',
        slide_stain: 'slide_stain',
        stain: 'slide_stain',
        other: 'other',
      }
      return aliases[raw] ?? (LAB_CATEGORIES.includes(raw as (typeof LAB_CATEGORIES)[number])
        ? (raw as (typeof LAB_CATEGORIES)[number])
        : 'other')
    }),
  unit: z.string().min(1, 'Unit is required'),
  quantity: optionalNumber.transform((n) => n ?? 0),
  low_at: optionalNumber.transform((n) => n ?? 5),
  batch: z.string().optional().transform((v) => v?.trim() || null),
  expires: optionalDate,
  supplier: z.string().optional().transform((v) => v?.trim() || null),
  notes: z.string().optional().transform((v) => v?.trim() || null),
})

export type PharmacyImportRow = z.infer<typeof pharmacyImportRowSchema>
export type LabImportRow = z.infer<typeof labImportRowSchema>

export type RowValidation<T> =
  | { ok: true; data: T }
  | { ok: false; errors: string[] }

export function validatePharmacyRow(
  raw: Record<string, string>,
  rowIndex: number,
): RowValidation<PharmacyImportRow> {
  const parsed = pharmacyImportRowSchema.safeParse(raw)
  if (parsed.success) return { ok: true, data: parsed.data }
  const errors = parsed.error.issues.map((i) => `Row ${rowIndex + 1}: ${i.message}`)
  return { ok: false, errors }
}

export function validateLabRow(
  raw: Record<string, string>,
  rowIndex: number,
): RowValidation<LabImportRow> {
  const parsed = labImportRowSchema.safeParse(raw)
  if (parsed.success) return { ok: true, data: parsed.data }
  const errors = parsed.error.issues.map((i) => `Row ${rowIndex + 1}: ${i.message}`)
  return { ok: false, errors }
}
