import { describe, expect, it } from 'vitest'
import {
  GUARDIAN_RELATIONSHIP_OPTIONS,
  guardianRelationshipLabel,
  isGuardianRelationship,
} from './patient-demographics'

describe('patient-demographics', () => {
  it('recognizes valid guardian relationships', () => {
    for (const opt of GUARDIAN_RELATIONSHIP_OPTIONS) {
      expect(isGuardianRelationship(opt)).toBe(true)
    }
    expect(isGuardianRelationship('cousin')).toBe(false)
  })

  it('labels guardian relationships for display', () => {
    expect(guardianRelationshipLabel('mother')).toBe('Mother')
    expect(guardianRelationshipLabel(null)).toBeNull()
  })
})
