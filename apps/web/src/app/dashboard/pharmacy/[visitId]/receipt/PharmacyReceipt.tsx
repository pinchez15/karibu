'use client'

import { ReceiptShell, useReceiptPrint, WrappedLines } from '@/components/receipt/ReceiptShell'
import type { ClinicPrintSettings } from '@/lib/clinic-print-settings'
import {
  englishSig,
  lugandaSig,
  ENGLISH_SAFETY,
  LUGANDA_SAFETY,
} from '@/lib/pharmacy-receipt-i18n'

export type ReceiptHeader = {
  visitId: string
  visitDate: string
  patient: {
    display_name: string | null
    first_name: string | null
    last_name: string | null
    patient_id: number | null
  } | null
  clinic: { name: string; phone: string | null; umdpc_number: string | null } | null
}

export type RxLine = {
  name: string
  strength: string | null
  quantity: string | null
  dose_text: string | null
  route_text: string | null
  frequency_text: string | null
  duration_text: string | null
}

function patientName(p: ReceiptHeader['patient']): string {
  if (!p) return 'Patient'
  const composed = [p.first_name, p.last_name].filter(Boolean).join(' ')
  return composed || p.display_name || 'Patient'
}

function PharmacyReceiptBody({
  header,
  lines,
}: {
  header: ReceiptHeader
  lines: RxLine[]
}) {
  const { hrHeavy, hrLight, sectionRule, centerLine } = useReceiptPrint()

  const clinicName = header.clinic?.name || 'KaribuEHR'
  const date = new Date(header.visitDate).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  const printedAt = new Date().toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  const dateForId = header.visitDate.slice(0, 10).replace(/-/g, '')
  const docId =
    header.patient?.patient_id != null
      ? `KH-RX-${header.patient.patient_id}-${dateForId}`
      : `KH-RX-${header.visitId.slice(0, 8)}-${dateForId}`

  return (
    <>
      <section>
        <div className="bold">{centerLine(clinicName.toUpperCase())}</div>
        {header.clinic?.phone && <div>{centerLine(header.clinic.phone)}</div>}
      </section>

      <div>{hrHeavy}</div>
      <div className="bold">{centerLine('MEDICINE / EDDAGALA')}</div>
      <div>{centerLine(date)}</div>
      <div>{hrHeavy}</div>

      <section>
        <div>Patient: {patientName(header.patient)}</div>
        {header.patient?.patient_id != null && <div>ID:      #{header.patient.patient_id}</div>}
      </section>

      {lines.length === 0 ? (
        <div>{'\n'}No medicines dispensed.</div>
      ) : (
        lines.map((l, i) => {
          const en = englishSig(l)
          const lg = lugandaSig(l)
          return (
            <section key={i}>
              <div>{'\n' + sectionRule(`${i + 1}`)}</div>
              <div className="bold">
                <WrappedLines text={`${l.name}${l.strength ? ` ${l.strength}` : ''}`} />
              </div>
              {l.quantity && <WrappedLines text={`Qty: ${l.quantity}`} />}
              {en && <WrappedLines text={`EN: ${en}`} />}
              {lg && <WrappedLines text={`LUG: ${lg}`} />}
            </section>
          )
        })
      )}

      <div>{'\n' + hrLight}</div>
      <section>
        {ENGLISH_SAFETY.map((s, i) => (
          <WrappedLines key={`en${i}`} text={s} />
        ))}
        {LUGANDA_SAFETY.map((s, i) => (
          <WrappedLines key={`lg${i}`} text={s} />
        ))}
      </section>

      <div>{'\n' + hrHeavy}</div>
      <section>
        <div>{centerLine(docId)}</div>
        <div>{centerLine(`Printed ${printedAt}`)}</div>
      </section>
    </>
  )
}

export function PharmacyReceipt({
  header,
  lines,
  printSettings,
}: {
  header: ReceiptHeader
  lines: RxLine[]
  printSettings: ClinicPrintSettings
}) {
  return (
    <ReceiptShell layout={printSettings} autoPrint={printSettings.autoPrint}>
      <PharmacyReceiptBody header={header} lines={lines} />
    </ReceiptShell>
  )
}
