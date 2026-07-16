'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { PharmacyStationClient } from '@/app/dashboard/pharmacy/PharmacyStationClient'
import { dispensingStatusOnTab } from '@/app/dashboard/pharmacy/pharmacy-tabs'
import { PHARMACY_STATION_FIXTURE_ROWS } from '@/app/dashboard/pharmacy/pharmacy-fixtures'
import type { PharmacyQueueTab } from '@karibu/shared'

/**
 * Public E2E fixture — no auth. Used by Playwright for layout/collapse/throughput
 * tests and for the PHARM-5 partial-dispense flow. Disabled in production unless
 * E2E_FIXTURE_ENABLED=1.
 *
 * There is no backend here, so this component fakes the per-line dispense server
 * action: each line dispense on a visit returns 'partial' until the visit's last
 * line, then 'dispensed'. It also mirrors the resulting row state (mark partial,
 * or remove on full dispense) so tab membership updates the way a real refetch
 * would. PHARM-5: a `partial` visit leaves "To dispense" and appears on the
 * "Partial" tab, where the remainder can be dispensed to completion.
 */
export function StationDemoClient() {
  const [rows, setRows] = useState(PHARMACY_STATION_FIXTURE_ROWS)
  const [tab, setTab] = useState<PharmacyQueueTab>('to_dispense')
  const dispensedCounts = useRef<Record<string, number>>({})

  const visibleRows = useMemo(
    () => rows.filter((r) => dispensingStatusOnTab(tab, r.dispensing_status)),
    [rows, tab],
  )

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
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex gap-2 border-b border-line-soft p-2" data-testid="demo-tabs">
        {(['to_dispense', 'partial'] as PharmacyQueueTab[]).map((t) => (
          <button
            key={t}
            type="button"
            data-testid={`pharmacy-tab-${t}`}
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className="rounded-full px-3 py-1 text-sm"
          >
            {t === 'to_dispense' ? 'To dispense' : 'Partial'} ({
              rows.filter((r) => dispensingStatusOnTab(t, r.dispensing_status)).length
            })
          </button>
        ))}
      </div>
      <PharmacyStationClient
        key={tab}
        initialRows={visibleRows}
        activeTab={tab}
        refreshOnUpdate={false}
        completeDispenseFn={completeDispenseFn}
        startDispenseFn={startDispenseFn}
      />
    </div>
  )
}
