'use client'

import { usePathname } from 'next/navigation'
import { WebShell, type WebShellRole } from '@/components/web-shell'

interface DashboardShellProps {
  staff: { displayName: string; role: string; initials: string }
  /** Raw staff role from the staff table — drives admin-gated nav items. */
  staffRole?: string
  clinicName?: string
  children: React.ReactNode
}

/**
 * Client-side wrapper that picks the WebShell role based on the current path.
 *
 *  /dashboard/pharmacy/*       → pharmacy sidebar
 *  /dashboard/lab/*            → lab sidebar
 *  /dashboard/admin/reports/*  → analyst sidebar
 *  everything else under /dashboard → clinician sidebar
 *
 * Putting the path detection in a client component lets the server layout
 * (which fetches staff + clinic data) stay simple and async.
 */
export function DashboardShell({ staff, staffRole, clinicName, children }: DashboardShellProps) {
  const pathname = usePathname() || ''
  const role = roleForPath(pathname)
  return (
    <WebShell role={role} clinicName={clinicName} staff={staff} staffRole={staffRole}>
      {children}
    </WebShell>
  )
}

function roleForPath(pathname: string): WebShellRole {
  if (pathname.startsWith('/dashboard/pharmacy')) return 'pharmacy'
  if (pathname.startsWith('/dashboard/lab')) return 'lab'
  if (pathname.startsWith('/dashboard/admin/reports')) return 'analyst'
  return 'clinician'
}
