'use client'

import { useState } from 'react'
import { updateStaffRole, toggleStaffActive } from './actions'
import type { Staff } from '@karibu/shared'

interface StaffListProps {
  initialStaff: Staff[]
  clinicId: string
}

// Mirrors StaffRole in packages/shared/src/types.ts
const roleConfig: Record<string, { label: string; color: string; bg: string }> = {
  admin: { label: 'Admin', color: 'text-primary', bg: 'bg-primary/10' },
  doctor: { label: 'Doctor', color: 'text-primary', bg: 'bg-primary/10' },
  nurse: { label: 'Nurse', color: 'text-accent', bg: 'bg-accent/10' },
  clinical_officer: { label: 'Clinical officer', color: 'text-cobalt', bg: 'bg-cobalt-soft' },
  midwife: { label: 'Midwife', color: 'text-slate', bg: 'bg-slate-soft' },
  nursing_assistant: { label: 'Nursing assistant', color: 'text-accent', bg: 'bg-accent/10' },
  records_officer: { label: 'Records officer', color: 'text-muted-foreground', bg: 'bg-muted' },
  lab_tech: { label: 'Lab technician', color: 'text-amber-ink', bg: 'bg-amber-soft' },
  dispenser: { label: 'Dispenser', color: 'text-green', bg: 'bg-green-soft' },
}

const FALLBACK_ROLE_CONFIG = { label: '—', color: 'text-muted-foreground', bg: 'bg-muted' }

export function StaffList({ initialStaff, clinicId }: StaffListProps) {
  const [staffList, setStaffList] = useState(initialStaff)
  const [loading, setLoading] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleToggleActive = async (staffMember: Staff) => {
    setLoading(staffMember.id)
    setMessage(null)

    const newStatus = !staffMember.is_active
    const result = await toggleStaffActive(staffMember.id, newStatus)

    if (result.success) {
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
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to update staff member' })
    }

    setLoading(null)
  }

  const handleRoleChange = async (staffMember: Staff, newRole: 'admin' | 'doctor' | 'nurse') => {
    setLoading(staffMember.id)
    setMessage(null)

    const result = await updateStaffRole(staffMember.id, newRole)

    if (result.success) {
      setStaffList((prev) =>
        prev.map((s) => (s.id === staffMember.id ? { ...s, role: newRole } : s))
      )
      setMessage({
        type: 'success',
        text: `${staffMember.display_name}'s role updated to ${newRole}`,
      })
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to update role' })
    }

    setLoading(null)
  }

  const activeStaff = staffList.filter((s) => s.is_active)
  const inactiveStaff = staffList.filter((s) => !s.is_active)

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`p-4 rounded-xl border ${
            message.type === 'success' ? 'bg-accent/10 text-accent border-accent/30' : 'bg-destructive/10 text-destructive border-destructive/30'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Active Staff */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="font-semibold">Active Staff ({activeStaff.length})</h3>
        </div>
        <table className="w-full">
          <thead className="bg-muted">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Joined
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {activeStaff.map((member) => {
              const config = roleConfig[member.role] ?? FALLBACK_ROLE_CONFIG
              return (
                <tr key={member.id} className="hover:bg-muted">
                  <td className="px-6 py-4">
                    <p className="font-medium">{member.display_name}</p>
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{member.email}</td>
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
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {new Date(member.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleToggleActive(member)}
                      disabled={loading === member.id}
                      className="text-sm text-destructive hover:opacity-80 disabled:opacity-50"
                    >
                      {loading === member.id ? 'Updating...' : 'Deactivate'}
                    </button>
                  </td>
                </tr>
              )
            })}
            {activeStaff.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                  No active staff members
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Inactive Staff */}
      {inactiveStaff.length > 0 && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="font-semibold">Inactive Staff ({inactiveStaff.length})</h3>
          </div>
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Deactivated
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {inactiveStaff.map((member) => {
                const config = roleConfig[member.role] ?? FALLBACK_ROLE_CONFIG
                return (
                  <tr key={member.id} className="hover:bg-muted opacity-60">
                    <td className="px-6 py-4">
                      <p className="font-medium">{member.display_name}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{member.email}</td>
                    <td className="px-6 py-4">
                      <span className={`text-sm font-medium rounded-lg px-3 py-1 ${config.bg} ${config.color}`}>
                        {config.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {member.deactivated_at
                        ? new Date(member.deactivated_at).toLocaleDateString()
                        : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleToggleActive(member)}
                        disabled={loading === member.id}
                        className="text-sm text-accent hover:opacity-80 disabled:opacity-50"
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
