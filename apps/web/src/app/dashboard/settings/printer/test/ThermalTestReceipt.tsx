'use client'

import { ReceiptShell, useReceiptPrint, WrappedLines } from '@/components/receipt/ReceiptShell'
import type { ClinicPrintSettings } from '@/lib/clinic-print-settings'

type Props = {
  clinicName: string
  clinicPhone: string | null
  printSettings: ClinicPrintSettings
}

function TestReceiptBody({
  clinicName,
  clinicPhone,
}: {
  clinicName: string
  clinicPhone: string | null
}) {
  const { hrHeavy, hrLight, sectionRule, centerLine, row } = useReceiptPrint()

  const printedAt = new Date().toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <>
      <section>
        <div className="bold">{centerLine(clinicName.toUpperCase())}</div>
        {clinicPhone && <div>{centerLine(clinicPhone)}</div>}
      </section>

      <div>{hrHeavy}</div>
      <div className="bold">{centerLine('PRINTER TEST')}</div>
      <div>{centerLine('Karibu Health')}</div>
      <div>{hrHeavy}</div>

      <section>
        <WrappedLines text="This slip checks alignment and cut position for visit summaries, billing receipts, and pharmacy labels." />
      </section>

      <div>{'\n' + sectionRule('RULER')}</div>
      <section>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i}>{row(`Line ${i + 1}`, '|'.repeat(8))}</div>
        ))}
      </section>

      <div>{'\n' + sectionRule('SAMPLE CHARGES')}</div>
      <section>
        <div>{row('OPD consultation', '5,000')}</div>
        <div>{row('HIV rapid test', '2,000')}</div>
        <div>{row('Urinalysis', '5,000')}</div>
      </section>

      <div>{'\n' + sectionRule('SAMPLE PAID')}</div>
      <section>
        <div>{row('Cash', 'UGX 12,000')}</div>
      </section>

      <div>{'\n' + hrLight}</div>
      <section>
        <div>{row('Total bill:', 'UGX 12,000')}</div>
        <div>{row('Total paid:', 'UGX 12,000')}</div>
        <div className="bold">{row('Remaining:', 'UGX 0')}</div>
      </section>

      <div>{'\n' + sectionRule('SAMPLE NOTE')}</div>
      <section>
        <WrappedLines text="Take your medicines with food. Return in 2 weeks if fever continues. Call the clinic if you feel worse." />
      </section>

      <div>{'\n' + hrHeavy}</div>
      <section>
        <div className="bold">{centerLine('CUT SHOULD BE BELOW')}</div>
        <div>{centerLine(`Printed ${printedAt}`)}</div>
      </section>
    </>
  )
}

/** Calibration receipt — mirrors billing + visit layout so cut and centering can be verified. */
export function ThermalTestReceipt({ clinicName, clinicPhone, printSettings }: Props) {
  return (
    <ReceiptShell
      layout={printSettings}
      autoPrint={printSettings.autoPrint}
      setupUrl="/dashboard/settings/printer"
    >
      <TestReceiptBody clinicName={clinicName} clinicPhone={clinicPhone} />
    </ReceiptShell>
  )
}

// ---------------------------------------------------------------------------
// Long test receipt — 12 pharmacy sections, verifies no mid-receipt cut
// ---------------------------------------------------------------------------

const LONG_TEST_MEDS = [
  { name: 'Amoxicillin 250mg/5ml', dose: 'Take 5ml three times a day with food', qty: '150ml', price: '2,500' },
  { name: 'Paracetamol 500mg', dose: 'Take 2 tablets every 8 hours as needed', qty: '24 tabs', price: '1,200' },
  { name: 'ORS Sachets', dose: 'Mix 1 sachet in 1L water, drink throughout day', qty: '6 sachets', price: '600' },
  { name: 'Cotrimoxazole 480mg', dose: 'Take 2 tablets twice daily for 5 days', qty: '20 tabs', price: '1,800' },
  { name: 'Metronidazole 200mg', dose: 'Take 1 tablet three times daily with food', qty: '21 tabs', price: '1,050' },
  { name: 'Zinc sulfate 20mg', dose: 'Give 1 tablet once a day for 10 days', qty: '10 tabs', price: '1,000' },
  { name: 'Ferrous sulfate + Folic', dose: 'Take 1 tablet once a day after meals', qty: '30 tabs', price: '1,500' },
  { name: 'Albendazole 400mg', dose: 'Chew 2 tablets as a single dose', qty: '2 tabs', price: '400' },
  { name: 'Vitamin A 200,000IU', dose: 'Give 1 capsule immediately', qty: '1 capsule', price: '500' },
  { name: 'Chloroquine 250mg', dose: 'Take 4 tabs now, then 2 tabs after 8 hours', qty: '10 tabs', price: '2,000' },
  { name: 'Doxycycline 100mg', dose: 'Take 1 capsule twice a day for 7 days', qty: '14 caps', price: '1,400' },
  { name: 'Mebendazole 100mg', dose: 'Take 1 tablet twice a day for 3 days', qty: '6 tabs', price: '600' },
] as const

function LongTestReceiptBody({
  clinicName,
  clinicPhone,
}: {
  clinicName: string
  clinicPhone: string | null
}) {
  const { hrHeavy, hrLight, sectionRule, centerLine, row } = useReceiptPrint()

  const printedAt = new Date().toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <>
      <section>
        <div className="bold">{centerLine(clinicName.toUpperCase())}</div>
        {clinicPhone && <div>{centerLine(clinicPhone)}</div>}
      </section>

      <div>{hrHeavy}</div>
      <div className="bold">{centerLine('PHARMACY SLIP — LONG TEST')}</div>
      <div>{centerLine('12 medicines — checks for mid-receipt cut')}</div>
      <div>{hrHeavy}</div>

      {LONG_TEST_MEDS.map((med, i) => (
        <section key={i}>
          <div>{'\n' + sectionRule(`MED ${i + 1}`)}</div>
          <div>{row(med.name, med.qty)}</div>
          <div>
            <WrappedLines text={`Dose: ${med.dose}`} />
          </div>
          <div>{row('Price', `UGX ${med.price}`)}</div>
        </section>
      ))}

      <div>{'\n' + hrLight}</div>
      <section>
        <div className="bold">{centerLine('CUT SHOULD BE BELOW')}</div>
        <div>{centerLine(`Printed ${printedAt}`)}</div>
      </section>
    </>
  )
}

/** Long calibration receipt — 12 pharmacy sections to expose mid-receipt auto-cuts. */
export function LongThermalTestReceipt({ clinicName, clinicPhone, printSettings }: Props) {
  return (
    <ReceiptShell
      layout={printSettings}
      autoPrint={printSettings.autoPrint}
      setupUrl="/dashboard/settings/printer"
    >
      <LongTestReceiptBody clinicName={clinicName} clinicPhone={clinicPhone} />
    </ReceiptShell>
  )
}
