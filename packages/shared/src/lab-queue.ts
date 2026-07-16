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

/**
 * Union of an existing comma-separated tests_ordered value with newly ordered
 * tests. Existing order is preserved, incoming tests are appended, duplicates
 * are dropped case-insensitively (first occurrence's casing wins). Returns
 * null when both inputs are empty — the "no order" representation used by the
 * lab board.
 *
 * SQL mirror: merge_tests_ordered() in
 * packages/supabase/migrations/108_lab_order_protection_and_queue_release.sql —
 * keep the two in sync. Lab orders are ADD-ONLY through the note/order paths
 * (LAB-1 regression: the note editor's stale snapshot must never erase an
 * order submitted from another surface).
 */
export function mergeTestsOrdered(
  existing: string | null | undefined,
  incoming: string | string[] | null | undefined,
): string | null {
  const incomingList = Array.isArray(incoming)
    ? incoming.map((s) => s.trim()).filter(Boolean)
    : parseTestsOrdered(incoming);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of [...parseTestsOrdered(existing), ...incomingList]) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out.length > 0 ? out.join(', ') : null;
}

/** Visit-level lab statuses that keep a visit on the lab bench. */
export const LAB_QUEUE_OPEN_STATUSES = ['pending', 'running'] as const;

/**
 * Lab queue membership: the visit-level status is open AND at least one
 * ordered test has not reached a terminal state. Mirrors the SQL filter in
 * apps/web/src/app/dashboard/lab/page.tsx (lab_status IN pending/running)
 * plus its countOpenLabTests post-filter.
 */
export function isLabQueueVisit(visit: {
  tests_ordered: string | null | undefined;
  lab_status: string | null | undefined;
  lab_test_results?: LabTestResultRow[] | null;
}): boolean {
  if (
    !visit.lab_status ||
    !(LAB_QUEUE_OPEN_STATUSES as readonly string[]).includes(visit.lab_status)
  ) {
    return false;
  }
  const tests = mergeLabTestResults(visit.tests_ordered, visit.lab_test_results ?? []);
  return countOpenLabTests(tests) > 0;
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
