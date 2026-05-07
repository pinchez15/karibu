import { redirect } from 'next/navigation'
import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { DashboardShell } from '@/components/dashboard-shell'

/**
 * Dashboard layout — wraps every /dashboard/* page in the role-aware web shell.
 * The DashboardShell client component picks which sidebar to render based on
 * pathname:
 *   /dashboard/pharmacy/*       → pharmacy
 *   /dashboard/lab/*            → lab
 *   /dashboard/admin/reports/*  → analyst
 *   everything else             → clinician
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const staff = await getStaff()
  if (!staff) redirect('/')

  const supabase = createServiceClient()
  const { data: clinic } = await supabase
    .from('clinics')
    .select('name')
    .eq('id', staff.clinic_id)
    .single()

  const initials = staff.display_name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <DashboardShell
      clinicName={clinic?.name}
      staff={{
        displayName: staff.display_name,
        role: roleLabel(staff.role),
        initials,
      }}
    >
      {children}
    </DashboardShell>
  )
}

function roleLabel(role: string): string {
  switch (role) {
    case 'admin': return 'Admin'
    case 'doctor': return 'Doctor'
    case 'nurse': return 'Nurse'
    case 'clinical_officer': return 'Clinical officer'
    case 'midwife': return 'Midwife'
    case 'nursing_assistant': return 'Nursing assistant'
    case 'records_officer': return 'Records officer'
    case 'lab_tech': return 'Lab technician'
    case 'dispenser': return 'Dispenser'
    default: return role
  }
}
