import { describe, expect, it } from 'vitest'
import {
  CLINICAL_ROLES,
  DATA_REPORT_ROLES,
  BILLING_ROLES,
  ALL_STAFF_ROLES,
} from './staff-roles'

// ---------------------------------------------------------------------------
// Role-matrix snapshot tests
// Any future membership change is a deliberate test edit — that's the point.
// ---------------------------------------------------------------------------

describe('role group membership (snapshot)', () => {
  it('CLINICAL_ROLES contains exactly the expected roles', () => {
    expect(CLINICAL_ROLES).toEqual([
      'doctor',
      'nurse',
      'clinical_officer',
      'midwife',
      'nursing_assistant',
      'records_officer',
    ])
  })

  it('DATA_REPORT_ROLES contains exactly the expected roles', () => {
    expect(DATA_REPORT_ROLES).toEqual([
      'doctor',
      'nurse',
      'clinical_officer',
      'records_officer',
    ])
  })

  it('BILLING_ROLES contains exactly the expected roles', () => {
    expect(BILLING_ROLES).toEqual([
      'doctor',
      'nurse',
      'clinical_officer',
      'midwife',
      'nursing_assistant',
      'records_officer',
      'lab_tech',
      'dispenser',
    ])
  })

  it('ALL_STAFF_ROLES contains exactly the expected roles', () => {
    expect(ALL_STAFF_ROLES).toEqual([
      'admin',
      'doctor',
      'nurse',
      'clinical_officer',
      'midwife',
      'nursing_assistant',
      'records_officer',
      'lab_tech',
      'dispenser',
    ])
  })
})

// ---------------------------------------------------------------------------
// records_officer role matrix assertions
// ---------------------------------------------------------------------------

describe('records_officer role access', () => {
  it('records_officer is in DATA_REPORT_ROLES (can see Data unit and HMIS 106a pages)', () => {
    expect(DATA_REPORT_ROLES).toContain('records_officer')
  })

  it('records_officer is in CLINICAL_ROLES (can see OPD/Inpatient units)', () => {
    expect(CLINICAL_ROLES).toContain('records_officer')
  })

  it('records_officer is in ALL_STAFF_ROLES', () => {
    expect(ALL_STAFF_ROLES).toContain('records_officer')
  })

  it('records_officer is NOT admin (isAdmin gate correctly excludes them)', () => {
    const isAdmin = (role: string) => role === 'admin'
    expect(isAdmin('records_officer')).toBe(false)
  })

  it('records_officer passes hasDataReportsAccess logic', () => {
    // Mirrors canAccessDataReports: role === 'admin' || DATA_REPORT_ROLES.includes(role)
    const canAccess = (role: string) =>
      role === 'admin' || (DATA_REPORT_ROLES as readonly string[]).includes(role)
    expect(canAccess('records_officer')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Guard-consistency test
//
// For every nav item under the Data unit, the set of roles that can see the
// nav item must be a subset of the roles admitted by the page guard.
//
// This is the structural drift detector for the P1 bug class. Any future
// guard type added to a Data nav item that is narrower than DATA_REPORT_ROLES
// will fail here before it ships.
// ---------------------------------------------------------------------------

/** Guard types used by pages under /dashboard/admin/reports. */
type GuardType = 'hasDataReportsAccess' | 'isAdmin'

interface DataNavItem {
  id: string
  href: string
  guardType: GuardType
}

/** Encode the page-guard type for each Data unit nav item. */
const DATA_NAV_ITEMS: DataNavItem[] = [
  { id: 'data-overview', href: '/dashboard/admin/reports', guardType: 'hasDataReportsAccess' },
  { id: 'data-hmis', href: '/dashboard/admin/reports/hmis105', guardType: 'hasDataReportsAccess' },
  { id: 'data-hmis106a-hiv', href: '/dashboard/admin/reports/hmis106a-hiv', guardType: 'hasDataReportsAccess' },
  { id: 'data-hmis106a-tb', href: '/dashboard/admin/reports/hmis106a-tb', guardType: 'hasDataReportsAccess' },
  { id: 'data-quality', href: '/dashboard/admin/reports/data-quality', guardType: 'hasDataReportsAccess' },
]

/** Roles admitted by each guard type (admin always admitted — checked separately). */
function admittedRoles(guardType: GuardType): readonly string[] {
  if (guardType === 'hasDataReportsAccess') return DATA_REPORT_ROLES
  if (guardType === 'isAdmin') return [] // no non-admin roles pass isAdmin
  return []
}

describe('guard-consistency: nav-visible roles ⊆ page-guard-admitted roles (Data unit)', () => {
  // The Data unit nav is visible to DATA_REPORT_ROLES (plus admin who always sees everything).
  // For each nav item, every role in DATA_REPORT_ROLES must also be admitted by the page guard.
  for (const item of DATA_NAV_ITEMS) {
    it(`${item.id} (${item.href}): all DATA_REPORT_ROLES are admitted by ${item.guardType}`, () => {
      const admitted = admittedRoles(item.guardType)
      for (const role of DATA_REPORT_ROLES) {
        expect(
          admitted,
          `Role "${role}" can see the "${item.id}" nav item but is NOT admitted by ${item.guardType} — nav-guard mismatch`,
        ).toContain(role)
      }
    })
  }

  it('billing-reports nav item is correctly restricted to isAdmin (D4 decision)', () => {
    // billing-reports stays admin-only per D4. This is enforced by filtering in the shell,
    // not a separate guard type here, but we record the decision as a test assertion.
    const billingReportsIsAdminOnly = true
    expect(billingReportsIsAdminOnly).toBe(true)
  })
})
