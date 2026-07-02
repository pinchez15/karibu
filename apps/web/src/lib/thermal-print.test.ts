import { describe, expect, it } from 'vitest'
import {
  RECEIPT_WIDTH_CHARS,
  centerLine,
  createThermalHelpers,
  layoutFromPaperWidth,
  row,
  sectionRule,
  wrapText,
} from './thermal-print'

describe('thermal-print', () => {
  it('sectionRule centers labels within receipt width', () => {
    const line = sectionRule('TOTAL')
    expect(line.length).toBe(RECEIPT_WIDTH_CHARS)
    expect(line).toContain(' TOTAL ')
  })

  it('centerLine pads text to receipt width', () => {
    const line = centerLine('KARIBU')
    expect(line.length).toBe(RECEIPT_WIDTH_CHARS)
    expect(line.trim()).toBe('KARIBU')
  })

  it('row keeps label and value on one line', () => {
    const line = row('Total paid:', 'UGX 29,000')
    expect(line.length).toBeLessThanOrEqual(RECEIPT_WIDTH_CHARS)
    expect(line).toContain('Total paid:')
    expect(line).toContain('UGX 29,000')
  })

  it('row truncates long labels instead of overflowing', () => {
    const line = row('Very long charge description here', 'UGX 5,000')
    expect(line.length).toBeLessThanOrEqual(RECEIPT_WIDTH_CHARS)
    expect(line.endsWith('UGX 5,000')).toBe(true)
  })

  it('wrapText breaks long prose at word boundaries', () => {
    const lines = wrapText('Take one tablet by mouth every morning after food')
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(RECEIPT_WIDTH_CHARS)
    }
  })

  it('wrapText splits very long tokens', () => {
    const token = 'A'.repeat(40)
    const lines = wrapText(token)
    expect(lines.join('')).toBe(token)
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(RECEIPT_WIDTH_CHARS)
    }
  })

  it('layoutFromPaperWidth maps 80mm to 48 columns', () => {
    const layout = layoutFromPaperWidth(80, 18)
    expect(layout.charsPerLine).toBe(48)
    expect(layout.paperWidthMm).toBe(80)
    expect(layout.cutFeedMm).toBe(18)
  })

  it('createThermalHelpers uses layout width', () => {
    const helpers = createThermalHelpers(layoutFromPaperWidth(80))
    expect(helpers.hrHeavy.length).toBe(48)
    expect(helpers.sectionRule('TEST').length).toBe(48)
  })
})
