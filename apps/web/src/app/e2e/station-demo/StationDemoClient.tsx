'use client'

import { useCallback } from 'react'
import { PharmacyStationClient } from '@/app/dashboard/pharmacy/PharmacyStationClient'
import { PHARMACY_STATION_FIXTURE_ROWS } from '@/app/dashboard/pharmacy/pharmacy-fixtures'

/**
 * Public E2E fixture — no auth. Used by Playwright for layout/collapse/throughput tests.
 * Disabled in production unless E2E_FIXTURE_ENABLED=1.
 */
export function StationDemoClient() {
  const completeDispenseFn = useCallback(
    async () => ({ success: true as const, dispensingStatus: 'dispensed' }),
    [],
  )

  return (
    <PharmacyStationClient
      initialRows={PHARMACY_STATION_FIXTURE_ROWS}
      activeTab="waiting"
      refreshOnUpdate={false}
      completeDispenseFn={completeDispenseFn}
    />
  )
}
