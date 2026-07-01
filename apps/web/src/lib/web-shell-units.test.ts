import { describe, expect, it } from 'vitest'
import { activeWebShellUnitId } from './web-shell-units'

describe('activeWebShellUnitId', () => {
  it('treats bare /dashboard as home', () => {
    expect(activeWebShellUnitId('/dashboard')).toBe('home')
  })

  it('does not treat OPD paths as home', () => {
    expect(activeWebShellUnitId('/dashboard/opd')).toBe('opd')
    expect(activeWebShellUnitId('/dashboard/visits')).toBe('opd')
    expect(activeWebShellUnitId('/dashboard/worklists')).toBe('opd')
    expect(activeWebShellUnitId('/dashboard/visits/abc-123')).toBe('opd')
    expect(activeWebShellUnitId('/dashboard/patients/abc-123')).toBe('opd')
  })

  it('resolves inpatient and nested routes', () => {
    expect(activeWebShellUnitId('/dashboard/inpatient')).toBe('inpatient')
    expect(activeWebShellUnitId('/dashboard/inpatient/admit')).toBe('inpatient')
    expect(activeWebShellUnitId('/dashboard/inpatient/handover')).toBe('inpatient')
    expect(activeWebShellUnitId('/dashboard/inpatient/abc-123')).toBe('inpatient')
  })

  it('resolves data reports under admin', () => {
    expect(activeWebShellUnitId('/dashboard/admin/reports/hmis105')).toBe('data')
  })
})
