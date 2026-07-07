import { describe, expect, it } from 'vitest'
import {
  ACTIONABLE_AI_SUGGESTION_TYPES,
  filterTimelineAiNotes,
  incorporationFor,
  stripCitationArtifacts,
} from './ai-review-helpers'

describe('incorporationFor', () => {
  it('maps ask_lab to TestsOrdered with lab picker flag', () => {
    const result = incorporationFor({
      id: 's1',
      suggestion_type: 'ask_lab',
      question: 'Order malaria RDT?',
    })
    expect(result.section).toBe('TestsOrdered')
    expect(result.prefill).toBe('Consider: Order malaria RDT?')
    expect(result.openLabPicker).toBe(true)
    expect(result.openRxPicker).toBe(false)
  })

  it('maps ask_med to Medications with rx picker flag', () => {
    const result = incorporationFor({
      id: 's2',
      suggestion_type: 'ask_med',
      question: 'Document ACT dosing?',
    })
    expect(result.section).toBe('Medications')
    expect(result.openRxPicker).toBe(true)
  })

  it('maps ask_dx to Diagnosis', () => {
    const result = incorporationFor({
      id: 's3',
      suggestion_type: 'ask_dx',
      question: 'Capture working diagnosis?',
    })
    expect(result.section).toBe('Diagnosis')
  })

  it('defaults unknown types to AssessmentPlan', () => {
    const result = incorporationFor({
      id: 's4',
      suggestion_type: 'other',
      question: 'General prompt?',
    })
    expect(result.section).toBe('AssessmentPlan')
  })
})

describe('filterTimelineAiNotes', () => {
  it('keeps unanswered draft/lab timeline notes up to three', () => {
    const rows = [
      { clinician_response: null, phase: 'draft', display_tier: 'timeline' },
      { clinician_response: null, phase: 'lab', display_tier: 'timeline' },
      { clinician_response: 'dismissed', phase: 'draft', display_tier: 'timeline' },
      { clinician_response: null, phase: 'draft', display_tier: 'interruptive' },
      { clinician_response: null, phase: 'draft', display_tier: 'timeline' },
      { clinician_response: null, phase: 'draft', display_tier: 'timeline' },
    ]
    expect(filterTimelineAiNotes(rows)).toHaveLength(3)
  })
})

describe('stripCitationArtifacts', () => {
  it('removes chunk_id markers from reasoning', () => {
    expect(stripCitationArtifacts('See [chunk_id=12] for guidance.')).toBe('See for guidance.')
  })
})

describe('ACTIONABLE_AI_SUGGESTION_TYPES', () => {
  it('includes incorporate-eligible types only', () => {
    expect(ACTIONABLE_AI_SUGGESTION_TYPES.has('ask_lab')).toBe(true)
    expect(ACTIONABLE_AI_SUGGESTION_TYPES.has('ask_other')).toBe(false)
  })
})
