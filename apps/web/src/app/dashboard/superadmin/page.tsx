import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase'
import { hasProvisioningAccess, isSuperadmin } from '@/lib/auth'
import { createClinicAction, inviteStaffAction, updateClinicAction, updateProvisionedStaffAction } from './actions'

const DEPARTMENTS = [
  { value: 'opd', label: 'OPD' },
  { value: 'anc', label: 'ANC' },
  { value: 'maternity', label: 'Maternity' },
  { value: 'family_planning', label: 'Family Planning' },
  { value: 'immunization', label: 'Immunization' },
] as const

const STAFF_ROLES = [
  'admin',
  'doctor',
  'nurse',
  'clinical_officer',
  'midwife',
  'nursing_assistant',
  'records_officer',
  'lab_tech',
  'dispenser',
] as const

type ClinicRow = {
  id: string
  name: string
  slug: string
  timezone: string
  is_active: boolean
  clerk_organization_id: string | null
  phone: string | null
  umdpc_number: string | null
  diocese: string | null
  district: string | null
  subcounty: string | null
  parish: string | null
  village: string | null
  level: string | null
}

type ClinicDepartmentRow = {
  clinic_id: string
  department: string
}

type StaffRow = {
  id: string
  clinic_id: string
  email: string
  display_name: string
  role: string
  is_active: boolean
  clerk_user_id: string
}

type InvitationRow = {
  id: string
  clinic_id: string
  email: string
  display_name: string
  role: string
  status: string
  created_at: string
}

async function getProvisioningData() {
  const supabase = createServiceClient()

  const [{ data: clinics }, { data: departments }, { data: staff }, { data: invitations }] = await Promise.all([
    supabase
      .from('clinics')
      .select('id, name, slug, timezone, is_active, clerk_organization_id, phone, umdpc_number, diocese, district, subcounty, parish, village, level')
      .order('name'),
    supabase
      .from('clinic_departments')
      .select('clinic_id, department')
      .order('department'),
    supabase
      .from('staff')
      .select('id, clinic_id, email, display_name, role, is_active, clerk_user_id')
      .order('display_name'),
    supabase
      .from('staff_invitations')
      .select('id, clinic_id, email, display_name, role, status, created_at')
      .order('created_at', { ascending: false }),
  ])

  return {
    clinics: (clinics ?? []) as ClinicRow[],
    departments: (departments ?? []) as ClinicDepartmentRow[],
    staff: (staff ?? []) as StaffRow[],
    invitations: (invitations ?? []) as InvitationRow[],
  }
}

function groupedDepartments(rows: ClinicDepartmentRow[]) {
  return rows.reduce<Record<string, Set<string>>>((acc, row) => {
    acc[row.clinic_id] ??= new Set()
    acc[row.clinic_id].add(row.department)
    return acc
  }, {})
}

function groupedStaff(rows: StaffRow[]) {
  return rows.reduce<Record<string, StaffRow[]>>((acc, row) => {
    acc[row.clinic_id] ??= []
    acc[row.clinic_id].push(row)
    return acc
  }, {})
}

function groupedInvitations(rows: InvitationRow[]) {
  return rows.reduce<Record<string, InvitationRow[]>>((acc, row) => {
    acc[row.clinic_id] ??= []
    acc[row.clinic_id].push(row)
    return acc
  }, {})
}

export default async function SuperadminProvisioningPage() {
  const allowed = await hasProvisioningAccess()
  if (!allowed) {
    redirect('/dashboard')
  }

  const superadmin = await isSuperadmin()
  const { clinics, departments, staff, invitations } = await getProvisioningData()
  const departmentsByClinic = groupedDepartments(departments)
  const staffByClinic = groupedStaff(staff)
  const invitationsByClinic = groupedInvitations(invitations)

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-semibold text-gray-900">Provisioning</h2>
          <p className="mt-2 max-w-3xl text-sm text-gray-600">
            Create clinics, assign departments, and onboard staff without opening Clerk.
            The page creates the Clerk organization/membership behind the scenes and keeps
            Supabase clinic and staff records aligned.
          </p>
        </div>
        <Link href="/dashboard" className="text-sm text-blue-600 hover:text-blue-800">
          Back to dashboard
        </Link>
      </div>

      {!superadmin && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Bootstrap mode: no active `superadmins` row was found, so clinic-admin access is temporarily allowed.
          Seed the first superadmin row after applying migration `025_superadmin_provisioning.sql`.
        </div>
      )}

      <section className="mb-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-xl font-semibold text-gray-900">Create Clinic</h3>
        <form action={createClinicAction} className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="text-sm text-gray-700">
            Name
            <input name="name" required className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
          </label>
          <label className="text-sm text-gray-700">
            Slug
            <input name="slug" required className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
          </label>
          <label className="text-sm text-gray-700">
            Timezone
            <input name="timezone" defaultValue="Africa/Kampala" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
          </label>
          <label className="text-sm text-gray-700">
            Diocese
            <input name="diocese" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
          </label>
          <label className="text-sm text-gray-700">
            District
            <input name="district" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
          </label>
          <label className="text-sm text-gray-700">
            Level
            <input name="level" placeholder="HC II / HC III / HC IV" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
          </label>
          <label className="text-sm text-gray-700">
            Subcounty
            <input name="subcounty" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
          </label>
          <label className="text-sm text-gray-700">
            Parish
            <input name="parish" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
          </label>
          <label className="text-sm text-gray-700">
            Village
            <input name="village" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
          </label>
          <label className="text-sm text-gray-700">
            Phone
            <input name="phone" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
          </label>
          <label className="text-sm text-gray-700">
            UMDPC Number
            <input name="umdpc_number" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
          </label>
          <div className="md:col-span-2 xl:col-span-3">
            <p className="text-sm font-medium text-gray-900">Departments</p>
            <div className="mt-2 flex flex-wrap gap-4">
              {DEPARTMENTS.map((department) => (
                <label key={department.value} className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" name="departments" value={department.value} defaultChecked={department.value === 'opd'} />
                  {department.label}
                </label>
              ))}
            </div>
          </div>
          <div className="md:col-span-2 xl:col-span-3">
            <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700">
              Create Clinic
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-6">
        {clinics.map((clinic) => {
          const clinicDepartments = departmentsByClinic[clinic.id] ?? new Set<string>()
          const clinicStaff = staffByClinic[clinic.id] ?? []
          const clinicInvitations = invitationsByClinic[clinic.id] ?? []

          return (
            <article key={clinic.id} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-2xl font-semibold text-gray-900">{clinic.name}</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {clinic.slug} · {clinic.level || 'No level set'} · {clinic.district || 'No district set'}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Clerk org: {clinic.clerk_organization_id || 'Unlinked'}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${clinic.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-700'}`}>
                  {clinic.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
                <div className="space-y-6">
                  <form action={updateClinicAction} className="grid gap-4 md:grid-cols-2">
                    <input type="hidden" name="clinic_id" value={clinic.id} />
                    <label className="text-sm text-gray-700">
                      Name
                      <input name="name" defaultValue={clinic.name} required className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
                    </label>
                    <label className="text-sm text-gray-700">
                      Slug
                      <input name="slug" defaultValue={clinic.slug} required className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
                    </label>
                    <label className="text-sm text-gray-700">
                      Timezone
                      <input name="timezone" defaultValue={clinic.timezone} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
                    </label>
                    <label className="text-sm text-gray-700">
                      Level
                      <input name="level" defaultValue={clinic.level || ''} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
                    </label>
                    <label className="text-sm text-gray-700">
                      Diocese
                      <input name="diocese" defaultValue={clinic.diocese || ''} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
                    </label>
                    <label className="text-sm text-gray-700">
                      District
                      <input name="district" defaultValue={clinic.district || ''} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
                    </label>
                    <label className="text-sm text-gray-700">
                      Subcounty
                      <input name="subcounty" defaultValue={clinic.subcounty || ''} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
                    </label>
                    <label className="text-sm text-gray-700">
                      Parish
                      <input name="parish" defaultValue={clinic.parish || ''} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
                    </label>
                    <label className="text-sm text-gray-700">
                      Village
                      <input name="village" defaultValue={clinic.village || ''} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
                    </label>
                    <label className="text-sm text-gray-700">
                      Phone
                      <input name="phone" defaultValue={clinic.phone || ''} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
                    </label>
                    <label className="text-sm text-gray-700">
                      UMDPC Number
                      <input name="umdpc_number" defaultValue={clinic.umdpc_number || ''} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
                    </label>
                    <label className="mt-7 inline-flex items-center gap-2 text-sm text-gray-700">
                      <input type="checkbox" name="is_active" defaultChecked={clinic.is_active} />
                      Clinic active
                    </label>
                    <div className="md:col-span-2">
                      <p className="text-sm font-medium text-gray-900">Departments</p>
                      <div className="mt-2 flex flex-wrap gap-4">
                        {DEPARTMENTS.map((department) => (
                          <label key={department.value} className="inline-flex items-center gap-2 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              name="departments"
                              value={department.value}
                              defaultChecked={clinicDepartments.has(department.value)}
                            />
                            {department.label}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <button type="submit" className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50">
                        Save Clinic
                      </button>
                    </div>
                  </form>

                  <div>
                    <h4 className="text-lg font-semibold text-gray-900">Staff</h4>
                    <div className="mt-3 overflow-x-auto rounded-xl border border-gray-200">
                      <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-600">Role</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-600">State</th>
                            <th className="px-4 py-3 text-left font-medium text-gray-600">Update</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {clinicStaff.map((member) => (
                            <tr key={member.id}>
                              <td className="px-4 py-3 font-medium text-gray-900">{member.display_name}</td>
                              <td className="px-4 py-3 text-gray-600">{member.email}</td>
                              <td className="px-4 py-3 text-gray-600">{member.role.replace(/_/g, ' ')}</td>
                              <td className="px-4 py-3 text-gray-600">{member.is_active ? 'Active' : 'Inactive'}</td>
                              <td className="px-4 py-3">
                                <form action={updateProvisionedStaffAction} className="flex flex-wrap items-center gap-2">
                                  <input type="hidden" name="staff_id" value={member.id} />
                                  <input type="hidden" name="clinic_id" value={clinic.id} />
                                  <select name="role" defaultValue={member.role} className="rounded-md border border-gray-300 px-2 py-1 text-sm">
                                    {STAFF_ROLES.map((role) => (
                                      <option key={role} value={role}>
                                        {role.replace(/_/g, ' ')}
                                      </option>
                                    ))}
                                  </select>
                                  <label className="inline-flex items-center gap-1 text-xs text-gray-700">
                                    <input type="checkbox" name="is_active" defaultChecked={member.is_active} />
                                    active
                                  </label>
                                  <button type="submit" className="rounded-md bg-gray-900 px-3 py-1 text-xs font-medium text-white hover:bg-black">
                                    Save
                                  </button>
                                </form>
                              </td>
                            </tr>
                          ))}
                          {clinicStaff.length === 0 && (
                            <tr>
                              <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-500">
                                No staff provisioned yet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <form action={inviteStaffAction} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <input type="hidden" name="clinic_id" value={clinic.id} />
                    <h4 className="text-lg font-semibold text-gray-900">Invite Staff</h4>
                    <div className="mt-4 grid gap-3">
                      <label className="text-sm text-gray-700">
                        First name
                        <input name="first_name" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
                      </label>
                      <label className="text-sm text-gray-700">
                        Last name
                        <input name="last_name" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
                      </label>
                      <label className="text-sm text-gray-700">
                        Email
                        <input name="email" type="email" required className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
                      </label>
                      <label className="text-sm text-gray-700">
                        Role
                        <select name="role" defaultValue="doctor" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2">
                          {STAFF_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {role.replace(/_/g, ' ')}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <button type="submit" className="mt-4 rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700">
                      Invite / Provision
                    </button>
                  </form>

                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <h4 className="text-lg font-semibold text-gray-900">Pending Invites</h4>
                    <div className="mt-3 space-y-3">
                      {clinicInvitations.filter((invite) => invite.status === 'pending').map((invite) => (
                        <div key={invite.id} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                          <div className="font-medium text-gray-900">{invite.display_name}</div>
                          <div className="text-sm text-gray-600">{invite.email}</div>
                          <div className="mt-1 text-xs text-gray-500">
                            {invite.role.replace(/_/g, ' ')} · invited {new Date(invite.created_at).toLocaleString()}
                          </div>
                        </div>
                      ))}
                      {clinicInvitations.filter((invite) => invite.status === 'pending').length === 0 && (
                        <p className="text-sm text-gray-500">No pending invites.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </article>
          )
        })}
      </section>
    </div>
  )
}
