import type { GuardianRelationship } from '@karibu/shared'

export const GUARDIAN_RELATIONSHIP_OPTIONS: readonly GuardianRelationship[] = [
  'mother',
  'father',
  'husband',
  'wife',
  'relative',
  'neighbor',
] as const

export const GUARDIAN_RELATIONSHIP_LABELS: Record<GuardianRelationship, string> = {
  mother: 'Mother',
  father: 'Father',
  husband: 'Husband',
  wife: 'Wife',
  relative: 'Relative',
  neighbor: 'Neighbor',
}

export function guardianRelationshipLabel(
  value: string | null | undefined,
): string | null {
  if (!value) return null
  return GUARDIAN_RELATIONSHIP_LABELS[value as GuardianRelationship] ?? value
}

export function isGuardianRelationship(value: string): value is GuardianRelationship {
  return (GUARDIAN_RELATIONSHIP_OPTIONS as readonly string[]).includes(value)
}
