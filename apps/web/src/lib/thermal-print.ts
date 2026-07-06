/** Thermal roll presets: monospace columns at ~10–11pt. */
export type PaperWidthMm = 58 | 80

export type ThermalPrintLayout = {
  paperWidthMm: PaperWidthMm
  charsPerLine: number
  cutFeedMm: number
}

export const DEFAULT_THERMAL_LAYOUT: ThermalPrintLayout = {
  paperWidthMm: 58,
  charsPerLine: 32,
  cutFeedMm: 14,
}

export function charsForPaperWidth(paperWidthMm: PaperWidthMm): number {
  return paperWidthMm === 80 ? 48 : 32
}

export function layoutFromPaperWidth(
  paperWidthMm: PaperWidthMm,
  cutFeedMm = DEFAULT_THERMAL_LAYOUT.cutFeedMm,
): ThermalPrintLayout {
  return {
    paperWidthMm,
    charsPerLine: charsForPaperWidth(paperWidthMm),
    cutFeedMm,
  }
}

/** Screen preview width ≈ paper mm × 5.5px. */
export function previewWidthPx(paperWidthMm: number): number {
  return Math.round(paperWidthMm * 5.5)
}

/** Blank newline count before auto-cut (paired with .cut-feed height in CSS). */
export function cutFeedLines(cutFeedMm: number): number {
  return Math.max(4, Math.round(cutFeedMm / 1.75))
}

// Default-width exports (backward compatible).
export const RECEIPT_WIDTH_CHARS = DEFAULT_THERMAL_LAYOUT.charsPerLine
export const HR_HEAVY = '='.repeat(RECEIPT_WIDTH_CHARS)
export const HR_LIGHT = '-'.repeat(RECEIPT_WIDTH_CHARS)
export const CUT_FEED_LINES = cutFeedLines(DEFAULT_THERMAL_LAYOUT.cutFeedMm)

export function hrHeavy(width = RECEIPT_WIDTH_CHARS): string {
  return '='.repeat(width)
}

export function hrLight(width = RECEIPT_WIDTH_CHARS): string {
  return '-'.repeat(width)
}

/** Center a label inside a rule of dashes, e.g. "----- TOTAL -----". */
export function sectionRule(label: string, width = RECEIPT_WIDTH_CHARS): string {
  const inner = ` ${label} `
  const remaining = width - inner.length
  if (remaining <= 0) return inner.slice(0, width)
  const left = Math.floor(remaining / 2)
  return '-'.repeat(left) + inner + '-'.repeat(remaining - left)
}

/** Center plain text within the receipt width using spaces (reliable on thermal). */
export function centerLine(text: string, width = RECEIPT_WIDTH_CHARS): string {
  const trimmed = text.trim()
  if (trimmed.length >= width) return trimmed.slice(0, width)
  const pad = width - trimmed.length
  const left = Math.floor(pad / 2)
  return ' '.repeat(left) + trimmed + ' '.repeat(pad - left)
}

/** Left-label + right-value on one line; truncates overflow instead of wrapping past width. */
export function row(label: string, value: string, width = RECEIPT_WIDTH_CHARS): string {
  const maxLabel = Math.max(8, width - value.length - 1)
  const trimmedLabel = label.length > maxLabel ? label.slice(0, maxLabel) : label
  const space = width - trimmedLabel.length - value.length
  if (space < 1) {
    return `${trimmedLabel.slice(0, width - value.length - 1)} ${value}`.slice(0, width)
  }
  return trimmedLabel + ' '.repeat(space) + value
}

/** Word-wrap prose to receipt width for thermal output. */
export function wrapText(text: string, width = RECEIPT_WIDTH_CHARS): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []

  const lines: string[] = []
  for (const paragraph of normalized.split('\n')) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      lines.push('')
      continue
    }

    let current = ''
    for (const word of words) {
      if (word.length > width) {
        if (current) {
          lines.push(current)
          current = ''
        }
        for (let i = 0; i < word.length; i += width) {
          lines.push(word.slice(i, i + width))
        }
        continue
      }

      const candidate = current ? `${current} ${word}` : word
      if (candidate.length <= width) {
        current = candidate
      } else {
        lines.push(current)
        current = word
      }
    }
    if (current) lines.push(current)
  }
  return lines
}

export type ThermalPrintHelpers = {
  layout: ThermalPrintLayout
  hrHeavy: string
  hrLight: string
  sectionRule: (label: string) => string
  centerLine: (text: string) => string
  row: (label: string, value: string) => string
  wrapText: (text: string) => string[]
}

export function createThermalHelpers(layout: ThermalPrintLayout): ThermalPrintHelpers {
  const w = layout.charsPerLine
  return {
    layout,
    hrHeavy: hrHeavy(w),
    hrLight: hrLight(w),
    sectionRule: (label) => sectionRule(label, w),
    centerLine: (text) => centerLine(text, w),
    row: (label, value) => row(label, value, w),
    wrapText: (text) => wrapText(text, w),
  }
}
