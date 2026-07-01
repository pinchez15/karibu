/** Uganda financial year starts in July. Quarter 1 = Jul–Sep … Q4 = Apr–Jun. */

export const QUARTER_LABELS = [
  'Q1 (Jul – Sep)',
  'Q2 (Oct – Dec)',
  'Q3 (Jan – Mar)',
  'Q4 (Apr – Jun)',
] as const

export function currentUgandaFyStartYear(asOf = new Date()): number {
  const month = asOf.getMonth() + 1
  const year = asOf.getFullYear()
  return month >= 7 ? year : year - 1
}

export function currentUgandaQuarter(asOf = new Date()): number {
  const month = asOf.getMonth() + 1
  if (month >= 7 && month <= 9) return 1
  if (month >= 10 && month <= 12) return 2
  if (month >= 1 && month <= 3) return 3
  return 4
}

export function ugandaQuarterBounds(
  fyStartYear: number,
  quarter: number,
): { start: string; end: string; label: string } {
  const q = Math.min(4, Math.max(1, quarter))
  const label = `FY ${fyStartYear}/${String(fyStartYear + 1).slice(-2)} · ${QUARTER_LABELS[q - 1]}`
  const bounds: Record<number, { start: string; end: string }> = {
    1: { start: `${fyStartYear}-07-01`, end: `${fyStartYear}-10-01` },
    2: { start: `${fyStartYear}-10-01`, end: `${fyStartYear + 1}-01-01` },
    3: { start: `${fyStartYear + 1}-01-01`, end: `${fyStartYear + 1}-04-01` },
    4: { start: `${fyStartYear + 1}-04-01`, end: `${fyStartYear + 1}-07-01` },
  }
  return { ...bounds[q], label }
}
