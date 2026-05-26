import { z } from 'zod'

/** Mirrors Android `ClinicalNoteSections` / `NoteSection` for cross-platform notes. */
export const clinicalNoteSectionsSchema = z.object({
  chiefComplaint: z.string().default(''),
  hpi: z.string().default(''),
  physicalExam: z.string().default(''),
  familySocialHistory: z.string().default(''),
  diagnosis: z.string().default(''),
  assessmentPlan: z.string().default(''),
  medications: z.string().default(''),
  testsOrdered: z.string().default(''),
  followUpInstructions: z.string().default(''),
  followUpTasks: z.array(z.string()).default([]),
  additionalNote: z.string().default(''),
})

export type ClinicalNoteSections = z.infer<typeof clinicalNoteSectionsSchema>

export type NoteSectionKey =
  | 'ChiefComplaint'
  | 'Hpi'
  | 'PhysicalExam'
  | 'FamilySocialHistory'
  | 'Diagnosis'
  | 'AssessmentPlan'
  | 'Medications'
  | 'TestsOrdered'
  | 'FollowUpInstructions'
  | 'AdditionalNote'

export const NOTE_SECTION_META: {
  key: NoteSectionKey
  label: string
  field: keyof ClinicalNoteSections
  placeholder: string
  minLines?: number
}[] = [
  {
    key: 'ChiefComplaint',
    label: 'Chief complaint',
    field: 'chiefComplaint',
    placeholder: 'e.g. fever and cough x3 days',
    minLines: 1,
  },
  {
    key: 'Hpi',
    label: 'History of present illness',
    field: 'hpi',
    placeholder: 'Onset, duration, severity, associated symptoms…',
  },
  {
    key: 'PhysicalExam',
    label: 'Physical exam',
    field: 'physicalExam',
    placeholder: 'Vitals, general appearance, focused exam…',
  },
  {
    key: 'FamilySocialHistory',
    label: 'Family and social history',
    field: 'familySocialHistory',
    placeholder: 'Relevant family history, social context…',
  },
  {
    key: 'Diagnosis',
    label: 'Diagnosis',
    field: 'diagnosis',
    placeholder: 'Primary diagnosis or working impression…',
    minLines: 1,
  },
  {
    key: 'AssessmentPlan',
    label: 'Assessment and plan',
    field: 'assessmentPlan',
    placeholder: 'Clinical reasoning, plan, counseling…',
  },
  {
    key: 'Medications',
    label: 'Pharmacy',
    field: 'medications',
    placeholder: 'Medications (use Send to pharmacy when ready)',
  },
  {
    key: 'TestsOrdered',
    label: 'Labs',
    field: 'testsOrdered',
    placeholder: 'Labs ordered (save draft to send to lab queue)',
  },
  {
    key: 'FollowUpInstructions',
    label: 'Follow-up details',
    field: 'followUpInstructions',
    placeholder: 'Return precautions, referrals, next visit…',
  },
]

export const FOLLOW_UP_TASK_OPTIONS = [
  'Get script from pharmacy',
  'Get labs drawn',
  'Return for review',
  'Referral',
] as const

export function emptyClinicalNoteSections(): ClinicalNoteSections {
  return clinicalNoteSectionsSchema.parse({})
}

export function parseClinicalNoteSections(
  raw: unknown,
  fallbacks?: Partial<ClinicalNoteSections>,
): ClinicalNoteSections {
  const base = emptyClinicalNoteSections()
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = clinicalNoteSectionsSchema.safeParse(JSON.parse(raw))
      if (parsed.success) {
        return { ...base, ...fallbacks, ...parsed.data }
      }
    } catch {
      /* fall through */
    }
  }
  if (raw && typeof raw === 'object') {
    const parsed = clinicalNoteSectionsSchema.safeParse(raw)
    if (parsed.success) {
      return { ...base, ...fallbacks, ...parsed.data }
    }
  }
  return { ...base, ...fallbacks }
}

function followUpWithTasks(sections: ClinicalNoteSections): string {
  const tasks = sections.followUpTasks.filter(Boolean).join('; ')
  const parts = [sections.followUpInstructions.trim(), tasks].filter(Boolean)
  return parts.join('\n')
}

export function sectionsToClinicianText(sections: ClinicalNoteSections): string {
  const blocks: string[] = []
  const add = (heading: string, value: string) => {
    const t = value.trim()
    if (t) blocks.push(`${heading}: ${t}`)
  }
  add('Chief complaint', sections.chiefComplaint)
  add('History of present illness', sections.hpi)
  add('Physical exam', sections.physicalExam)
  add('Family and social history', sections.familySocialHistory)
  add('Diagnosis', sections.diagnosis)
  add('Assessment and plan', sections.assessmentPlan)
  add('Medications', sections.medications)
  add('Labs/tests', sections.testsOrdered)
  const followUp = followUpWithTasks(sections)
  if (followUp) blocks.push(`Follow-up: ${followUp}`)
  add('Additional note', sections.additionalNote)
  return blocks.join('\n\n')
}

export function sectionsHaveClinicalContent(sections: ClinicalNoteSections): boolean {
  return (
    [
      sections.chiefComplaint,
      sections.hpi,
      sections.physicalExam,
      sections.familySocialHistory,
      sections.diagnosis,
      sections.assessmentPlan,
      sections.medications,
      sections.testsOrdered,
      sections.followUpInstructions,
      sections.additionalNote,
    ].some((s) => s.trim().length > 0) || sections.followUpTasks.length > 0
  )
}

export function sectionText(
  sections: ClinicalNoteSections,
  key: NoteSectionKey,
): string {
  const field = NOTE_SECTION_META.find((m) => m.key === key)?.field
  if (!field || field === 'followUpTasks') return ''
  return String(sections[field] ?? '')
}

export function appendToSection(
  sections: ClinicalNoteSections,
  key: NoteSectionKey,
  chunk: string,
): ClinicalNoteSections {
  const field = NOTE_SECTION_META.find((m) => m.key === key)?.field
  if (!field || field === 'followUpTasks') return sections
  const prev = String(sections[field] ?? '').trimEnd()
  const merged = prev.length === 0 ? chunk : `${prev} ${chunk}`
  return { ...sections, [field]: merged }
}

export function sectionDisplayLabel(key: NoteSectionKey): string {
  return NOTE_SECTION_META.find((m) => m.key === key)?.label ?? key
}
