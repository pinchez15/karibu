import { describe, expect, it } from 'vitest'
import { statementRowsFromCsv } from './statement'

describe('statementRowsFromCsv', () => {
  it('reads money in, skips money out and blank amounts', () => {
    const csv = 'Date,Transaction ID,From,Sender Number,Amount\n20/11/2026 14:32,123456,KITANDA HC III,0772123456,"130,000"\n21/11/2026,123457,FUEL,0700,-50000\n22/11/2026,123458,X,0700,\n'
    const { rows, skipped } = statementRowsFromCsv(csv, 'momo_mtn')
    expect(skipped).toBe(2)
    expect(rows).toEqual([{
      amount: 130000, method: 'momo_mtn', reference: '123456', payer_phone: '0772123456', payer_name: 'KITANDA HC III',
      paid_at: '2026-11-20T11:32:00.000Z', raw_evidence: '20/11/2026 14:32,123456,KITANDA HC III,0772123456,130,000',
    }])
  })

  it('prefers a credit column and reads the method per row', () => {
    const { rows } = statementRowsFromCsv('date,credit,debit,narration,channel\n2026-11-20,65000,,BUKOTO HC,Airtel Money\n2026-11-21,,9000,CHARGES,bank\n')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ amount: 65000, method: 'airtel', payer_name: 'BUKOTO HC' })
  })

  it('refuses a file with no amount column', () => {
    expect(() => statementRowsFromCsv('date,name\n2026-11-20,X\n')).toThrow('NO_AMOUNT_COLUMN')
  })
})
