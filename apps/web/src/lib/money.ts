/** Plain integer display for stock spreadsheets (e.g. 3000 → "3,000"). */
export function formatStockUnitPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return Math.round(n).toLocaleString('en-US')
}

/** Patient bill unit price = stock cost + clinic markup %. */
export function patientUnitPriceFromStock(
  costUgX: number | null | undefined,
  markupPercent: number,
): number | null {
  if (costUgX == null || !Number.isFinite(costUgX)) return null
  const markup = Number.isFinite(markupPercent) ? markupPercent : 0
  return Math.round(costUgX * (1 + markup / 100))
}

export function formatUgX(n: number): string {
  return `UGX ${Math.round(n).toLocaleString('en-US')}`
}
