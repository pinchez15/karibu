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
  test('Test A — quick mark from list without detail interaction', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 })
    await page.goto(FIXTURE_PATH)
    await waitForStationReady(page)

    await expect(page.getByRole('separator')).toBeVisible()

    const firstRow = page.getByTestId('queue-row-visit-e2e-001')
    await firstRow.getByTestId('quick-mark').click()

    await expect(firstRow).toHaveCount(0)
    await expect(page.getByTestId('queue-row-visit-e2e-002')).toHaveAttribute('aria-selected', 'true')
  })

  test('Test B — quick mark from detail pane', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 })
    await page.goto(FIXTURE_PATH)
    await waitForStationReady(page)

    await page
      .getByTestId('pharmacy-detail-pane')
      .getByRole('button', { name: /Quick mark dispensed/i })
      .click()

    await expect(page.getByTestId('queue-row-visit-e2e-001')).toHaveCount(0)
    await expect(page.getByTestId('queue-row-visit-e2e-002')).toHaveAttribute('aria-selected', 'true')
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

    // Sheet auto-opens for the first selection; dismiss it to pick another row at narrow width.
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
