import { describe, expect, it } from 'vitest';
import {
  computePrescriptionQuantity,
  frequencyPerDay,
  FREQUENCY_PER_DAY,
  type QuantityComputeInput,
} from './pharmacy-catalog';
import vectorFixture from './__fixtures__/quantity-vectors.json';

interface Vector {
  name: string;
  input: QuantityComputeInput;
  expected: {
    quantity: number | null;
    units_per_dose: number | null;
    total_doses: number | null;
    needs_confirmation: boolean;
  };
}

const vectors = (vectorFixture as { vectors: Vector[] }).vectors;

describe('computePrescriptionQuantity — golden vectors (parity with Kotlin)', () => {
  it.each(vectors)('$name', (vector) => {
    const result = computePrescriptionQuantity(vector.input);
    expect(result.quantity).toBe(vector.expected.quantity);
    expect(result.units_per_dose).toBe(vector.expected.units_per_dose);
    expect(result.total_doses).toBe(vector.expected.total_doses);
    expect(result.needs_confirmation).toBe(vector.expected.needs_confirmation);
  });
});

describe('frequencyPerDay map', () => {
  it('maps canonical scheduled codes', () => {
    expect(frequencyPerDay('OD')).toBe(1);
    expect(frequencyPerDay('BID')).toBe(2);
    expect(frequencyPerDay('TID')).toBe(3);
    expect(frequencyPerDay('QID')).toBe(4);
    expect(frequencyPerDay('Q4H')).toBe(6);
    expect(frequencyPerDay('Q6H')).toBe(4);
    expect(frequencyPerDay('Q8H')).toBe(3);
    expect(frequencyPerDay('Q12H')).toBe(2);
    expect(frequencyPerDay('HS')).toBe(1);
    expect(frequencyPerDay('AC')).toBe(3);
    expect(frequencyPerDay('PC')).toBe(3);
  });

  it('normalizes case', () => {
    expect(frequencyPerDay('q4h')).toBe(6);
    expect(frequencyPerDay(' bid ')).toBe(2);
  });

  it('returns null for PRN (fixed_quantity path) and unknown codes', () => {
    expect(FREQUENCY_PER_DAY.PRN).toBeNull();
    expect(frequencyPerDay('PRN')).toBeNull();
    expect(frequencyPerDay('WAT')).toBeNull();
    expect(frequencyPerDay(null)).toBeNull();
  });
});

describe('computePrescriptionQuantity — edge cases', () => {
  it('flags missing strength for mg dose', () => {
    const r = computePrescriptionQuantity({
      order_mode: 'scheduled',
      frequency_code: 'BID',
      duration_days: 5,
      dose_amount: 500,
      dose_unit: 'mg',
      dispense_unit: 'tab',
    });
    expect(r.quantity).toBeNull();
    expect(r.needs_confirmation).toBe(true);
    expect(r.flags).toContain('strength_required_for_mg_dose');
  });

  it('flags missing duration for scheduled non-STAT', () => {
    const r = computePrescriptionQuantity({
      order_mode: 'scheduled',
      frequency_code: 'BID',
      dose_amount: 1,
      dose_unit: 'tab',
      dispense_unit: 'tab',
    });
    expect(r.quantity).toBeNull();
    expect(r.flags).toContain('duration_required');
  });

  it('flags PRN routed through the scheduled path', () => {
    const r = computePrescriptionQuantity({
      order_mode: 'scheduled',
      frequency_code: 'PRN',
      duration_days: 5,
      dose_amount: 1,
      dose_unit: 'tab',
      dispense_unit: 'tab',
    });
    expect(r.flags).toContain('frequency_not_schedulable');
  });

  it('flags a non-half-tablet fraction', () => {
    const r = computePrescriptionQuantity({
      order_mode: 'scheduled',
      frequency_code: 'OD',
      duration_days: 10,
      dose_amount: 100,
      dose_unit: 'mg',
      strength_amount: 300,
      dispense_unit: 'tab',
    });
    // 100/300 = 0.333 tab -> not a multiple of 0.5
    expect(r.needs_confirmation).toBe(true);
    expect(r.flags).toContain('non_half_tablet_fraction');
  });

  it('flags fixed_quantity with no total', () => {
    const r = computePrescriptionQuantity({
      order_mode: 'fixed_quantity',
      dose_amount: 1,
      dose_unit: 'tab',
      dispense_unit: 'tab',
    });
    expect(r.quantity).toBeNull();
    expect(r.flags).toContain('fixed_quantity_required');
  });
});
