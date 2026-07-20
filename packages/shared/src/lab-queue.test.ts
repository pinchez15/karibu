import { describe, expect, it } from 'vitest';

import {
  countOpenLabTests,
  isLabQueueVisit,
  labTestSupportsPosNeg,
  mergeLabTestResults,
  mergeTestsOrdered,
  parseTestsOrdered,
  type LabTestResultRow,
} from './lab-queue';

const row = (test: string, status: LabTestResultRow['status']): LabTestResultRow => ({
  test,
  status,
  result: status === 'done' || status === 'abnormal' ? 'Negative' : null,
  abnormal: status === 'abnormal',
});

describe('mergeTestsOrdered', () => {
  it('returns null when both sides are empty', () => {
    expect(mergeTestsOrdered(null, null)).toBeNull();
    expect(mergeTestsOrdered('', [])).toBeNull();
    expect(mergeTestsOrdered('  ', ' , ,')).toBeNull();
  });

  it('LAB-1 regression: an empty note snapshot never erases an existing order', () => {
    // The note editor autosaves a sections snapshot seeded at page load; if
    // labs were ordered after the editor opened, the snapshot's tests section
    // is empty/stale. Merging must preserve the existing order.
    expect(mergeTestsOrdered('Malaria RDT', null)).toBe('Malaria RDT');
    expect(mergeTestsOrdered('Malaria RDT', '')).toBe('Malaria RDT');
    expect(mergeTestsOrdered('Malaria RDT, Urinalysis', [])).toBe('Malaria RDT, Urinalysis');
  });

  it('appends new tests after existing ones, preserving order', () => {
    expect(mergeTestsOrdered('Malaria RDT', ['Urinalysis'])).toBe('Malaria RDT, Urinalysis');
    expect(mergeTestsOrdered(null, ['Urinalysis', 'HIV RDT'])).toBe('Urinalysis, HIV RDT');
  });

  it('dedupes case-insensitively, first occurrence casing wins', () => {
    expect(mergeTestsOrdered('Malaria RDT', ['malaria rdt', 'HIV RDT'])).toBe(
      'Malaria RDT, HIV RDT',
    );
    expect(mergeTestsOrdered('malaria rdt, malaria rdt', 'Malaria RDT')).toBe('malaria rdt');
  });

  it('accepts a comma-separated string as incoming and normalizes whitespace', () => {
    expect(mergeTestsOrdered('Malaria RDT', ' Urinalysis ,HIV RDT,, ')).toBe(
      'Malaria RDT, Urinalysis, HIV RDT',
    );
  });

  it('round-trips through parseTestsOrdered', () => {
    const merged = mergeTestsOrdered('A, B', ['C']);
    expect(parseTestsOrdered(merged)).toEqual(['A', 'B', 'C']);
  });
});

describe('isLabQueueVisit (lab board membership)', () => {
  it('is on the bench: pending status with an unresulted ordered test', () => {
    expect(
      isLabQueueVisit({ tests_ordered: 'Malaria RDT', lab_status: 'pending' }),
    ).toBe(true);
  });

  it('is on the bench: running status with one done and one open test', () => {
    expect(
      isLabQueueVisit({
        tests_ordered: 'Malaria RDT, Urinalysis',
        lab_status: 'running',
        lab_test_results: [row('Malaria RDT', 'done'), row('Urinalysis', 'running')],
      }),
    ).toBe(true);
  });

  it('off the bench: no tests ordered', () => {
    expect(isLabQueueVisit({ tests_ordered: null, lab_status: 'pending' })).toBe(false);
    expect(isLabQueueVisit({ tests_ordered: '', lab_status: 'pending' })).toBe(false);
  });

  it('off the bench: terminal visit-level statuses', () => {
    for (const status of ['not_ordered', 'done', 'abnormal', null, undefined]) {
      expect(
        isLabQueueVisit({ tests_ordered: 'Malaria RDT', lab_status: status ?? null }),
      ).toBe(false);
    }
  });

  it('off the bench: every ordered test already resulted', () => {
    expect(
      isLabQueueVisit({
        tests_ordered: 'Malaria RDT, Urinalysis',
        lab_status: 'pending', // stale visit-level status must not resurrect it
        lab_test_results: [row('Malaria RDT', 'done'), row('Urinalysis', 'abnormal')],
      }),
    ).toBe(false);
  });

  it('LAB-1 regression shape: order survives a note sign, so the visit stays visible', () => {
    // Post-fix DB state after: submit order -> note autosave/sign with an
    // empty tests section (tests_ordered preserved, lab_status still pending).
    const afterFix = { tests_ordered: 'Malaria RDT', lab_status: 'pending' };
    expect(isLabQueueVisit(afterFix)).toBe(true);

    // Pre-fix DB state (the bug): summary write cleared the order.
    const preFix = { tests_ordered: null, lab_status: 'not_ordered' };
    expect(isLabQueueVisit(preFix)).toBe(false);
  });
});

describe('mergeLabTestResults + countOpenLabTests', () => {
  it('synthesizes pending rows for ordered tests without stored results', () => {
    const merged = mergeLabTestResults('Malaria RDT, Urinalysis', [row('Malaria RDT', 'done')]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ test: 'Malaria RDT', status: 'done' });
    expect(merged[1]).toMatchObject({ test: 'Urinalysis', status: 'pending' });
    expect(countOpenLabTests(merged)).toBe(1);
  });

  it('counts pending and running as open, done/abnormal as closed', () => {
    const rows = [
      row('A', 'pending'),
      row('B', 'running'),
      row('C', 'done'),
      row('D', 'abnormal'),
    ];
    expect(countOpenLabTests(rows)).toBe(2);
  });
});

describe('labTestSupportsPosNeg', () => {
  it('treats Hepatitis B and Brucellosis as qualitative bench tests', () => {
    expect(labTestSupportsPosNeg('Hepatitis B rapid test (HBsAg)')).toBe(true);
    expect(labTestSupportsPosNeg('Brucellosis rapid test')).toBe(true);
  });
});
