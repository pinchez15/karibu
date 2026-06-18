'use client'

import { useEffect } from 'react'

// Shared 58mm thermal-receipt shell, extracted from the visit-summary print
// view so the billing and pharmacy receipts render identically on the same
// ESC/POS printers. 32 chars per line at ~10pt monospace.
export const RECEIPT_WIDTH_CHARS = 32
export const HR_HEAVY = '='.repeat(RECEIPT_WIDTH_CHARS)
export const HR_LIGHT = '-'.repeat(RECEIPT_WIDTH_CHARS)

/** Center a label inside a rule of dashes, e.g. "----- TOTAL -----". */
export function sectionRule(label: string): string {
  const inner = ` ${label} `
  const remaining = RECEIPT_WIDTH_CHARS - inner.length
  if (remaining <= 0) return inner.slice(0, RECEIPT_WIDTH_CHARS)
  const left = Math.floor(remaining / 2)
  return '-'.repeat(left) + inner + '-'.repeat(remaining - left)
}

/** Left-label + right-value on one 32-char line (e.g. "Paid:        UGX 5,000"). */
export function row(label: string, value: string): string {
  const space = RECEIPT_WIDTH_CHARS - label.length - value.length
  if (space < 1) return `${label} ${value}`
  return label + ' '.repeat(space) + value
}

export function ReceiptShell({ children, lang = 'en' }: { children: React.ReactNode; lang?: string }) {
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => window.print())
    })
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <>
      <style>{`
        @page { size: 58mm auto; margin: 2mm; }
        @media screen {
          body { background: #f3f4f6; margin: 0; font-family: ui-monospace, Menlo, Consolas, 'Courier New', monospace; }
          .receipt { max-width: 320px; margin: 16px auto; padding: 16px; background: white; box-shadow: 0 2px 12px rgba(0,0,0,0.08); border-radius: 4px; }
          .toolbar { max-width: 320px; margin: 16px auto 0; display: flex; justify-content: space-between; gap: 8px; font-family: system-ui, sans-serif; }
          .toolbar button { padding: 12px 20px; background: #1E3BAA; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; min-height: 44px; }
          .toolbar button.secondary { background: white; color: #111827; border: 1px solid #d1d5db; }
          .preview-note { max-width: 320px; margin: 8px auto 16px; padding: 8px 12px; font-family: system-ui, sans-serif; font-size: 12px; color: #6b7280; text-align: center; }
        }
        @media print {
          body { background: white; margin: 0; }
          .toolbar, .preview-note { display: none !important; }
          .receipt { margin: 0; padding: 0; box-shadow: none; border-radius: 0; max-width: none; }
        }
        .receipt { font-family: ui-monospace, Menlo, Consolas, 'Courier New', monospace; font-size: 11px; line-height: 1.35; color: #000; white-space: pre; }
        .receipt .center { text-align: center; }
        .receipt .bold { font-weight: 700; }
        .receipt .block { white-space: pre-wrap; }
        .receipt section { page-break-inside: avoid; }
      `}</style>

      <div className="toolbar">
        <button className="secondary" onClick={() => window.close()}>Close</button>
        <button onClick={() => window.print()}>Print</button>
      </div>
      <div className="preview-note">Preview at 58mm receipt width. Printing happens automatically.</div>

      <div className="receipt" lang={lang}>{children}</div>
    </>
  )
}
