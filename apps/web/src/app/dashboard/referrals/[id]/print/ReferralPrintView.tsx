'use client'

import { useEffect } from 'react'

/** A4 referral / transfer summary — longer than a thermal receipt. */
export function ReferralPrintView({ summary }: { summary: string }) {
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => window.print())
    })
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <>
      <style>{`
        @page { size: A4 portrait; margin: 12mm; }
        @media screen {
          body { background: #f3f4f6; margin: 0; }
          .doc {
            max-width: 720px;
            margin: 16px auto;
            padding: 24px;
            background: white;
            box-shadow: 0 2px 12px rgba(0,0,0,0.08);
            border-radius: 4px;
          }
          .toolbar {
            max-width: 720px;
            margin: 16px auto 0;
            display: flex;
            justify-content: space-between;
            gap: 8px;
            font-family: system-ui, sans-serif;
          }
          .toolbar button {
            padding: 12px 20px;
            background: #1E3BAA;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            min-height: 44px;
          }
          .toolbar button.secondary {
            background: white;
            color: #111827;
            border: 1px solid #d1d5db;
          }
          .preview-note {
            max-width: 720px;
            margin: 8px auto 16px;
            padding: 8px 12px;
            font-family: system-ui, sans-serif;
            font-size: 12px;
            color: #6b7280;
            text-align: center;
          }
        }
        @media print {
          body { background: white; margin: 0; }
          .toolbar, .preview-note { display: none !important; }
          .doc { margin: 0; padding: 0; box-shadow: none; border-radius: 0; max-width: none; }
        }
        .doc {
          font-family: ui-monospace, Menlo, Consolas, 'Courier New', monospace;
          font-size: 11px;
          line-height: 1.45;
          color: #000;
          white-space: pre-wrap;
        }
      `}</style>

      <div className="toolbar no-print">
        <button type="button" className="secondary" onClick={() => window.close()}>
          Close
        </button>
        <button type="button" onClick={() => window.print()}>
          Print
        </button>
      </div>
      <div className="preview-note no-print">
        A4 referral summary. Printing happens automatically.
      </div>
      <div className="doc" lang="en">
        {summary}
      </div>
    </>
  )
}
