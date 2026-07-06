/**
 * WP3 D1 — the ONE billing-balance function used by every web surface.
 *
 * Before this util, charged/paid/balance was recomputed in five places with
 * three different clamping rules, so an overpay/prepay/void-after-payment showed
 * a different number on the bill page, the billing list, and the printed receipt
 * (which could even print "Remaining: UGX -2,000"). This module owns the display
 * semantics for ALL of them:
 *
 *   - `remaining` is never negative — an unallocated payment surfaces as an
 *     explicit `credit` (prepaid), never as a negative Remaining.
 *   - the production `charged=0, paid>0` case (drug paid for before the pharmacy
 *     charge existed) renders as `remaining=0, credit=paid` — a clear Credit, not
 *     a broken balance.
 *
 * SQL RPCs deliberately keep returning the raw (unclamped, signed) balance —
 * other consumers may rely on the sign. Clamping lives here, in the UI layer.
 */

export type BalanceCharge = {
  amount_ugx: number
  /** Voided charges do not count toward the bill. Absent = active. */
  voided?: boolean | null
  created_at?: string | null
}

export type BalancePayment = {
  amount_ugx: number
  /** Barter value counts toward what the patient has paid. */
  amount_barter_ugx?: number | null
  /** Only 'paid' payments count. Absent = already filtered upstream = paid. */
  status?: string | null
  created_at?: string | null
}

export type BillingBalance = {
  /** Σ(amount_ugx) over non-voided charges. */
  charged: number
  /** Σ(amount_ugx + amount_barter_ugx) over paid payments. */
  paid: number
  /** max(0, charged − paid) — never negative. */
  remaining: number
  /** max(0, paid − charged) — unallocated / prepaid amount. */
  credit: number
}

function isActiveCharge(c: BalanceCharge): boolean {
  return c.voided !== true
}

function isPaidPayment(p: BalancePayment): boolean {
  return p.status == null || p.status === 'paid'
}

function toTime(iso: string | null | undefined): number {
  if (!iso) return NaN
  return Date.parse(iso)
}

/** The single source of truth for the charged / paid / remaining / credit triple. */
export function computeBalance(
  charges: readonly BalanceCharge[],
  payments: readonly BalancePayment[],
): BillingBalance {
  const charged = charges
    .filter(isActiveCharge)
    .reduce((sum, c) => sum + (Number(c.amount_ugx) || 0), 0)
  const paid = payments
    .filter(isPaidPayment)
    .reduce(
      (sum, p) => sum + (Number(p.amount_ugx) || 0) + (Number(p.amount_barter_ugx) || 0),
      0,
    )
  return {
    charged,
    paid,
    remaining: Math.max(0, charged - paid),
    credit: Math.max(0, paid - charged),
  }
}

/**
 * WP3 D5 — total of non-voided charges created AFTER the most recent paid
 * payment. Powers the "New charges added since last payment: UGX X" info line so
 * a patient who looked settled but owes again (payment-decoupled auto-charges on
 * dispense/lab result) is not invisible. Returns 0 when there are no payments.
 */
export function chargesSinceLastPayment(
  charges: readonly BalanceCharge[],
  payments: readonly BalancePayment[],
): number {
  const paidTimes = payments
    .filter(isPaidPayment)
    .map((p) => toTime(p.created_at))
    .filter((t) => Number.isFinite(t))
  if (paidTimes.length === 0) return 0
  const lastPaidAt = Math.max(...paidTimes)
  return charges
    .filter(isActiveCharge)
    .filter((c) => {
      const t = toTime(c.created_at)
      return Number.isFinite(t) && t > lastPaidAt
    })
    .reduce((sum, c) => sum + (Number(c.amount_ugx) || 0), 0)
}
