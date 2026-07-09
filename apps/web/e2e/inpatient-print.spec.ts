/**
 * Inpatient print views — B3 (discharge summary) / B4 (full admission chart)
 * render tests, per docs/workplans/2026-07-09-tester-feedback/inpatient-buildout.md.
 *
 * Fixture: /e2e/inpatient-print-fixture?variant=... (no auth, dev/test only),
 * mirroring the receipt-fixture conventions in e2e/receipt-pagination.spec.ts.
 */

import { test, expect } from '@playwright/test'

const FIXTURE_BASE = '/e2e/inpatient-print-fixture'

/** Count PDF pages by scanning for /Type /Page (singular, not /Pages) in the raw buffer. */
function countPdfPages(buffer: Buffer): number {
  const str = buffer.toString('binary')
  const matches = str.match(/\/Type\s*\/Page(?!s)/g)
  return matches ? matches.length : 0
}

test.describe('B3 — discharge summary print view', () => {
  test('renders every required section for a discharged admission', async ({ page }) => {
    await page.goto(`${FIXTURE_BASE}?variant=discharge`)

    await expect(page.getByText('SSUNGA HC III')).toBeVisible()
    await expect(page.getByText('DISCHARGE SUMMARY')).toBeVisible()
    await expect(page.getByText('Amina Okello')).toBeVisible()
    await expect(page.getByText('4821')).toBeVisible()
    await expect(page.getByText('Community-acquired pneumonia')).toBeVisible()
    await expect(page.getByText(/Recovered/)).toBeVisible()
    await expect(page.getByText('Medicine 1')).toBeVisible()
    await expect(page.getByText(/Completed 5-day course/)).toBeVisible()
    await expect(page.getByText('Dr. Grace Nakato')).toBeVisible()
    await expect(page.getByText('Signature')).toBeVisible()
  })

  test('shows the "not discharged yet" blocker for an active admission', async ({ page }) => {
    await page.goto(`${FIXTURE_BASE}?variant=not-discharged`)
    await expect(page.getByText('Not discharged yet')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open admission chart' })).toBeVisible()
  })
})

test.describe('B4 — full admission chart print view', () => {
  test('renders all sections with page breaks for a dense admission', async ({ page }) => {
    await page.goto(`${FIXTURE_BASE}?variant=chart&dense=1`)

    await expect(page.getByText('ADMISSION CHART')).toBeVisible()
    await expect(page.getByText('Observations')).toBeVisible()
    await expect(page.getByText('Treatment chart — orders')).toBeVisible()
    await expect(page.getByText('IV infusion record')).toBeVisible()
    await expect(page.getByText('Progress notes')).toBeVisible()

    // 24 dense observation rows must all render — no silent clipping.
    const obsRows = page.locator('table').first().locator('tbody tr')
    await expect(obsRows).toHaveCount(24)

    const pdfBuffer = await page.pdf({ preferCSSPageSize: true })
    const pageCount = countPdfPages(pdfBuffer)
    expect(pageCount, 'dense chart must break across multiple pages, one per section').toBeGreaterThan(1)
  })

  test('short chart still renders every section on a single admission', async ({ page }) => {
    await page.goto(`${FIXTURE_BASE}?variant=chart`)
    await expect(page.getByText('ADMISSION CHART')).toBeVisible()
    await expect(page.getByText('Treatment chart — administration record')).toBeVisible()
  })
})
