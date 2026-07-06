'use client'

import { ReceiptShell, useReceiptPrint } from '@/components/receipt/ReceiptShell'
import { layoutFromPaperWidth, type PaperWidthMm } from '@/lib/thermal-print'

function FixtureBody({ sections }: { sections: number }) {
  const { hrHeavy, hrLight, sectionRule, centerLine, row } = useReceiptPrint()
  return (
    <>
      <section>
        <div className="bold">{centerLine('SSUNGA HC III')}</div>
        <div>{centerLine('+256 700 123 456')}</div>
      </section>

      <div>{hrHeavy}</div>
      <div className="bold">{centerLine('PHARMACY SLIP')}</div>
      <div>{centerLine('Pagination regression fixture')}</div>
      <div>{hrHeavy}</div>

      {Array.from({ length: sections }, (_, i) => (
        <section key={i}>
          <div>{'\n' + sectionRule(`MED ${i + 1}`)}</div>
          <div>{row(`Medicine ${i + 1} — long name here`, '14 tabs')}</div>
          <div>{row('Dose', 'Take 1 tablet twice daily')}</div>
          <div>{row('Price', 'UGX 1,400')}</div>
        </section>
      ))}

      <div>{'\n' + hrLight}</div>
      <section>
        <div className="bold">{centerLine('END OF SLIP')}</div>
      </section>
    </>
  )
}

export function ReceiptFixtureClient({
  paperWidthMm,
  sections,
}: {
  paperWidthMm: PaperWidthMm
  sections: number
}) {
  const layout = layoutFromPaperWidth(paperWidthMm)
  return (
    <ReceiptShell layout={layout} autoPrint={false} setupUrl="/dashboard/settings/printer">
      <FixtureBody sections={sections} />
    </ReceiptShell>
  )
}
