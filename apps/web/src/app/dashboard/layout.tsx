import { redirect } from 'next/navigation'
import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { DashboardShellGate } from '@/components/dashboard-shell-gate'
import { OnboardingGuard } from '@/components/onboarding-guard'
import { staffRoleLabel } from '@/lib/staff-roles'

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
    <OnboardingGuard onboardingComplete={Boolean(staff.onboarding_completed_at)}>
      <DashboardShellGate
        clinicName={clinic?.name}
        staffRole={staff.role}
        staff={{
          displayName: staff.display_name,
          role: staffRoleLabel(staff.role),
          initials,
        }}
      >
        {children}
      </DashboardShellGate>
    </OnboardingGuard>
  )
}
