'use client'

import { ReceiptShell, HR_HEAVY, HR_LIGHT, sectionRule, row } from '@/components/receipt/ReceiptShell'

export type BillingReceiptData = {
  patient: {
    display_name: string | null
    first_name: string | null
    last_name: string | null
    patient_id: number | null
  } | null
  clinic: { name: string; phone: string | null; umdpc_number: string | null } | null
  charges: { description: string; amount_ugx: number }[]
  payments: {
    method: string
    amount_ugx: number
    amount_barter_ugx?: number
    barter_description?: string | null
    receipt_number: string | null
  }[]
}

function patientName(p: BillingReceiptData['patient']): string {
  if (!p) return 'Patient'
  const composed = [p.first_name, p.last_name].filter(Boolean).join(' ')
  return composed || p.display_name || 'Patient'
}

function ugx(n: number): string {
  return n.toLocaleString('en-US')
}

const METHOD_LABEL: Record<string, string> = {
  cash: 'Cash',
  mtn_momo: 'MTN MoMo',
  airtel_money: 'Airtel Money',
  barter: 'Barter',
  mixed: 'Mixed',
}

export function BillingReceipt({ data }: { data: BillingReceiptData }) {
  const clinicName = data.clinic?.name || 'KaribuEHR'
  const charged = data.charges.reduce((s, c) => s + c.amount_ugx, 0)
  const paid = data.payments.reduce(
    (s, p) => s + p.amount_ugx + (p.amount_barter_ugx ?? 0),
    0,
  )
  const balance = charged - paid

  const printedAt = new Date().toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  // Prefer the latest payment's receipt number as the document id.
  const receiptNo = data.payments.map((p) => p.receipt_number).filter(Boolean).slice(-1)[0] ?? null

  return (
    <ReceiptShell>
      <section>
        <div className="center bold">{clinicName.toUpperCase()}</div>
        {data.clinic?.phone && <div className="center">{data.clinic.phone}</div>}
      </section>

      <div>{HR_HEAVY}</div>
      <div className="center bold">PAYMENT RECEIPT</div>
      <div>{HR_HEAVY}</div>

      <section>
        <div>Patient: {patientName(data.patient)}</div>
        {data.patient?.patient_id != null && <div>ID:      #{data.patient.patient_id}</div>}
      </section>

      {data.charges.length > 0 && (
        <>
          <div>{'\n' + sectionRule('CHARGES')}</div>
          <section>
            {data.charges.map((c, i) => (
              <div key={i} className="block">
                {row(c.description.slice(0, 22), ugx(c.amount_ugx))}
              </div>
            ))}
          </section>
        </>
      )}

      {data.payments.length > 0 && (
        <>
          <div>{'\n' + sectionRule('PAID')}</div>
          <section>
            {data.payments.map((p, i) => {
              const barter = p.amount_barter_ugx ?? 0
              const label =
                barter > 0 && p.amount_ugx > 0
                  ? `${METHOD_LABEL[p.method] ?? p.method}`
                  : METHOD_LABEL[p.method] ?? p.method
              const amt =
                barter > 0
                  ? p.amount_ugx > 0
                    ? `${ugx(p.amount_ugx)} + ${ugx(barter)} barter`
                    : `${ugx(barter)} barter`
                  : ugx(p.amount_ugx)
              return <div key={i}>{row(label.slice(0, 22), amt)}</div>
            })}
          </section>
        </>
      )}

      <div>{'\n' + HR_LIGHT}</div>
      <section>
        <div>{row('Total charged:', `UGX ${ugx(charged)}`)}</div>
        <div>{row('Total paid:', `UGX ${ugx(paid)}`)}</div>
        <div className="bold">{row('Balance:', `UGX ${ugx(balance)}`)}</div>
      </section>

      <div>{'\n' + HR_HEAVY}</div>
      <section>
        {receiptNo && <div className="center">{receiptNo}</div>}
        <div className="center">Printed {printedAt}</div>
      </section>
      <div>{'\n\n\n'}</div>
    </ReceiptShell>
  )
}
