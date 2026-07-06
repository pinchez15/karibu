import { test, expect } from '@playwright/test'
import { STATION_COLLAPSE_BP } from '../src/components/master-detail'

const FIXTURE_PATH = '/e2e/station-demo'

async function waitForStationReady(page: import('@playwright/test').Page) {
  await expect(page.getByTestId('pharmacy-station-workspace')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('queue-row-visit-e2e-001')).toHaveAttribute('aria-selected', 'true', {
    timeout: 10_000,
  })
  await expect(page.getByTestId('pharmacy-detail-pane')).toBeVisible()
}

test.describe('pharmacy station workspace', () => {
  test('Test A — complete dispense from worksheet', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 })
    await page.goto(FIXTURE_PATH)
    await waitForStationReady(page)

    await expect(page.getByRole('separator')).toBeVisible()

    const firstRow = page.getByTestId('queue-row-visit-e2e-001')
    await page.getByTestId('save-complete').click()

    await expect(firstRow).toHaveCount(0)
    await expect(page.getByTestId('queue-row-visit-e2e-002')).toHaveAttribute('aria-selected', 'true')
  })

  test('Test B — complete dispense after selecting second row', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 })
    await page.goto(FIXTURE_PATH)
    await waitForStationReady(page)

    await page.getByTestId('queue-row-visit-e2e-002').click()
    await expect(page.getByTestId('queue-row-visit-e2e-002')).toHaveAttribute('aria-selected', 'true')
    await page.getByTestId('save-complete').click()

    await expect(page.getByTestId('queue-row-visit-e2e-002')).toHaveCount(0)
  })

  test('WP1 — a 2-line script stays on "To dispense" after line 1, leaves after line 2', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1366, height: 768 })
    await page.goto(FIXTURE_PATH)
    await waitForStationReady(page)

    const row = page.getByTestId('queue-row-visit-e2e-004')
    await row.click()
    await expect(row).toHaveAttribute('aria-selected', 'true')

    // Both lines are shown in the worksheet before any dispense.
    await expect(page.getByTestId('rx-line-rx-visit-e2e-004-0')).toBeVisible()
    await expect(page.getByTestId('rx-line-rx-visit-e2e-004-1')).toBeVisible()

    // Dispense line 1 → visit must remain visible and selected (the bug fix),
    // now flagged "Partial", with line 2 still dispensable.
    await page.getByTestId('save-complete').click()
    await expect(row).toHaveCount(1)
    await expect(row).toHaveAttribute('aria-selected', 'true')
    await expect(row.getByText('Partial')).toBeVisible()
    await expect(page.getByTestId('dispense-rx-visit-e2e-004-1')).toBeVisible()

    // Dispense line 2 → visit is fully dispensed and leaves "To dispense".
    await page.getByTestId('dispense-rx-visit-e2e-004-1').click()
    await expect(row).toHaveCount(0)
  })

  test('Test C — collapses to list + sheet below breakpoint', async ({ page }) => {
    await page.setViewportSize({ width: STATION_COLLAPSE_BP, height: 768 })
    await page.goto(FIXTURE_PATH)
    await waitForStationReady(page)
    await expect(page.locator('[data-collapsed="false"]')).toBeVisible()
    await expect(page.getByRole('separator')).toBeVisible()

    await page.setViewportSize({ width: 900, height: 768 })
    await page.goto(FIXTURE_PATH)
    await waitForStationReady(page)
    await expect(page.locator('[data-collapsed="true"]')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('separator')).toHaveCount(0)

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('pharmacy-detail-pane')).toBeHidden()

    await page.getByTestId('queue-row-visit-e2e-002').click()
    await expect(page.getByTestId('pharmacy-detail-pane')).toBeVisible()

    await page.setViewportSize({ width: STATION_COLLAPSE_BP, height: 768 })
    await page.goto(FIXTURE_PATH)
    await waitForStationReady(page)
    await expect(page.locator('[data-collapsed="false"]')).toBeVisible()
    await page.getByTestId('queue-row-visit-e2e-002').click()
    await expect(page.getByTestId('queue-row-visit-e2e-002')).toHaveAttribute('aria-selected', 'true')
  })

  test('no horizontal page scroll at 1366×768 with full fixture queue', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 })
    await page.goto(FIXTURE_PATH)
    await waitForStationReady(page)

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1)
  })
})
