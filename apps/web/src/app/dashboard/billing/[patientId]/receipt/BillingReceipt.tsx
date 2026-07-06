'use client'

import { useEffect, useMemo } from 'react'
import {
  ReceiptShell,
  useReceiptPrint,
} from '@/components/receipt/ReceiptShell'
import type { ClinicPrintSettings } from '@/lib/clinic-print-settings'
import { computeBalance } from '@/lib/billing-balance'

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

const PENDING_PAYMENT_KEY = (patientId: string) => `karibu:billing-receipt:${patientId}`

export type PendingReceiptPayment = {
  method: string
  amount_ugx: number
  amount_barter_ugx: number
  receipt_number: string | null
  recorded_at: number
}

export function stashPendingReceiptPayment(patientId: string, payment: PendingReceiptPayment) {
  try {
    sessionStorage.setItem(PENDING_PAYMENT_KEY(patientId), JSON.stringify(payment))
  } catch {
    // sessionStorage unavailable — server data only
  }
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

function readPendingPayment(patientId: string): PendingReceiptPayment | null {
  try {
    const raw = sessionStorage.getItem(PENDING_PAYMENT_KEY(patientId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as PendingReceiptPayment
    if (Date.now() - parsed.recorded_at > 60_000) return null
    return parsed
  } catch {
    return null
  }
}

function clearPendingPayment(patientId: string) {
  try {
    sessionStorage.removeItem(PENDING_PAYMENT_KEY(patientId))
  } catch {
    // ignore
  }
}

function paymentKey(p: BillingReceiptData['payments'][number]): string {
  return `${p.method}:${p.amount_ugx}:${p.amount_barter_ugx ?? 0}:${p.receipt_number ?? ''}`
}

function BillingReceiptBody({
  data,
  patientId,
}: {
  data: BillingReceiptData
  patientId: string
}) {
  const { hrHeavy, hrLight, sectionRule, centerLine, row } = useReceiptPrint()

  const mergedPayments = useMemo(() => {
    const pending = readPendingPayment(patientId)
    if (!pending) return data.payments

    const alreadyPresent = data.payments.some(
      (p) =>
        p.receipt_number &&
        pending.receipt_number &&
        p.receipt_number === pending.receipt_number,
    )
    if (alreadyPresent) return data.payments

    return [
      ...data.payments,
      {
        method: pending.method,
        amount_ugx: pending.amount_ugx,
        amount_barter_ugx: pending.amount_barter_ugx,
        barter_description: null,
        receipt_number: pending.receipt_number,
      },
    ]
  }, [data.payments, patientId])

  useEffect(() => {
    const pending = readPendingPayment(patientId)
    if (!pending) return
    const onServer = data.payments.some(
      (p) => p.receipt_number && pending.receipt_number && p.receipt_number === pending.receipt_number,
    )
    if (onServer) clearPendingPayment(patientId)
  }, [data.payments, patientId])

  const clinicName = data.clinic?.name || 'KaribuEHR'
  // WP3 D1: same balance util as the bill screen. Never prints a negative
  // Remaining — an unallocated payment prints as an explicit Credit line.
  const { charged, paid, remaining, credit } = computeBalance(data.charges, mergedPayments)

  const printedAt = new Date().toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  const receiptNo = mergedPayments.map((p) => p.receipt_number).filter(Boolean).slice(-1)[0] ?? null

  return (
    <>
      <section>
        <div className="bold">{centerLine(clinicName.toUpperCase())}</div>
        {data.clinic?.phone && <div>{centerLine(data.clinic.phone)}</div>}
      </section>

      <div>{hrHeavy}</div>
      <div className="bold">{centerLine('PAYMENT RECEIPT')}</div>
      <div>{hrHeavy}</div>

      <section>
        <div>Patient: {patientName(data.patient)}</div>
        {data.patient?.patient_id != null && <div>ID:      #{data.patient.patient_id}</div>}
      </section>

      {data.charges.length > 0 && (
        <>
          <div>{'\n' + sectionRule('CHARGES')}</div>
          <section>
            {data.charges.map((c, i) => (
              <div key={i}>{row(c.description, ugx(c.amount_ugx))}</div>
            ))}
          </section>
        </>
      )}

      {mergedPayments.length > 0 && (
        <>
          <div>{'\n' + sectionRule('PAID')}</div>
          <section>
            {mergedPayments.map((p, i) => {
              const barter = p.amount_barter_ugx ?? 0
              const label = METHOD_LABEL[p.method] ?? p.method
              const amt =
                barter > 0
                  ? p.amount_ugx > 0
                    ? `${ugx(p.amount_ugx)} + ${ugx(barter)} barter`
                    : `${ugx(barter)} barter`
                  : ugx(p.amount_ugx)
              return <div key={paymentKey(p) + i}>{row(label, amt)}</div>
            })}
          </section>
        </>
      )}

      <div>{'\n' + hrLight}</div>
      <section>
        <div>{row('Total bill:', `UGX ${ugx(charged)}`)}</div>
        <div>{row('Total paid:', `UGX ${ugx(paid)}`)}</div>
        {credit > 0 ? (
          <div className="bold">{row('Credit:', `UGX ${ugx(credit)}`)}</div>
        ) : (
          <div className="bold">{row('Remaining:', `UGX ${ugx(remaining)}`)}</div>
        )}
      </section>

      <div>{'\n' + hrHeavy}</div>
      <section>
        {receiptNo && <div>{centerLine(receiptNo)}</div>}
        <div>{centerLine(`Printed ${printedAt}`)}</div>
      </section>
    </>
  )
}

export function BillingReceipt({
  data,
  patientId,
  printSettings,
}: {
  data: BillingReceiptData
  patientId: string
  printSettings: ClinicPrintSettings
}) {
  return (
    <ReceiptShell layout={printSettings} autoPrint={printSettings.autoPrint}>
      <BillingReceiptBody data={data} patientId={patientId} />
    </ReceiptShell>
  )
}
