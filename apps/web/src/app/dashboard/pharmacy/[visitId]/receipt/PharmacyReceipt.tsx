'use client'

import { ReceiptShell, HR_HEAVY, HR_LIGHT, sectionRule } from '@/components/receipt/ReceiptShell'
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

export function PharmacyReceipt({ header, lines }: { header: ReceiptHeader; lines: RxLine[] }) {
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
    <ReceiptShell>
      <section>
        <div className="center bold">{clinicName.toUpperCase()}</div>
        {header.clinic?.phone && <div className="center">{header.clinic.phone}</div>}
      </section>

      <div>{HR_HEAVY}</div>
      <div className="center bold">MEDICINE / EDDAGALA</div>
      <div className="center">{date}</div>
      <div>{HR_HEAVY}</div>

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
              <div className="bold block">
                {l.name}
                {l.strength ? ` ${l.strength}` : ''}
              </div>
              {l.quantity && <div className="block">Qty: {l.quantity}</div>}
              {en && (
                <div className="block">
                  EN: {en}
                </div>
              )}
              {lg && (
                <div className="block">
                  LUG: {lg}
                </div>
              )}
            </section>
          )
        })
      )}

      <div>{'\n' + HR_LIGHT}</div>
      <section>
        {ENGLISH_SAFETY.map((s, i) => (
          <div key={`en${i}`} className="block">
            {s}
          </div>
        ))}
        {LUGANDA_SAFETY.map((s, i) => (
          <div key={`lg${i}`} className="block">
            {s}
          </div>
        ))}
      </section>

      <div>{'\n' + HR_HEAVY}</div>
      <section>
        <div className="center">{docId}</div>
        <div className="center">Printed {printedAt}</div>
      </section>
      <div>{'\n\n\n'}</div>
    </ReceiptShell>
  )
}
