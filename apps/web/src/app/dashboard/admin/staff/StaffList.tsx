'use client'

import { useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { Staff } from '@karibu/shared'

interface StaffListProps {
  initialStaff: Staff[]
  clinicId: string
}

const roleConfig = {
  admin: { label: 'Admin', color: 'text-purple-700', bg: 'bg-purple-100' },
  doctor: { label: 'Doctor', color: 'text-blue-700', bg: 'bg-blue-100' },
  nurse: { label: 'Nurse', color: 'text-green-700', bg: 'bg-green-100' },
}

export function StaffList({ initialStaff, clinicId }: StaffListProps) {
  const [staffList, setStaffList] = useState(initialStaff)
  const [loading, setLoading] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const supabase = getSupabase()

  const handleToggleActive = async (staffMember: Staff) => {
    setLoading(staffMember.id)
    setMessage(null)

    try {
      const newStatus = !staffMember.is_active
      const { error } = await supabase
        .from('staff')
        .update({
          is_active: newStatus,
          deactivated_at: newStatus ? null : new Date().toISOString(),
        })
        .eq('id', staffMember.id)

      if (error) throw error

      setStaffList((prev) =>
        prev.map((s) =>
          s.id === staffMember.id
            ? { ...s, is_active: newStatus, deactivated_at: newStatus ? null : new Date().toISOString() }
            : s
        )
      )

      setMessage({
        type: 'success',
        text: `${staffMember.display_name} has been ${newStatus ? 'activated' : 'deactivated'}`,
      })
    } catch (error) {
      console.error('Failed to update staff:', error)
      setMessage({ type: 'error', text: 'Failed to update staff member' })
    } finally {
      setLoading(null)
    }
  }

  const handleRoleChange = async (staffMember: Staff, newRole: 'admin' | 'doctor' | 'nurse') => {
    setLoading(staffMember.id)
    setMessage(null)

    try {
      const { error } = await supabase
        .from('staff')
        .update({ role: newRole })
        .eq('id', staffMember.id)

      if (error) throw error

      setStaffList((prev) =>
        prev.map((s) => (s.id === staffMember.id ? { ...s, role: newRole } : s))
      )

      setMessage({
        type: 'success',
        text: `${staffMember.display_name}'s role updated to ${newRole}`,
      })
    } catch (error) {
      console.error('Failed to update role:', error)
      setMessage({ type: 'error', text: 'Failed to update role' })
    } finally {
      setLoading(null)
    }
  }

  const activeStaff = staffList.filter((s) => s.is_active)
  const inactiveStaff = staffList.filter((s) => !s.is_active)

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Active Staff */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Active Staff ({activeStaff.length})</h3>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Joined
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {activeStaff.map((member) => {
              const config = roleConfig[member.role]
              return (
                <tr key={member.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <p className="font-medium text-gray-900">{member.display_name}</p>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{member.email}</td>
                  <td className="px-6 py-4">
                    <select
                      value={member.role}
                      onChange={(e) => handleRoleChange(member, e.target.value as any)}
                      disabled={loading === member.id}
                      className={`text-sm font-medium rounded-lg px-3 py-1 border-0 ${config.bg} ${config.color} cursor-pointer`}
                    >
                      <option value="doctor">Doctor</option>
                      <option value="nurse">Nurse</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {new Date(member.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleToggleActive(member)}
                      disabled={loading === member.id}
                      className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
                    >
                      {loading === member.id ? 'Updating...' : 'Deactivate'}
                    </button>
                  </td>
                </tr>
              )
            })}
            {activeStaff.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  No active staff members
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Inactive Staff */}
      {inactiveStaff.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Inactive Staff ({inactiveStaff.length})</h3>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Deactivated
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {inactiveStaff.map((member) => {
                const config = roleConfig[member.role]
                return (
                  <tr key={member.id} className="hover:bg-gray-50 opacity-60">
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900">{member.display_name}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{member.email}</td>
                    <td className="px-6 py-4">
                      <span className={`text-sm font-medium rounded-lg px-3 py-1 ${config.bg} ${config.color}`}>
                        {config.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {member.deactivated_at
                        ? new Date(member.deactivated_at).toLocaleDateString()
                        : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleToggleActive(member)}
                        disabled={loading === member.id}
                        className="text-sm text-green-600 hover:text-green-800 disabled:opacity-50"
                      >
                        {loading === member.id ? 'Updating...' : 'Reactivate'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
