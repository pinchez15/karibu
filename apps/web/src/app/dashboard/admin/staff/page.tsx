import { getStaff, isAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { StaffList } from './StaffList'
import type { Staff } from '@karibu/shared'

async function getStaffList(clinicId: string): Promise<Staff[]> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('staff')
    .select('*')
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Failed to fetch staff:', error)
    return []
  }

  return data as Staff[]
}

export default async function StaffManagementPage() {
  const staff = await getStaff()

  if (!staff) {
    redirect('/')
  }

  const admin = await isAdmin()
  if (!admin) {
    redirect('/dashboard')
  }

  const staffList = await getStaffList(staff.clinic_id)

  return (
    <div className="p-4">
      <div className="mb-6">
        <Link
          href="/dashboard/admin"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Admin
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Staff Management</h2>
          <p className="text-muted-foreground mt-1">
            {staffList.filter((s) => s.is_active).length} active staff members
          </p>
        </div>
      </div>

      <div className="bg-card rounded-xl p-6 border border-border mb-6">
        <h3 className="text-lg font-semibold mb-4">Invite Staff</h3>
        <p className="text-muted-foreground mb-4">
          Staff provisioning now happens from the internal provisioning workspace.
          Use that page to create clinics, send invitations, and keep Clerk + Supabase aligned.
        </p>
        <Link
          href="/dashboard/superadmin"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors"
        >
          Open Provisioning Workspace
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </Link>
      </div>

      <StaffList initialStaff={staffList} clinicId={staff.clinic_id} />
    </div>
  )
}
