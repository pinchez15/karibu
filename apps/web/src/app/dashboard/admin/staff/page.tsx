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
    <div>
      <div className="mb-6">
        <Link
          href="/dashboard/admin"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
        >
          <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Admin
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Staff Management</h2>
          <p className="text-gray-600 mt-1">
            {staffList.filter((s) => s.is_active).length} active staff members
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Invite Staff</h3>
        <p className="text-gray-600 mb-4">
          Staff members join your clinic by being invited to your Clerk Organization.
          When they accept the invitation, their account is automatically created here.
        </p>
        <a
          href="https://dashboard.clerk.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700"
        >
          Open Clerk Dashboard
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>

      <StaffList initialStaff={staffList} clinicId={staff.clinic_id} />
    </div>
  )
}
