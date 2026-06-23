/** Lab queue helpers — parse comma-separated orders and classify HC III tests. */

import { LAB_CATALOG_TESTS } from './lab-catalog';

export type LabTestStatus = 'pending' | 'running' | 'done' | 'abnormal';

export interface LabTestResultRow {
  test: string;
  status: LabTestStatus;
  result: string | null;
  abnormal: boolean;
  started_at?: string | null;
  completed_at?: string | null;
}

export function parseTestsOrdered(testsOrdered: string | null | undefined): string[] {
  if (!testsOrdered?.trim()) return [];
  return testsOrdered
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function mergeLabTestResults(
  testsOrdered: string | null | undefined,
  stored: LabTestResultRow[] | null | undefined,
): LabTestResultRow[] {
  const names = parseTestsOrdered(testsOrdered);
  const byName = new Map((stored ?? []).map((r) => [r.test, r]));
  return names.map((test) => {
    const existing = byName.get(test);
    if (existing) return existing;
    return { test, status: 'pending', result: null, abnormal: false };
  });
}

/** Qualitative bench tests get one-tap Positive / Negative chips at HC III. */
export function labTestSupportsPosNeg(testName: string): boolean {
  const normalized = testName.toLowerCase();
  const catalog = LAB_CATALOG_TESTS.find(
    (t) => t.name.toLowerCase() === normalized || t.code.toLowerCase() === normalized,
  );
  if (catalog) {
    const qualitative = new Set([
      'MRDT',
      'BS_MPS',
      'HIV_RDT',
      'SYPHILIS',
      'UCG',
      'WIDAL',
      'STOOL_RDT',
      'AFB',
    ]);
    return qualitative.has(catalog.code);
  }
  return /malaria|hiv|pregnancy|ucg|syphilis|rpr|tpha|widal|typhoid|h\.?\s*pylori|rdt|rapid|afb|tb\s*smear|sputum/i.test(
    testName,
  );
}

export function countOpenLabTests(rows: LabTestResultRow[]): number {
  return rows.filter((r) => r.status === 'pending' || r.status === 'running').length;
}

export function formatLabResultsSummary(rows: LabTestResultRow[]): string {
  return rows
    .filter((r) => r.status === 'done' || r.status === 'abnormal')
    .map((r) => `${r.test}: ${r.result ?? '—'}`)
    .join('; ');
}
