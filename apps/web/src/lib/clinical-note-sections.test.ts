import { describe, expect, it } from 'vitest'
import {
  coalesceToUnifiedNote,
  emptyClinicalNoteSections,
  sectionsToClinicianText,
} from './clinical-note-sections'

describe('sectionsToClinicianText — unified note for AI review', () => {
  it('uses the single note box as the primary transcript body', () => {
    const sections = {
      ...emptyClinicalNoteSections(),
      additionalNote:
        'Fever x3 days. Exam: febrile. Dx: malaria. Plan: AL + RDT.',
      followUpTasks: ['Get script from pharmacy'],
    }

    const text = sectionsToClinicianText(sections)
    expect(text).toContain('Fever x3 days')
    expect(text).toContain('Patient next steps: Get script from pharmacy')
    expect(text).not.toMatch(/^Additional note:/m)
  })

  it('falls back to legacy structured narrative when the unified box is empty', () => {
    const sections = {
      ...emptyClinicalNoteSections(),
      chiefComplaint: 'cough',
      hpi: 'started yesterday',
    }
    expect(sectionsToClinicianText(sections)).toContain('Chief complaint: cough')
    expect(sectionsToClinicianText(sections)).toContain('History of present illness: started yesterday')
  })
})

describe('coalesceToUnifiedNote', () => {
  it('folds legacy structured fields into additionalNote once', () => {
    const coalesced = coalesceToUnifiedNote({
      ...emptyClinicalNoteSections(),
      chiefComplaint: 'headache',
      physicalExam: 'alert',
    })
    expect(coalesced.additionalNote).toContain('Chief complaint: headache')
    expect(coalesced.additionalNote).toContain('Physical exam: alert')
  })
})
