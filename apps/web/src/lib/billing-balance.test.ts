import { describe, expect, it } from 'vitest'
import {
  computeBalance,
  chargesSinceLastPayment,
  type BalanceCharge,
  type BalancePayment,
} from './billing-balance'

describe('computeBalance', () => {
  it('production case: charged 0 + paid > 0 → remaining 0, credit = paid', () => {
    // The 10 prod patients with charged=0, paid>0 (drug paid for before the
    // pharmacy charge existed) must render as a clear Credit, not a broken
    // negative balance.
    const r = computeBalance([], [{ amount_ugx: 5000 }])
    expect(r.charged).toBe(0)
    expect(r.paid).toBe(5000)
    expect(r.remaining).toBe(0)
    expect(r.credit).toBe(5000)
  })

  it('exact payment → remaining 0, credit 0', () => {
    const r = computeBalance([{ amount_ugx: 8000 }], [{ amount_ugx: 8000 }])
    expect(r.remaining).toBe(0)
    expect(r.credit).toBe(0)
  })

  it('underpayment → remaining > 0, credit 0', () => {
    const r = computeBalance([{ amount_ugx: 10000 }], [{ amount_ugx: 4000 }])
    expect(r.remaining).toBe(6000)
    expect(r.credit).toBe(0)
  })

  it('overpayment → remaining 0, credit > 0 (never negative Remaining)', () => {
    const r = computeBalance([{ amount_ugx: 3000 }], [{ amount_ugx: 5000 }])
    expect(r.remaining).toBe(0)
    expect(r.credit).toBe(2000)
  })

  it('barter value counts toward paid', () => {
    const r = computeBalance(
      [{ amount_ugx: 6000 }],
      [{ amount_ugx: 2000, amount_barter_ugx: 4000 }],
    )
    expect(r.paid).toBe(6000)
    expect(r.remaining).toBe(0)
    expect(r.credit).toBe(0)
  })

  it('excludes voided charges', () => {
    const charges: BalanceCharge[] = [
      { amount_ugx: 5000 },
      { amount_ugx: 9000, voided: true },
    ]
    const r = computeBalance(charges, [])
    expect(r.charged).toBe(5000)
    expect(r.remaining).toBe(5000)
  })

  it('excludes non-paid payments', () => {
    const payments: BalancePayment[] = [
      { amount_ugx: 3000, status: 'paid' },
      { amount_ugx: 7000, status: 'void' },
      { amount_ugx: 1000, status: 'refunded' },
    ]
    const r = computeBalance([{ amount_ugx: 10000 }], payments)
    expect(r.paid).toBe(3000)
    expect(r.remaining).toBe(7000)
  })

  it('treats a payment with no status as paid (already filtered upstream)', () => {
    const r = computeBalance([{ amount_ugx: 4000 }], [{ amount_ugx: 4000 }])
    expect(r.paid).toBe(4000)
    expect(r.remaining).toBe(0)
  })

  // BILL-1 regression: "total paid" is the SUM of every partial payment, and
  // remaining shrinks with each one — never recomputed from only the latest.
  it('sums multiple partial payments into total paid', () => {
    const r = computeBalance(
      [{ amount_ugx: 36200 }],
      [
        { amount_ugx: 3000, created_at: '2026-07-14T09:00:00Z' },
        { amount_ugx: 2000, amount_barter_ugx: 1000, created_at: '2026-07-15T09:00:00Z' },
      ],
    )
    expect(r.charged).toBe(36200)
    expect(r.paid).toBe(6000)
    expect(r.remaining).toBe(30200)
    expect(r.credit).toBe(0)
  })

  // BILL-1 regression: multi-visit bills pool per patient — charges from
  // several visits plus a voided line, against payments across days.
  it('pools charges across visits and excludes voided lines from the pool', () => {
    const r = computeBalance(
      [
        { amount_ugx: 15000 }, // visit 1: pharmacy + consultation
        { amount_ugx: 14200 }, // visit 2: pharmacy (substituted) + consultation
        { amount_ugx: 7000 }, // visit 3: lab + consultation
        { amount_ugx: 7777, voided: true },
      ],
      [{ amount_ugx: 6000 }],
    )
    expect(r.charged).toBe(36200)
    expect(r.remaining).toBe(30200)
  })
})

describe('chargesSinceLastPayment', () => {
  it('returns 0 when there are no payments', () => {
    const charges: BalanceCharge[] = [
      { amount_ugx: 5000, created_at: '2026-07-06T10:00:00Z' },
    ]
    expect(chargesSinceLastPayment(charges, [])).toBe(0)
  })

  it('sums only non-voided charges created after the latest paid payment', () => {
    const charges: BalanceCharge[] = [
      { amount_ugx: 2000, created_at: '2026-07-06T08:00:00Z' }, // before payment
      { amount_ugx: 3000, created_at: '2026-07-06T11:00:00Z' }, // after payment
      { amount_ugx: 9000, created_at: '2026-07-06T12:00:00Z', voided: true }, // after but voided
    ]
    const payments: BalancePayment[] = [
      { amount_ugx: 1000, created_at: '2026-07-06T09:00:00Z' },
      { amount_ugx: 1000, created_at: '2026-07-06T10:00:00Z' }, // latest paid
    ]
    expect(chargesSinceLastPayment(charges, payments)).toBe(3000)
  })

  it('ignores non-paid payments when finding the latest payment time', () => {
    const charges: BalanceCharge[] = [
      { amount_ugx: 4000, created_at: '2026-07-06T10:30:00Z' },
    ]
    const payments: BalancePayment[] = [
      { amount_ugx: 1000, created_at: '2026-07-06T09:00:00Z', status: 'paid' },
      { amount_ugx: 5000, created_at: '2026-07-06T23:00:00Z', status: 'void' },
    ]
    // charge is after the paid payment (09:00) → counted, despite the later void
    expect(chargesSinceLastPayment(charges, payments)).toBe(4000)
  })
})
