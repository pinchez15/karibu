import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

afterEach(cleanup)
import { computePrescriptionQuantity } from '@karibu/shared'
import { PrescriptionLineInputSchema } from '@/lib/validators/prescription'
import {
  PrescriptionComposer,
  computeForDraft,
  draftLinesToRpcInput,
  validateDraftLine,
  type DraftPrescriptionLine,
} from './PrescriptionComposer'

/** Build a complete draft with overridable fields for the pure-function tests. */
function makeDraft(patch: Partial<DraftPrescriptionLine> = {}): DraftPrescriptionLine {
  return {
    id: 'test',
    drugCode: 'AMOX',
    strength: '500mg cap',
    containerSize: null,
    confirmedWarning: false,
    medication_code: 'AMOX',
    free_text_name: 'Amoxicillin',
    dose_text: null,
    route_text: 'PO',
    frequency_text: null,
    duration_text: null,
    quantity_prescribed: null,
    quantity_unit: null,
    frequency_code: 'TID',
    duration_days: 5,
    dose_amount: 500,
    dose_unit: 'mg',
    strength_amount: 500,
    strength_unit: 'mg',
    form: 'capsule',
    order_mode: 'scheduled',
    quantity_source: 'computed',
    dispense_unit: 'cap',
    notes: null,
    source: 'manual',
    ...patch,
  }
}

describe('computeForDraft — parity with computePrescriptionQuantity', () => {
  it('Amox 500mg cap TID x5d = 15', () => {
    const draft = makeDraft()
    const result = computeForDraft(draft)
    expect(result?.quantity).toBe(15)
    expect(result?.quantity).toBe(
      computePrescriptionQuantity({
        order_mode: 'scheduled',
        frequency_code: 'TID',
        duration_days: 5,
        dose_amount: 500,
        dose_unit: 'mg',
        strength_amount: 500,
        dispense_unit: 'cap',
      }).quantity,
    )
  })

  it('Amox 125mg/5mL susp, 250mg dose TID x5d = 150 mL', () => {
    const draft = makeDraft({
      strength: '125mg/5mL susp',
      dose_amount: 250,
      dose_unit: 'mg',
      strength_amount: 25, // concentration mg/mL
      strength_unit: 'mg/mL',
      form: 'suspension',
      dispense_unit: 'mL',
    })
    expect(computeForDraft(draft)?.quantity).toBe(150)
  })

  it('PRN fixed_quantity uses the clinician total', () => {
    const draft = makeDraft({
      order_mode: 'fixed_quantity',
      frequency_code: 'PRN',
      quantity_prescribed: 20,
    })
    expect(computeForDraft(draft)?.quantity).toBe(20)
  })

  it('STAT computes exactly one dose', () => {
    const draft = makeDraft({
      frequency_code: 'STAT',
      dose_amount: 1,
      dose_unit: 'tab',
      strength_amount: null,
      dispense_unit: 'tab',
    })
    expect(computeForDraft(draft)?.quantity).toBe(1)
  })
})

describe('draftLinesToRpcInput — structured emission', () => {
  it('emits the structured fields with an uppercase frequency_code', () => {
    const [line] = draftLinesToRpcInput([makeDraft({ quantity_prescribed: 15 })])
    expect(line).toMatchObject({
      medication_code: 'AMOX',
      frequency_code: 'TID',
      duration_days: 5,
      dose_amount: 500,
      dose_unit: 'mg',
      strength_amount: 500,
      dispense_unit: 'cap',
      quantity_unit: 'cap',
      quantity_prescribed: 15,
      order_mode: 'scheduled',
      quantity_source: 'computed',
      source: 'manual',
    })
    // Passes the input schema (which throws on any non-human source).
    expect(() => PrescriptionLineInputSchema.parse(line)).not.toThrow()
  })

  it('drops duration for STAT and for fixed_quantity, and emits PRN for fixed', () => {
    const [stat] = draftLinesToRpcInput([makeDraft({ frequency_code: 'STAT' })])
    expect(stat.duration_days).toBeNull()
    expect(stat.frequency_code).toBe('STAT')

    const [prn] = draftLinesToRpcInput([
      makeDraft({ order_mode: 'fixed_quantity', quantity_prescribed: 20 }),
    ])
    expect(prn.frequency_code).toBe('PRN')
    expect(prn.duration_days).toBeNull()
    expect(prn.quantity_prescribed).toBe(20)
    expect(prn.quantity_source).toBe('overridden')
  })

  it('preserves an overridden quantity and flips quantity_source', () => {
    const [line] = draftLinesToRpcInput([
      makeDraft({ quantity_source: 'overridden', quantity_prescribed: 8 }),
    ])
    expect(line.quantity_prescribed).toBe(8)
    expect(line.quantity_source).toBe('overridden')
  })

  it('can never emit a non-manual source, even if the draft is tampered', () => {
    const tampered = makeDraft({
      // Force a forbidden provenance onto the draft object.
      source: 'ai_suggested' as unknown as DraftPrescriptionLine['source'],
    })
    const [line] = draftLinesToRpcInput([tampered])
    expect(line.source).toBe('manual')
    // And the schema would have rejected the tampered source outright.
    expect(() =>
      PrescriptionLineInputSchema.parse({ ...line, source: 'ai_suggested' }),
    ).toThrow()
  })
})

describe('validateDraftLine — confirmation gate', () => {
  it('requires confirmation when the compute flags an out-of-range dose', () => {
    const draft = makeDraft({ dose_amount: 1, dose_unit: 'mg', strength_amount: 500 })
    const v = validateDraftLine(draft)
    expect(v.needsConfirmation).toBe(true)
    expect(v.issues).toContain('Confirm the quantity warning')
    const confirmed = validateDraftLine({ ...draft, confirmedWarning: true })
    expect(confirmed.issues).not.toContain('Confirm the quantity warning')
  })
})

describe('PrescriptionComposer — interactive structured entry', () => {
  it('selecting a drug + strength emits a computed structured line', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn<(lines: DraftPrescriptionLine[], summary: string) => void>()
    render(<PrescriptionComposer onChange={onChange} />)

    await user.selectOptions(screen.getByTestId('rx-drug-0'), 'AMOX')
    await user.selectOptions(screen.getByTestId('rx-strength-0'), '500mg cap')
    await user.selectOptions(screen.getByTestId('rx-frequency-0'), 'TID')
    await user.selectOptions(screen.getByTestId('rx-duration-0'), '5')

    const lastCall = onChange.mock.calls.at(-1)
    expect(lastCall).toBeTruthy()
    const [lines] = lastCall!
    const [emitted] = draftLinesToRpcInput(lines)
    expect(emitted).toMatchObject({
      medication_code: 'AMOX',
      dose_amount: 500,
      dose_unit: 'mg',
      strength_amount: 500,
      dispense_unit: 'cap',
      frequency_code: 'TID',
      duration_days: 5,
      quantity_prescribed: 15,
      quantity_source: 'computed',
      source: 'manual',
    })
    // The emitted quantity is exactly what the canonical compute produces.
    expect(emitted.quantity_prescribed).toBe(
      computePrescriptionQuantity({
        order_mode: 'scheduled',
        frequency_code: 'TID',
        duration_days: 5,
        dose_amount: 500,
        dose_unit: 'mg',
        strength_amount: 500,
        dispense_unit: 'cap',
      }).quantity,
    )
  })

  it('editing the quantity flips quantity_source to overridden', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn<(lines: DraftPrescriptionLine[], summary: string) => void>()
    render(<PrescriptionComposer onChange={onChange} />)

    await user.selectOptions(screen.getByTestId('rx-drug-0'), 'AMOX')
    await user.selectOptions(screen.getByTestId('rx-strength-0'), '500mg cap')

    const qty = screen.getByTestId('rx-quantity-0')
    await user.clear(qty)
    await user.type(qty, '12')

    const [lines] = onChange.mock.calls.at(-1)!
    const [emitted] = draftLinesToRpcInput(lines)
    expect(emitted.quantity_prescribed).toBe(12)
    expect(emitted.quantity_source).toBe('overridden')
  })
})
