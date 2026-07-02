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
      setupUrl="/dashboard/admin/printer"
    >
      <TestReceiptBody clinicName={clinicName} clinicPhone={clinicPhone} />
    </ReceiptShell>
  )
}
