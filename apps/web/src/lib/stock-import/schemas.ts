import { z } from 'zod'

const optionalInt = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === null || v === '') return 0
    const n = typeof v === 'number' ? v : parseInt(String(v).replace(/,/g, ''), 10)
    return Number.isFinite(n) ? Math.max(0, n) : 0
  })

/** Optional price — empty means null (unknown / subsidised). */
const optionalPriceUgx = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === null || v === '') return null
    const n = typeof v === 'number' ? v : parseInt(String(v).replace(/,/g, ''), 10)
    return Number.isFinite(n) && n >= 0 ? n : null
  })

const optionalDate = z
  .string()
  .optional()
  .transform((v) => {
    if (!v?.trim()) return undefined
    const s = v.trim()
    const iso = /^\d{4}-\d{2}-\d{2}$/
    if (iso.test(s)) return s
    const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/
    const m = s.match(dmy)
    if (m) {
      const [, d, mo, y] = m
      return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
    }
    return undefined
  })

const formulationEnum = z.enum([
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
])

const labCategoryEnum = z.enum(['rdt_kit', 'reagent', 'consumable', 'slide_stain', 'other'])

const FORMULATION_ALIASES: Record<string, z.infer<typeof formulationEnum>> = {
  tab: 'tablet',
  tabs: 'tablet',
  tablets: 'tablet',
  cap: 'capsule',
  caps: 'capsule',
  capsuls: 'capsule',
  inj: 'injection',
  injectable: 'injection',
  iv_fluid: 'liquid',
  iv: 'liquid',
  fluid: 'liquid',
  susp: 'suspension',
  syr: 'syrup',
  oint: 'ointment',
  cream_ointment: 'cream',
}

const LAB_CATEGORY_ALIASES: Record<string, z.infer<typeof labCategoryEnum>> = {
  rdt: 'rdt_kit',
  malaria_rdt: 'rdt_kit',
  test_kit: 'rdt_kit',
  kit: 'rdt_kit',
  kits: 'rdt_kit',
  reagents: 'reagent',
  consumables: 'consumable',
  supply: 'consumable',
  supplies: 'consumable',
  clinical: 'consumable',
  slide: 'slide_stain',
  stain: 'slide_stain',
  microscopy: 'slide_stain',
  lab_test: 'other',
  test: 'other',
}

function normalizeFormulation(raw: string | undefined): z.infer<typeof formulationEnum> {
  if (!raw?.trim()) return 'tablet'
  const key = raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')
  if (key in FORMULATION_ALIASES) return FORMULATION_ALIASES[key]
  const parsed = formulationEnum.safeParse(key)
  return parsed.success ? parsed.data : 'other'
}

function normalizeLabCategory(raw: string | undefined): z.infer<typeof labCategoryEnum> {
  if (!raw?.trim()) return 'other'
  const key = raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')
  if (key in LAB_CATEGORY_ALIASES) return LAB_CATEGORY_ALIASES[key]
  const parsed = labCategoryEnum.safeParse(key)
  return parsed.success ? parsed.data : 'other'
}

/** Combine optional brand line with free-text notes for storage. */
export function composeImportNotes(brand?: string, notes?: string): string | undefined {
  const parts: string[] = []
  if (brand?.trim()) parts.push(`Brand: ${brand.trim()}`)
  if (notes?.trim()) parts.push(notes.trim())
  return parts.length > 0 ? parts.join('\n') : undefined
}

export const pharmacyImportRowSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    brand_generic: z.string().optional(),
    code: z.string().optional(),
    strength: z.string().optional(),
    formulation: z.string().optional(),
    unit: z.string().min(1, 'Unit is required'),
    quantity: optionalInt,
    unit_price: optionalPriceUgx,
    low_at: optionalInt,
    batch: z.string().optional(),
    expires: optionalDate,
    supplier: z.string().optional(),
    notes: z.string().optional(),
  })
  .transform((row) => ({
    name: row.name.trim(),
    brand_generic: row.brand_generic?.trim() || undefined,
    code: row.code?.trim().toUpperCase() || undefined,
    strength: row.strength?.trim() || undefined,
    formulation: normalizeFormulation(row.formulation),
    unit: row.unit.trim().toLowerCase(),
    quantity: row.quantity,
    unit_price_ugx: row.unit_price,
    low_at: row.low_at > 0 ? row.low_at : 10,
    batch: row.batch?.trim() || undefined,
    expires: row.expires,
    supplier: row.supplier?.trim() || undefined,
    notes: composeImportNotes(row.brand_generic, row.notes),
  }))

export type PharmacyImportRow = z.infer<typeof pharmacyImportRowSchema>

export const labImportRowSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    brand_generic: z.string().optional(),
    code: z.string().optional(),
    category: z.string().optional(),
    unit: z.string().min(1, 'Unit is required'),
    quantity: optionalInt,
    unit_price: optionalPriceUgx,
    low_at: optionalInt,
    batch: z.string().optional(),
    expires: optionalDate,
    supplier: z.string().optional(),
    notes: z.string().optional(),
  })
  .transform((row) => ({
    name: row.name.trim(),
    brand_generic: row.brand_generic?.trim() || undefined,
    code: row.code?.trim().toUpperCase() || undefined,
    category: normalizeLabCategory(row.category),
    unit: row.unit.trim().toLowerCase(),
    quantity: row.quantity,
    unit_price_ugx: row.unit_price,
    low_at: row.low_at > 0 ? row.low_at : 5,
    batch: row.batch?.trim() || undefined,
    expires: row.expires,
    supplier: row.supplier?.trim() || undefined,
    notes: composeImportNotes(row.brand_generic, row.notes),
  }))

export type LabImportRow = z.infer<typeof labImportRowSchema>
