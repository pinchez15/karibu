'use client'

import { useEffect } from 'react'

/**
 * Shared A4 print shell for the inpatient print routes (B3 discharge summary,
 * B4 full admission chart). Distinct from the thermal ReceiptShell used for
 * 58/80mm OPD receipts — these are real documents (patient carries the
 * discharge summary to the next facility; the chart print goes in the
 * physical file or with a referral), so they render as normal HTML/tables,
 * not a monospace character grid.
 */
export function PrintDocShell({
  title,
  autoPrint = true,
  landscape = false,
  children,
}: {
  title: string
  autoPrint?: boolean
  landscape?: boolean
  children: React.ReactNode
}) {
  useEffect(() => {
    if (!autoPrint) return
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => window.print())
    })
    return () => cancelAnimationFrame(raf)
  }, [autoPrint])

  return (
    <>
      <style>{`
        @page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 14mm 12mm; }
        @media screen {
          body { background: #f3f4f6; margin: 0; }
          .doc-page {
            max-width: ${landscape ? '1050px' : '760px'};
            margin: 16px auto;
            padding: 28px 32px;
            background: white;
            box-shadow: 0 2px 12px rgba(0,0,0,0.08);
            border-radius: 4px;
          }
          .doc-toolbar {
            max-width: ${landscape ? '1050px' : '760px'};
            margin: 16px auto 0;
            display: flex;
            justify-content: space-between;
            gap: 8px;
            font-family: system-ui, sans-serif;
          }
          .doc-toolbar button {
            padding: 12px 20px;
            background: #1E3BAA;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
            min-height: 44px;
          }
          .doc-toolbar button.secondary {
            background: white;
            color: #111827;
            border: 1px solid #d1d5db;
          }
        }
        @media print {
          body { background: white; margin: 0; }
          .doc-toolbar, .no-print { display: none !important; }
          .doc-page { margin: 0; padding: 0; box-shadow: none; border-radius: 0; max-width: none; }
        }

        .doc-page {
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 12px;
          line-height: 1.5;
          color: #111827;
        }
        .doc-page h1 { font-size: 16px; margin: 0; }
        .doc-page h2 {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #374151;
          margin: 0 0 6px;
          padding-bottom: 3px;
          border-bottom: 1px solid #d1d5db;
        }
        .doc-section { margin-top: 16px; break-inside: avoid; }
        .doc-page-break { break-after: page; }
        .doc-table { width: 100%; border-collapse: collapse; font-size: 11px; }
        .doc-table th, .doc-table td {
          border: 1px solid #d1d5db;
          padding: 4px 6px;
          text-align: left;
          vertical-align: top;
        }
        .doc-table th { background: #f3f4f6; font-weight: 600; }
        .doc-kv { display: grid; grid-template-columns: repeat(2, 1fr); gap: 2px 20px; }
        .doc-kv div { display: flex; gap: 6px; }
        .doc-kv dt { font-weight: 600; color: #4b5563; white-space: nowrap; }
        .doc-kv dd { margin: 0; }
      `}</style>

      <div className="doc-toolbar no-print">
        <button type="button" className="secondary" onClick={() => window.close()}>
          Close
        </button>
        <button type="button" onClick={() => window.print()}>
          Print
        </button>
      </div>

      <div className="doc-page" lang="en" aria-label={title}>
        {children}
      </div>
    </>
  )
}
