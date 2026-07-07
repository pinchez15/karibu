import { describe, expect, it } from 'vitest';
import {
  filterQueueBySearch,
  matchesQueueSearch,
  normalizeQueueSearch,
} from './queue-search';

describe('normalizeQueueSearch', () => {
  it('trims and lower-cases', () => {
    expect(normalizeQueueSearch('  Amina  ')).toBe('amina');
  });

  it('strips a leading # so "#23" searches for "23"', () => {
    expect(normalizeQueueSearch('#23')).toBe('23');
    expect(normalizeQueueSearch(' # 23 ')).toBe('23');
  });

  it('returns empty for blank input', () => {
    expect(normalizeQueueSearch('   ')).toBe('');
  });
});

describe('matchesQueueSearch', () => {
  const row = { name: 'Amina Nakato', todayNumber: 23 };

  it('matches everything when the query is empty', () => {
    expect(matchesQueueSearch('', row)).toBe(true);
    expect(matchesQueueSearch('   ', row)).toBe(true);
  });

  it('matches a name fragment case-insensitively', () => {
    expect(matchesQueueSearch('amin', row)).toBe(true);
    expect(matchesQueueSearch('NAKATO', row)).toBe(true);
    expect(matchesQueueSearch('zzz', row)).toBe(false);
  });

  it("matches today's number, with or without a leading #", () => {
    expect(matchesQueueSearch('23', row)).toBe(true);
    expect(matchesQueueSearch('#23', row)).toBe(true);
    expect(matchesQueueSearch('99', row)).toBe(false);
  });

  it('does not throw on null fields', () => {
    expect(matchesQueueSearch('x', { name: null, todayNumber: null })).toBe(false);
    expect(matchesQueueSearch('', { name: null, todayNumber: null })).toBe(true);
  });

  it('matches extra haystacks like patient number', () => {
    expect(
      matchesQueueSearch('pt-100', { name: 'Bob', todayNumber: 4, extra: ['PT-100'] }),
    ).toBe(true);
  });
});

describe('filterQueueBySearch', () => {
  interface Patient {
    id: string;
    fullName: string;
    number: number;
  }
  const rows: Patient[] = [
    { id: 'a', fullName: 'Amina Nakato', number: 23 },
    { id: 'b', fullName: 'Bob Okello', number: 24 },
    { id: 'c', fullName: 'Carol Namara', number: 3 },
  ];
  const selector = (p: Patient) => ({ name: p.fullName, todayNumber: p.number });

  it('returns the same array reference when the query is empty', () => {
    expect(filterQueueBySearch(rows, '', selector)).toBe(rows);
  });

  it('filters by name fragment', () => {
    const result = filterQueueBySearch(rows, 'oke', selector);
    expect(result.map((r) => r.id)).toEqual(['b']);
  });

  it("filters by today's number", () => {
    const result = filterQueueBySearch(rows, '23', selector);
    expect(result.map((r) => r.id)).toEqual(['a']);
  });

  it('returns empty when nothing matches', () => {
    expect(filterQueueBySearch(rows, 'zzz', selector)).toEqual([]);
  });
});
