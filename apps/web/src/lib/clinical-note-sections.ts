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

/**
 * Short checklist shown above the unified clinician note so notes stay consistent.
 * Orders (lab/pharmacy) are separate catalog pickers — not part of this narrative.
 */
export const CLINICAL_NOTE_INCLUDE = [
  'Chief complaint / chief concern',
  'History of present illness',
  'Physical exam',
  'Family / social history (when relevant)',
  'Working diagnosis',
  'Assessment and plan',
] as const

export const CLINICAL_NOTE_PLACEHOLDER =
  'Dictate or type the visit note. Include: chief complaint, history, physical exam, family/social history if relevant, diagnosis, and plan…'

/** Kept for incorporate / Android parity; web note UI no longer edits these fields. */
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

/** Stored values stay stable; `label` is what clinicians see (patient-facing next steps). */
export const PATIENT_NEXT_STEP_OPTIONS = [
  { value: 'Get script from pharmacy', label: 'Pick up medicines from pharmacy' },
  { value: 'Get labs drawn', label: 'Have labs drawn' },
  { value: 'Return for review', label: 'Return for review' },
  { value: 'Referral', label: 'Go for referral' },
] as const

/** @deprecated Use PATIENT_NEXT_STEP_OPTIONS — kept for call sites that only need values. */
export const FOLLOW_UP_TASK_OPTIONS = PATIENT_NEXT_STEP_OPTIONS.map((o) => o.value)

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
        return coalesceToUnifiedNote({ ...base, ...fallbacks, ...parsed.data })
      }
    } catch {
      /* fall through */
    }
  }
  if (raw && typeof raw === 'object') {
    const parsed = clinicalNoteSectionsSchema.safeParse(raw)
    if (parsed.success) {
      return coalesceToUnifiedNote({ ...base, ...fallbacks, ...parsed.data })
    }
  }
  return coalesceToUnifiedNote({ ...base, ...fallbacks })
}

/**
 * If an older draft only filled structured fields, fold that narrative into the
 * unified note box once so the clinician (and AI notes) see one surface.
 */
export function coalesceToUnifiedNote(sections: ClinicalNoteSections): ClinicalNoteSections {
  if (sections.additionalNote.trim()) return sections
  const legacyNarrative = legacyNarrativeText(sections)
  if (!legacyNarrative) return sections
  return { ...sections, additionalNote: legacyNarrative }
}

function legacyNarrativeText(sections: ClinicalNoteSections): string {
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
  return blocks.join('\n\n')
}

function followUpWithTasks(sections: ClinicalNoteSections): string {
  const tasks = sections.followUpTasks.filter(Boolean).join('; ')
  const parts = [sections.followUpInstructions.trim(), tasks].filter(Boolean)
  return parts.join('\n')
}

/**
 * Flat transcript persisted on provider_notes and fed to draft AI notes.
 * Primary body is the unified note box so MOH guideline review sees one narrative.
 */
export function sectionsToClinicianText(sections: ClinicalNoteSections): string {
  const blocks: string[] = []
  const note = sections.additionalNote.trim() || legacyNarrativeText(sections)
  if (note) blocks.push(note)

  const meds = sections.medications.trim()
  if (meds) blocks.push(`Medications: ${meds}`)

  const followUp = followUpWithTasks(sections)
  if (followUp) blocks.push(`Patient next steps: ${followUp}`)

  return blocks.join('\n\n')
}

export function sectionsHaveClinicalContent(sections: ClinicalNoteSections): boolean {
  return (
    [
      sections.additionalNote,
      sections.chiefComplaint,
      sections.hpi,
      sections.physicalExam,
      sections.familySocialHistory,
      sections.diagnosis,
      sections.assessmentPlan,
      sections.medications,
      sections.followUpInstructions,
    ].some((s) => s.trim().length > 0) || sections.followUpTasks.length > 0
  )
}

export function sectionText(
  sections: ClinicalNoteSections,
  key: NoteSectionKey,
): string {
  // AdditionalNote is the unified free-dictation surface — not in NOTE_SECTION_META.
  if (key === 'AdditionalNote') return String(sections.additionalNote ?? '')
  const field = NOTE_SECTION_META.find((m) => m.key === key)?.field
  if (!field || field === 'followUpTasks') return ''
  return String(sections[field] ?? '')
}

export function appendToSection(
  sections: ClinicalNoteSections,
  _key: NoteSectionKey,
  chunk: string,
): ClinicalNoteSections {
  // Web note UI is unified — clinical text always lands in the main note box.
  const prev = String(sections.additionalNote ?? '').trimEnd()
  return { ...sections, additionalNote: prev.length === 0 ? chunk : `${prev} ${chunk}` }
}

export function sectionDisplayLabel(key: NoteSectionKey): string {
  if (key === 'AdditionalNote') return 'Clinician note'
  return NOTE_SECTION_META.find((m) => m.key === key)?.label ?? key
}
