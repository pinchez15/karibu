import { getStaff, hasProvisioningAccess, isAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { STAFF_ROLES, STAFF_ROLE_LABELS } from '@/lib/staff-roles'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { WebTopBar } from '@/components/web-shell'
import { inviteClinicStaffAction } from './actions'
import { PendingInvitesList } from './PendingInvitesList'
import { StaffList } from './StaffList'
import type { Staff } from '@karibu/shared'

async function getStaffList(clinicId: string): Promise<Staff[]> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('staff')
    .select('*')
    .eq('clinic_id', clinicId)
    .order('display_name')

  if (error) {
    console.error('Failed to fetch staff:', error)
    return []
  }

  return data as Staff[]
}

async function getPendingInvites(clinicId: string) {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('staff_invitations')
    .select('id, email, display_name, role, created_at')
    .eq('clinic_id', clinicId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  return data ?? []
}

export default async function StaffManagementPage() {
  const staff = await getStaff()

  if (!staff) {
    redirect('/')
  }

  if (!(await isAdmin())) {
    redirect('/dashboard')
  }

  const [staffList, pendingInvites, provisioningAccess] = await Promise.all([
    getStaffList(staff.clinic_id),
    getPendingInvites(staff.clinic_id),
    hasProvisioningAccess(),
  ])

  const activeCount = staffList.filter((s) => s.is_active).length

  return (
    <>
      <WebTopBar
        title="Staff"
        subtitle="CLINIC SETTINGS"
        actions={
          <Link
            href="/dashboard/admin"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Admin
          </Link>
        }
      />

      <div className="mx-auto max-w-5xl flex-1 space-y-8 overflow-auto px-6 py-8">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Staff management</h2>
          <p className="mt-1 text-base text-muted-foreground">
            {activeCount} active staff · invite one person at a time and set their clinical role.
          </p>
        </div>

        <section className="rounded-2xl border border-border bg-card p-6">
          <h3 className="text-lg font-semibold">Invite staff member</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            They will receive an email to join this clinic. Their role controls what they can see and do in Karibu.
          </p>
          <form action={inviteClinicStaffAction} className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">
              First name
              <input
                name="first_name"
                className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base"
              />
            </label>
            <label className="text-sm font-medium">
              Last name
              <input
                name="last_name"
                className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base"
              />
            </label>
            <label className="text-sm font-medium sm:col-span-2">
              Email
              <input
                name="email"
                type="email"
                required
                className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base"
              />
            </label>
            <label className="text-sm font-medium sm:col-span-2">
              Clinical role
              <select
                name="role"
                defaultValue="clinical_officer"
                className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base"
              >
                {STAFF_ROLES.filter((role) => role !== 'doctor').map((role) => (
                  <option key={role} value={role}>
                    {STAFF_ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </label>
            <div className="sm:col-span-2">
              <button
                type="submit"
                className="rounded-lg bg-primary px-5 py-2.5 text-base font-medium text-primary-foreground hover:bg-primary/90"
              >
                Send invitation
              </button>
            </div>
          </form>
        </section>

        {pendingInvites.length > 0 && <PendingInvitesList invites={pendingInvites} />}

        <StaffList initialStaff={staffList} />

        {provisioningAccess && (
          <p className="text-sm text-muted-foreground">
            Need to register a <strong>new clinic site</strong>?{' '}
            <Link href="/dashboard/superadmin" className="text-primary hover:underline">
              Open new clinic setup
            </Link>
            {' '}(Karibu operations only).
          </p>
        )}
      </div>
    </>
  )
}
