'use client'

import { useCallback, useRef, useState } from 'react'
import { PharmacyStationClient } from '@/app/dashboard/pharmacy/PharmacyStationClient'
import { PHARMACY_STATION_FIXTURE_ROWS } from '@/app/dashboard/pharmacy/pharmacy-fixtures'

/**
 * Public E2E fixture — no auth. Used by Playwright for layout/collapse/throughput
 * tests and for the WP1 anti-disappearance flow. Disabled in production unless
 * E2E_FIXTURE_ENABLED=1.
 *
 * There is no backend here, so this component fakes the per-line dispense server
 * action: each line dispense on a visit returns 'partial' until the visit's last
 * line, then 'dispensed'. It also mirrors the resulting row state (keep + mark
 * partial, or remove on full dispense) so the status chip updates the way a real
 * refetch would.
 */
export function StationDemoClient() {
  const [rows, setRows] = useState(PHARMACY_STATION_FIXTURE_ROWS)
  const dispensedCounts = useRef<Record<string, number>>({})

  const completeDispenseFn = useCallback(
    async ({ visitId }: { visitId: string }) => {
      const total =
        PHARMACY_STATION_FIXTURE_ROWS.find((r) => r.id === visitId)?.prescription_lines
          .length ?? 1
      const n = (dispensedCounts.current[visitId] ?? 0) + 1
      dispensedCounts.current[visitId] = n
      const dispensingStatus = n >= total ? 'dispensed' : 'partial'

      setRows((prev) => {
        if (dispensingStatus === 'dispensed') {
          return prev.filter((r) => r.id !== visitId)
        }
        return prev.map((r) =>
          r.id === visitId ? { ...r, dispensing_status: 'partial' as const } : r,
        )
      })

      return { success: true as const, dispensingStatus }
    },
    [],
  )

  // No auth in the public fixture, so stub the "start dispense" server action
  // that the worksheet would otherwise call for a not_started visit.
  const startDispenseFn = useCallback(async () => ({ success: true as const }), [])

  return (
    <PharmacyStationClient
      initialRows={rows}
      activeTab="to_dispense"
      refreshOnUpdate={false}
      completeDispenseFn={completeDispenseFn}
      startDispenseFn={startDispenseFn}
    />
  )
}
