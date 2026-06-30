'use client'

import { usePathname } from 'next/navigation'
import { DashboardShell } from '@/components/dashboard-shell'

/** Routes that render a bare print/receipt surface — no sidebar or unit tabs. */
const PRINT_PATH_RE = /\/(receipt|print)(\/|$)/

interface DashboardShellGateProps {
  staff: { displayName: string; role: string; initials: string }
  staffRole?: string
  clinicName?: string
  children: React.ReactNode
}

export function DashboardShellGate({
  staff,
  staffRole,
  clinicName,
  children,
}: DashboardShellGateProps) {
  const pathname = usePathname() || ''
  if (PRINT_PATH_RE.test(pathname)) {
    return <>{children}</>
  }
  return (
    <DashboardShell staff={staff} staffRole={staffRole} clinicName={clinicName}>
      {children}
    </DashboardShell>
  )
}
