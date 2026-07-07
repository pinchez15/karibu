/**
 * Type-ahead queue filtering (WP2 D9 — "kill the scroll").
 *
 * Rows on every role's day view (OPD, pharmacy, lab) are already in memory
 * (≤100), so filtering is a pure client-side string match. Staff and patients
 * both reason in numbers ("you are #23"), so a query matches either the
 * patient name OR today's number — typing "23" or a name fragment finds the
 * row. Callers may also pass extra haystacks (patient number, phone) for
 * convenience.
 */

export interface QueueSearchFields {
  /** Patient display name. */
  name?: string | null;
  /** Today's number (visits.queue_position), the per-day arrival number. */
  todayNumber?: number | null;
  /** Additional text to match against (patient number, phone, etc.). */
  extra?: Array<string | null | undefined>;
}

/** Normalize a raw search box value: trimmed, lower-cased, leading '#' removed. */
export function normalizeQueueSearch(query: string): string {
  const q = query.trim().toLowerCase();
  return q.startsWith('#') ? q.slice(1).trim() : q;
}

/**
 * True when `query` matches the row's name, today's number, or any extra
 * haystack. An empty query matches everything (no filter applied).
 */
export function matchesQueueSearch(query: string, fields: QueueSearchFields): boolean {
  const needle = normalizeQueueSearch(query);
  if (!needle) return true;

  const haystacks: string[] = [];
  if (fields.name) haystacks.push(fields.name.toLowerCase());
  if (fields.todayNumber != null) haystacks.push(String(fields.todayNumber));
  for (const extra of fields.extra ?? []) {
    if (extra) haystacks.push(extra.toLowerCase());
  }

  return haystacks.some((h) => h.includes(needle));
}

/**
 * Filter `rows` by `query`, projecting each row to its searchable fields.
 * Returns the original array reference when the query is empty so callers can
 * skip re-rendering.
 */
export function filterQueueBySearch<T>(
  rows: T[],
  query: string,
  selector: (row: T) => QueueSearchFields,
): T[] {
  if (!normalizeQueueSearch(query)) return rows;
  return rows.filter((row) => matchesQueueSearch(query, selector(row)));
}
