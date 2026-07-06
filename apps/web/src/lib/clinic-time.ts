/**
 * Clinic-local time helpers.
 *
 * The pharmacy "Done today" tab must roll over at the clinic's local midnight,
 * not the server's. Karibu HC IIIs run in Uganda (Africa/Kampala, UTC+3, no
 * DST), so a server that thinks in UTC drops completed work off the Done tab
 * three hours "early" every evening (WP1 defect C2). Compute the boundary from
 * an explicit IANA timezone instead of the host's local zone.
 *
 * No new dependency — uses Intl.DateTimeFormat, which ships in the Node runtime
 * Next.js uses on the server.
 */

/**
 * ISO-8601 UTC instant of the most recent local midnight in `tz`.
 *
 * Example: at the real instant 2026-07-06T22:30:00Z it is already
 * 2026-07-07T01:30 in Kampala, so "today" started at 2026-07-06T21:00:00.000Z.
 */
export function startOfTodayInTimezoneIso(tz: string = 'Africa/Kampala'): string {
  const now = new Date()

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now)

  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value ?? '0')

  const year = read('year')
  const month = read('month')
  const day = read('day')
  let hour = read('hour')
  // Some engines emit '24' for midnight in 24-hour formats.
  if (hour === 24) hour = 0
  const minute = read('minute')
  const second = read('second')

  // The tz wall-clock "now" reinterpreted as if it were a UTC instant. The gap
  // between that and the real instant (ms stripped) is the zone's UTC offset.
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute, second)
  const offsetMs = wallClockAsUtc - (now.getTime() - now.getMilliseconds())

  // Local midnight of the same wall-clock date, converted back to a real UTC instant.
  const localMidnightAsUtc = Date.UTC(year, month - 1, day)
  return new Date(localMidnightAsUtc - offsetMs).toISOString()
}
