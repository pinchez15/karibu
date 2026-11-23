// Parses a pasted mobile money confirmation SMS into a payment record
// (spec §7.G: read-only reconciliation). Nothing here moves money; it only
// reads what the partner's phone already received.
//
// The parser is tolerant on purpose: operators change wording, so it looks for
// the pieces (amount received, sender, reference, date) rather than matching
// one whole template. Fixtures are in momo.test.ts.

export type MomoMethod = 'momo_mtn' | 'airtel'

export interface ParsedPayment {
  method: MomoMethod
  /** Whole currency units as written in the SMS (UGX has no minor unit). */
  amount: number
  currency: string
  reference: string | null
  payer_phone: string | null
  payer_name: string | null
  /** ISO timestamp if the SMS carried a date; otherwise null and "now" is used. */
  paid_at: string | null
  raw_evidence: string
}

export type ParseResult =
  | { ok: true; payment: ParsedPayment }
  | { ok: false; reason: 'not_received' | 'no_amount' | 'empty' }

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
  january: 0, february: 1, march: 2, april: 3, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
}

const num = (s: string) => Number(s.replace(/,/g, ''))

/** Uganda is UTC+3 all year. SMS times are local. */
function toIso(y: number, m: number, d: number, hh = 12, mm = 0, ss = 0): string | null {
  const t = Date.UTC(y, m, d, hh - 3, mm, ss)
  return Number.isFinite(t) && y > 2000 && m >= 0 && m < 12 && d >= 1 && d <= 31 ? new Date(t).toISOString() : null
}

function parseDate(text: string): string | null {
  const time = text.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?/i)
  let hh = time ? Number(time[1]) : 12
  const mm = time ? Number(time[2]) : 0
  const ss = time?.[3] ? Number(time[3]) : 0
  if (time?.[4]) {
    const pm = time[4].toUpperCase() === 'PM'
    hh = (hh % 12) + (pm ? 12 : 0)
  }
  // 2026-11-20
  let m = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/)
  if (m) return toIso(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hh, mm, ss)
  // 20/11/2026 or 20-11-2026 (day first, as written in Uganda)
  m = text.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](20\d{2})\b/)
  if (m) return toIso(Number(m[3]), Number(m[2]) - 1, Number(m[1]), hh, mm, ss)
  // 20-November-2026, 20 Nov 2026
  m = text.match(/\b(\d{1,2})[\s-]([A-Za-z]{3,9})[\s-,]+(20\d{2})\b/)
  if (m && MONTHS[m[2].toLowerCase()] !== undefined) return toIso(Number(m[3]), MONTHS[m[2].toLowerCase()], Number(m[1]), hh, mm, ss)
  return null
}

function detectMethod(text: string, fallback: MomoMethod): MomoMethod {
  if (/airtel|\bTID\b|trans(?:action)?\.?\s*id\s*:?\s*\d{10,}.*\bbal\b/i.test(text) && !/mtn|momo|y'?ello/i.test(text)) return 'airtel'
  if (/mtn|momo|y'?ello/i.test(text)) return 'momo_mtn'
  if (/\bTID\b/i.test(text)) return 'airtel'
  return fallback
}

export function parseMomoSms(input: string, fallback: MomoMethod = 'momo_mtn'): ParseResult {
  const raw = input.replace(/\s+/g, ' ').trim()
  if (!raw) return { ok: false, reason: 'empty' }

  // Only money IN counts. "You have sent", "paid", "withdrawn" are the partner's own spending.
  if (!/\breceived\b/i.test(raw) || /\byou have (sent|paid|withdrawn)\b/i.test(raw)) return { ok: false, reason: 'not_received' }

  // The amount received is the first amount after the word "received" (the balance comes later).
  const afterReceived = raw.slice(raw.search(/\breceived\b/i))
  // Operators write "UGX 130,000" or "130000 UGX"; take whichever comes first in the sentence.
  const prefixed = afterReceived.match(/\b(?:UGX|USH|UGSHS?|SHS?)\.?\s*([\d,]+(?:\.\d{1,2})?)/i)
  const suffixed = afterReceived.match(/([\d,]{4,})\s*(?:UGX|USH|SHS?)\b/i)
  const first = [prefixed, suffixed].filter((m): m is RegExpMatchArray => m !== null).sort((a, b) => a.index! - b.index!)[0]
  if (!first) return { ok: false, reason: 'no_amount' }
  const value = num(first[1])
  if (!Number.isFinite(value) || value <= 0) return { ok: false, reason: 'no_amount' }

  const reference =
    raw.match(/\b(?:transaction|trans|txn|tx)\.?\s*id\s*[:.#-]?\s*([A-Z0-9]{6,20})/i)?.[1] ??
    raw.match(/\bTID\s*[:.#-]?\s*([A-Z0-9]{6,20})/i)?.[1] ??
    raw.match(/\b(?:ref(?:erence)?|receipt)\s*(?:no\.?|number)?\s*[:.#-]?\s*([A-Z0-9]{6,20})/i)?.[1] ??
    null

  // Sender: the phone number and name that follow "from".
  const from = afterReceived.match(/\bfrom\b(.{0,80})/i)?.[1] ?? ''
  const phone = from.match(/(?:\+?256|0)\s?7\d{2}\s?\d{3}\s?\d{3}/)?.[0].replace(/\D/g, '') ?? null
  const name = from
    .replace(/(?:\+?256|0)\s?7\d{2}\s?\d{3}\s?\d{3}/, ' ')
    .replace(/\b(on|at|reason|bal|balance|new|date|trans|transaction|tid|fee|your)\b.*$/i, ' ')
    .replace(/\.(\s|$).*$/, ' ') // the name ends with the sentence
    .replace(/[^A-Za-z' .-]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[ .-]+$/, '')
    .trim()

  return {
    ok: true,
    payment: {
      method: detectMethod(raw, fallback),
      amount: Math.round(value),
      currency: 'UGX',
      reference,
      payer_phone: phone,
      payer_name: name.length >= 2 ? name.slice(0, 80) : null,
      paid_at: parseDate(raw),
      raw_evidence: input.trim().slice(0, 2000),
    },
  }
}

/** Splits a paste that holds several messages (one per blank line, or each starting a new "received" sentence). */
export function splitMessages(input: string): string[] {
  const blocks = input.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)
  return blocks.length > 1 ? blocks : [input.trim()].filter(Boolean)
}
