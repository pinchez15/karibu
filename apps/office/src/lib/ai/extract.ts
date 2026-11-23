// Photo-to-catalog (spec §7.C.2). The model drafts; a person approves. Nothing
// from here is written to a clinic: it only becomes a draft the partner edits.
import type { VisionImage, VisionProvider } from './provider'

export type CatalogKind = 'drugs' | 'services'

export interface DrugRow { name: string; strength: string; formulation: string; unit_price: string; quantity: string }
export interface ServiceRow { name: string; kind: 'consultation' | 'lab' | 'procedure' | 'other'; price: string }

export const FORMULATIONS = [
  'tablet', 'capsule', 'liquid', 'syrup', 'suspension', 'injection', 'powder',
  'inhaler', 'drops', 'cream', 'ointment', 'sachet', 'vial', 'patch', 'other',
] as const

const SYSTEM = `You transcribe photographed paper lists from small Ugandan health facilities into JSON.
Rules:
- Transcribe only what is written. Never invent a row, a price or a quantity. Leave a field as "" if it is not on the page or you cannot read it.
- Prices are Ugandan shillings. Return digits only, no commas or currency ("1,500/=" -> "1500").
- If the page contains any patient names or patient records, ignore them completely. Never output a person's name.
- Respond with a single JSON object and nothing else.`

const PROMPTS: Record<CatalogKind, string> = {
  drugs: `These photos show a facility's drug or stock list. Return {"rows":[{"name","strength","formulation","unit_price","quantity"}]}.
- name: the generic drug name as written, without strength or form (e.g. "Amoxicillin").
- strength: e.g. "500mg", "125mg/5ml".
- formulation: one of ${FORMULATIONS.join(', ')}. Use "other" if unclear.
- unit_price: selling price per tablet, capsule, bottle or dose.
- quantity: stock on hand if the page shows it.`,
  services: `These photos show a facility's price list for services. Return {"rows":[{"name","kind","price"}]}.
- kind: "consultation" for the consultation or clinician fee, "lab" for laboratory tests, "procedure" for procedures such as dressing or delivery, otherwise "other".
- Do not include drugs; they are captured separately.`,
}

const digits = (v: unknown) => String(v ?? '').replace(/[^0-9.]/g, '')
const clean = (v: unknown, max = 120) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

/** Coerces whatever the model returned into safe, bounded rows. Exported for tests. */
export function normalizeRows(kind: CatalogKind, raw: unknown): DrugRow[] | ServiceRow[] {
  const rows = Array.isArray((raw as { rows?: unknown })?.rows) ? ((raw as { rows: unknown[] }).rows) : []
  const usable = rows.filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null && clean((r as Record<string, unknown>).name) !== '').slice(0, 400)
  if (kind === 'drugs') {
    return usable.map((r) => {
      const form = clean(r.formulation, 20).toLowerCase()
      return {
        name: clean(r.name),
        strength: clean(r.strength, 40),
        formulation: (FORMULATIONS as readonly string[]).includes(form) ? form : 'other',
        unit_price: digits(r.unit_price).split('.')[0],
        quantity: digits(r.quantity),
      }
    })
  }
  return usable.map((r) => {
    const k = clean(r.kind, 20).toLowerCase()
    return {
      name: clean(r.name),
      kind: (['consultation', 'lab', 'procedure', 'other'] as const).find((x) => x === k) ?? 'other',
      price: digits(r.price).split('.')[0],
    }
  })
}

export async function extractCatalog(provider: VisionProvider, kind: CatalogKind, images: VisionImage[]) {
  const raw = await provider.extractJson({ system: SYSTEM, user: PROMPTS[kind], images: images.slice(0, 6) })
  return normalizeRows(kind, raw)
}
