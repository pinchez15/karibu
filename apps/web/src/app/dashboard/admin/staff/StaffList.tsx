'use client'

import { useState } from 'react'
import { updateStaffRole, toggleStaffActive } from './actions'
import { STAFF_ROLES, STAFF_ROLE_LABELS } from '@/lib/staff-roles'
import type { Staff, StaffRole } from '@karibu/shared'

interface StaffListProps {
  initialStaff: Staff[]
}

const roleStyles: Record<string, { color: string; bg: string }> = {
  admin: { color: 'text-primary', bg: 'bg-primary/10' },
  doctor: { color: 'text-primary', bg: 'bg-primary/10' },
  nurse: { color: 'text-accent', bg: 'bg-accent/10' },
  clinical_officer: { color: 'text-cobalt', bg: 'bg-cobalt-soft' },
  midwife: { color: 'text-slate', bg: 'bg-slate-soft' },
  nursing_assistant: { color: 'text-accent', bg: 'bg-accent/10' },
  records_officer: { color: 'text-muted-foreground', bg: 'bg-muted' },
  lab_tech: { color: 'text-amber-ink', bg: 'bg-amber-soft' },
  dispenser: { color: 'text-green', bg: 'bg-green-soft' },
}

const FALLBACK_STYLE = { color: 'text-muted-foreground', bg: 'bg-muted' }

export function StaffList({ initialStaff }: StaffListProps) {
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
            : s,
        ),
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

  const handleRoleChange = async (staffMember: Staff, newRole: StaffRole) => {
    setLoading(staffMember.id)
    setMessage(null)

    const result = await updateStaffRole(staffMember.id, newRole)

    if (result.success) {
      setStaffList((prev) =>
        prev.map((s) => (s.id === staffMember.id ? { ...s, role: newRole } : s)),
      )
      setMessage({
        type: 'success',
        text: `${staffMember.display_name}'s role updated to ${STAFF_ROLE_LABELS[newRole]}`,
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
          className={`rounded-xl border p-4 ${
            message.type === 'success'
              ? 'border-accent/30 bg-accent/10 text-accent'
              : 'border-destructive/30 bg-destructive/10 text-destructive'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-6 py-4">
          <h3 className="text-lg font-semibold">Active staff ({activeStaff.length})</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Joined
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {activeStaff.map((member) => {
              const style = roleStyles[member.role] ?? FALLBACK_STYLE
              return (
                <tr key={member.id} className="hover:bg-muted/50">
                  <td className="px-6 py-4 font-medium">{member.display_name}</td>
                  <td className="px-6 py-4 text-muted-foreground">{member.email}</td>
                  <td className="px-6 py-4">
                    <select
                      value={member.role}
                      onChange={(e) => handleRoleChange(member, e.target.value as StaffRole)}
                      disabled={loading === member.id}
                      className={`cursor-pointer rounded-lg border border-input bg-background px-3 py-2 text-sm font-medium ${style.bg} ${style.color}`}
                    >
                      {STAFF_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {STAFF_ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {new Date(member.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(member)}
                      disabled={loading === member.id}
                      className="text-sm text-destructive hover:opacity-80 disabled:opacity-50"
                    >
                      {loading === member.id ? 'Updating…' : 'Deactivate'}
                    </button>
                  </td>
                </tr>
              )
            })}
            {activeStaff.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-muted-foreground">
                  No active staff members yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {inactiveStaff.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-6 py-4">
            <h3 className="text-lg font-semibold">Inactive staff ({inactiveStaff.length})</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Deactivated
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {inactiveStaff.map((member) => {
                const style = roleStyles[member.role] ?? FALLBACK_STYLE
                return (
                  <tr key={member.id} className="opacity-70 hover:bg-muted/50">
                    <td className="px-6 py-4 font-medium">{member.display_name}</td>
                    <td className="px-6 py-4 text-muted-foreground">{member.email}</td>
                    <td className="px-6 py-4">
                      <span className={`rounded-lg px-3 py-1 text-sm font-medium ${style.bg} ${style.color}`}>
                        {STAFF_ROLE_LABELS[member.role] ?? member.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {member.deactivated_at
                        ? new Date(member.deactivated_at).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(member)}
                        disabled={loading === member.id}
                        className="text-sm text-accent hover:opacity-80 disabled:opacity-50"
                      >
                        {loading === member.id ? 'Updating…' : 'Reactivate'}
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
