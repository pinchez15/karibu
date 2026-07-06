/**
 * Receipt pagination regression — D3 (WP5-receipt-print-cuts)
 *
 * Root cause: container-level `break-inside: avoid` on `.thermal-body` caused Blink to push
 * long receipts to a second page, triggering the thermal driver's auto-cutter mid-receipt.
 *
 * These tests use page.pdf({ preferCSSPageSize: true }) so that Chromium honours the
 * `@page { size: Xmm auto; margin: 0 }` rule from ReceiptShell. With auto height the page
 * grows to fit all content — a long receipt should therefore be exactly 1 PDF page.
 * If the `.thermal-body` break-inside regression is re-introduced (or a fixed page height
 * is accidentally added), Chromium may produce a multi-page PDF and these tests will fail.
 *
 * Fixture: /e2e/receipt-fixture?width=58&sections=12 (no auth, dev/test only)
 * Page-count method: count `/Type /Page` (singular) occurrences in the PDF byte buffer.
 * Each real page object has exactly one `/Type /Page` entry; the page-tree root has
 * `/Type /Pages` (plural) which is excluded by the negative lookahead.
 */

import { test, expect } from '@playwright/test'

/** Count PDF pages by scanning for /Type /Page (singular, not /Pages) in the raw buffer. */
function countPdfPages(buffer: Buffer): number {
  const str = buffer.toString('binary')
  const matches = str.match(/\/Type\s*\/Page(?!s)/g)
  return matches ? matches.length : 0
}

const FIXTURE_BASE = '/e2e/receipt-fixture'

test.describe('receipt pagination — no mid-receipt cuts (D3 regression gate)', () => {
  test('12-section pharmacy receipt is exactly 1 page at 58mm', async ({ page }) => {
    await page.goto(`${FIXTURE_BASE}?width=58&sections=12`)
    // Wait for the receipt shell to be rendered (autoPrint=false, so no print dialog)
    await expect(page.locator('.thermal-body')).toBeVisible({ timeout: 10_000 })

    const pdfBuffer = await page.pdf({ preferCSSPageSize: true })
    const pageCount = countPdfPages(pdfBuffer)

    expect(pageCount, '12-section 58mm receipt must render as 1 PDF page').toBe(1)
  })

  test('12-section pharmacy receipt is exactly 1 page at 80mm', async ({ page }) => {
    await page.goto(`${FIXTURE_BASE}?width=80&sections=12`)
    await expect(page.locator('.thermal-body')).toBeVisible({ timeout: 10_000 })

    const pdfBuffer = await page.pdf({ preferCSSPageSize: true })
    const pageCount = countPdfPages(pdfBuffer)

    expect(pageCount, '12-section 80mm receipt must render as 1 PDF page').toBe(1)
  })

  test('short receipt (3 sections) is exactly 1 page at 58mm — control', async ({ page }) => {
    await page.goto(`${FIXTURE_BASE}?width=58&sections=3`)
    await expect(page.locator('.thermal-body')).toBeVisible({ timeout: 10_000 })

    const pdfBuffer = await page.pdf({ preferCSSPageSize: true })
    const pageCount = countPdfPages(pdfBuffer)

    expect(pageCount, 'short 58mm receipt must render as 1 PDF page').toBe(1)
  })
})
