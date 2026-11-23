import { describe, expect, it } from 'vitest'
import { parseMomoSms, splitMessages } from './momo'

// These fixtures follow the SHAPES of MTN MoMo and Airtel Money (Uganda)
// "money received" confirmations: the wording operators have used across
// versions, with invented names, numbers and IDs. They are reconstructions,
// not captures. Replace or extend them with messages forwarded from a real
// partner phone before relying on the parser in the field
// (docs/karibu-office-spec.md, Phase 1 acceptance criteria).
const MTN = [
  {
    sms: 'You have received UGX 130,000 from NAKATO SARAH (256772123456) on 2026-11-20 14:32:10. Reason: Karibu Nov. Your new balance is UGX 1,250,000. Transaction ID: 23456789012.',
    want: { method: 'momo_mtn', amount: 130000, reference: '23456789012', payer_phone: '256772123456', payer_name: 'NAKATO SARAH', paid_at: '2026-11-20T11:32:10.000Z' },
  },
  {
    sms: "Y'ello. You have received UGX 65,000 from KITANDA HC III, 0782555123 on 05/11/2026 at 10:21 AM. Reason: . New balance: UGX 75,400. Transaction ID 9988776655.",
    want: { method: 'momo_mtn', amount: 65000, reference: '9988776655', payer_phone: '0782555123', payer_name: 'KITANDA HC III', paid_at: '2026-11-05T07:21:00.000Z' },
  },
  {
    sms: 'MTN MoMo: You have received 150000 UGX from 256701000222 JOHN SSEMPIJJA. Fee UGX 0. Bal UGX 890,000. TxnId: 31415926535. 20 Nov 2026 09:05',
    want: { method: 'momo_mtn', amount: 150000, reference: '31415926535', payer_phone: '256701000222', payer_name: 'JOHN SSEMPIJJA', paid_at: '2026-11-20T06:05:00.000Z' },
  },
] as const

const AIRTEL = [
  {
    sms: 'RECEIVED. TID 104857600123. UGX 130,000 from 0752123456 OKELLO JAMES. Bal UGX 1,250,000. Date 20-November-2026 14:32.',
    want: { method: 'airtel', amount: 130000, reference: '104857600123', payer_phone: '0752123456', payer_name: 'OKELLO JAMES', paid_at: '2026-11-20T11:32:00.000Z' },
  },
  {
    sms: 'You have received UGX 260,000 from 0701234567, BUKOTO MEDICAL CENTRE. Trans ID: 77665544332. Bal: UGX 445,000. Airtel Money.',
    want: { method: 'airtel', amount: 260000, reference: '77665544332', payer_phone: '0701234567', payer_name: 'BUKOTO MEDICAL CENTRE', paid_at: null },
  },
] as const

describe('parseMomoSms', () => {
  it.each([...MTN, ...AIRTEL])('reads $want.method $want.amount', ({ sms, want }) => {
    const result = parseMomoSms(sms)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.payment).toMatchObject(want)
    expect(result.payment.currency).toBe('UGX')
    expect(result.payment.raw_evidence).toBe(sms)
  })

  it('takes the amount received, never the balance', () => {
    const r = parseMomoSms('You have received UGX 20,000 from 0772000111 A B. Your new balance is UGX 9,999,999. Transaction ID: 123456789')
    expect(r.ok && r.payment.amount).toBe(20000)
  })

  it('refuses money going out, so a partner cannot record their own spending as income', () => {
    expect(parseMomoSms('You have sent UGX 50,000 to 0772000111 FUEL STATION. Transaction ID: 555666777. New balance UGX 10,000.')).toEqual({ ok: false, reason: 'not_received' })
    expect(parseMomoSms('You have withdrawn UGX 100,000. Fee UGX 1,500. Transaction ID: 222333444')).toEqual({ ok: false, reason: 'not_received' })
  })

  it('reports what is missing instead of guessing', () => {
    expect(parseMomoSms('   ')).toEqual({ ok: false, reason: 'empty' })
    expect(parseMomoSms('You have received airtime from 0772000111')).toEqual({ ok: false, reason: 'no_amount' })
  })

  it('still records a payment when the reference or sender is missing', () => {
    const r = parseMomoSms('You have received UGX 65,000.')
    expect(r.ok && r.payment).toMatchObject({ amount: 65000, reference: null, payer_phone: null, payer_name: null, paid_at: null })
  })

  it('uses the chosen network when the message does not say', () => {
    const r = parseMomoSms('You have received UGX 65,000 from 0752000111 X Y.', 'airtel')
    expect(r.ok && r.payment.method).toBe('airtel')
  })
})

describe('splitMessages', () => {
  it('splits a paste of several messages on blank lines', () => {
    expect(splitMessages(`${MTN[0].sms}\n\n${AIRTEL[0].sms}`)).toHaveLength(2)
    expect(splitMessages(MTN[0].sms)).toHaveLength(1)
  })
})
