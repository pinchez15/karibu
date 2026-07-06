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

/**
 * Roles that share the OPD / Inpatient / ANC / HIV-TB clinical desks.
 * Single source of truth — imported by web-shell.tsx and auth.ts.
 */
export const CLINICAL_ROLES: StaffRole[] = [
  'doctor',
  'nurse',
  'clinical_officer',
  'midwife',
  'nursing_assistant',
  'records_officer',
]

/**
 * Roles that can access the Data unit (clinic register, HMIS 105, HMIS 106a,
 * quality reports). Admin retains access via canAccessDataReports().
 * Single source of truth — imported by web-shell.tsx and auth.ts.
 */
export const DATA_REPORT_ROLES: StaffRole[] = [
  'doctor',
  'nurse',
  'clinical_officer',
  'records_officer',
]

/**
 * Roles that can record patient payments at the front desk.
 * Single source of truth — imported by web-shell.tsx.
 */
export const BILLING_ROLES: StaffRole[] = [
  ...CLINICAL_ROLES,
  'lab_tech',
  'dispenser',
]

/**
 * Every clinic staff role — the calendar homepage is shared across the team.
 * Single source of truth — imported by web-shell.tsx.
 */
export const ALL_STAFF_ROLES: StaffRole[] = [
  'admin',
  ...CLINICAL_ROLES,
  'lab_tech',
  'dispenser',
]

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
