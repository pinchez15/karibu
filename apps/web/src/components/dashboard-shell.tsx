'use client'

import { WebShell } from '@/components/web-shell'

interface DashboardShellProps {
  staff: { displayName: string; role: string; initials: string }
  /** Raw staff role from the staff table — drives unit visibility + admin gating. */
  staffRole?: string
  clinicName?: string
  children: React.ReactNode
}

/**
 * Thin wrapper around WebShell. The shell now derives the active unit (OPD,
 * Lab, Pharmacy, …) from the path itself, so this just forwards staff/clinic.
 */
export function DashboardShell({ staff, staffRole, clinicName, children }: DashboardShellProps) {
  return (
    <WebShell clinicName={clinicName} staff={staff} staffRole={staffRole}>
      {children}
    </WebShell>
  )
}
