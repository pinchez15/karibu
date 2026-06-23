'use client'

import Link from 'next/link'
import { AlertTriangle, History } from 'lucide-react'
import { ClinicCalendar } from '@/components/clinic-calendar/ClinicCalendar'
import type { ClinicAppointment } from '@/lib/calendar-events'

export type TodayAppointment = ClinicAppointment

export type OutOfStockItem = { label: string; detail: string }

export type RoundsVisit = {
  visit_id: string
  patient_name: string | null
  summary: string
  visit_date: string
}

export function TodayPanels({
  appointments,
  outOfStock,
  rounds,
}: {
  appointments: TodayAppointment[]
  outOfStock: OutOfStockItem[]
  rounds: RoundsVisit[]
}) {
  return (
    <div className="mb-5 space-y-3">
      {outOfStock.length > 0 && (
        <div className="rounded-xl border border-amber-soft bg-amber-soft/20 px-4 py-2.5">
          <div className="flex items-center gap-2 text-amber-ink">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="text-sm font-semibold">Out of stock ({outOfStock.length})</span>
            <span className="truncate text-xs text-amber-ink/80">
              {outOfStock.slice(0, 6).map((o) => o.label).join(' · ')}
              {outOfStock.length > 6 ? ` +${outOfStock.length - 6} more` : ''}
            </span>
          </div>
        </div>
      )}

      <ClinicCalendar variant="preview" initialAppointments={appointments} />

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line-soft px-4 py-2.5">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-cobalt" />
            <h3 className="text-sm font-semibold">Seen yesterday</h3>
          </div>
          <span className="text-[11px] text-muted-foreground">{rounds.length}</span>
        </div>
        {rounds.length === 0 ? (
          <p className="px-4 py-4 text-xs text-muted-foreground">No patients seen yesterday.</p>
        ) : (
          <ul className="max-h-56 divide-y divide-line-soft overflow-y-auto">
            {rounds.map((r) => (
              <li key={r.visit_id}>
                <Link href={`/dashboard/visits/${r.visit_id}`} className="block px-4 py-2 text-[13px] hover:bg-secondary/40">
                  <span className="font-medium">{r.patient_name || 'Unknown patient'}</span>
                  <span className="block truncate text-xs text-muted-foreground">{r.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
