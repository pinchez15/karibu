import type { PrescriptionOrderLine } from '@karibu/shared'

export type PharmacyStockRow = {
  id: string
  drug_name: string
  drug_code: string
  strength: string | null
  unit: string
  quantity_on_hand: number
}

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function namesOverlap(a: string, b: string): boolean {
  const na = normalizeToken(a)
  const nb = normalizeToken(b)
  if (!na || !nb) return false
  return na.includes(nb) || nb.includes(na)
}

/** Stock rows that match a structured prescription line (code first, then drug name). */
export function matchStockForPrescription(
  line: Pick<PrescriptionOrderLine, 'medication_code' | 'free_text_name'>,
  displayName: string,
  stock: PharmacyStockRow[],
): PharmacyStockRow[] {
  const code = line.medication_code?.trim().toUpperCase()
  if (code) {
    const byCode = stock.filter((item) => item.drug_code.toUpperCase() === code)
    if (byCode.length > 0) return byCode
  }

  const label = (displayName || line.free_text_name || '').trim()
  if (!label) return []

  return stock.filter(
    (item) =>
      namesOverlap(item.drug_name, label) ||
      (code ? namesOverlap(item.drug_code, code) : false),
  )
}

export function stockItemLabel(item: PharmacyStockRow): string {
  const strength = item.strength?.trim()
  const onHand = `${item.quantity_on_hand} ${item.unit}`.trim()
  return `${item.drug_name}${strength ? ` ${strength}` : ''} (${onHand} on hand)`
}
