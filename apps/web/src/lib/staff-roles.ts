import type { StaffRole } from '@karibu/shared'

/** All values allowed by staff_role_check (migration 024). */
export const STAFF_ROLES: StaffRole[] = [
  'admin',
  'doctor',
  'nurse',
  'clinical_officer',
  'midwife',
  'nursing_assistant',
  'records_officer',
  'lab_tech',
  'dispenser',
]

/** MoH-familiar labels shown in admin / provisioning UI. */
export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  admin: 'Clinic admin (in-charge)',
  doctor: 'Doctor (legacy)',
  nurse: 'Registered Nurse',
  clinical_officer: 'Medical Clinical Officer',
  midwife: 'Enrolled Midwife',
  nursing_assistant: 'Enrolled Nurse',
  records_officer: 'Records Officer',
  lab_tech: 'Lab Technician',
  dispenser: 'Dispenser / Pharmacy',
}

export function staffRoleLabel(role: string): string {
  return STAFF_ROLE_LABELS[role as StaffRole] ?? role.replace(/_/g, ' ')
}

export function isStaffRole(value: string): value is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(value)
}

export function assertStaffRole(value: string): StaffRole {
  if (!(STAFF_ROLES as readonly string[]).includes(value)) {
    throw new Error('Invalid staff role')
  }
  return value as StaffRole
}
