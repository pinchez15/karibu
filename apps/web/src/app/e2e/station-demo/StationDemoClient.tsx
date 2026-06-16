'use client'

import { useCallback } from 'react'
import { PharmacyStationClient } from '@/app/dashboard/pharmacy/PharmacyStationClient'
import {
  PHARMACY_STATION_FIXTURE_ROWS,
  mockE2eDispensingStatus,
} from '@/app/dashboard/pharmacy/pharmacy-fixtures'

/**
 * Public E2E fixture — no auth. Used by Playwright for layout/collapse/throughput tests.
 * Disabled in production unless E2E_FIXTURE_ENABLED=1.
 */
export function StationDemoClient() {
  const dispense = useCallback(mockE2eDispensingStatus, [])

  return (
    <PharmacyStationClient
      initialRows={PHARMACY_STATION_FIXTURE_ROWS}
      refreshOnUpdate={false}
      setDispensingStatusFn={dispense}
    />
  )
}
