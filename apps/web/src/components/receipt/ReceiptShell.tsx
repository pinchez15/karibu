'use client'

import { createContext, useContext, useEffect, useMemo } from 'react'
import {
  createThermalHelpers,
  DEFAULT_THERMAL_LAYOUT,
  previewWidthPx,
  type ThermalPrintHelpers,
  type ThermalPrintLayout,
} from '@/lib/thermal-print'

export type ReceiptPrintContextValue = ThermalPrintHelpers & {
  autoPrint: boolean
  setupUrl: string
}

const ReceiptPrintContext = createContext<ReceiptPrintContextValue | null>(null)

export function useReceiptPrint(): ReceiptPrintContextValue {
  const ctx = useContext(ReceiptPrintContext)
  if (!ctx) {
    const helpers = createThermalHelpers(DEFAULT_THERMAL_LAYOUT)
    return { ...helpers, autoPrint: true, setupUrl: '/dashboard/admin/printer' }
  }
  return ctx
}

/** Renders word-wrapped block text at receipt width (one div per line). */
export function WrappedLines({ text, className = 'block' }: { text: string; className?: string }) {
  const { wrapText } = useReceiptPrint()
  const lines = wrapText(text)
  if (lines.length === 0) return null
  return (
    <>
      {lines.map((line, i) => (
        <div key={i} className={className}>
          {line || ' '}
        </div>
      ))}
    </>
  )
}

export type ReceiptShellProps = {
  children: React.ReactNode
  lang?: string
  layout?: ThermalPrintLayout
  autoPrint?: boolean
  setupUrl?: string
}

export function ReceiptShell({
  children,
  lang = 'en',
  layout = DEFAULT_THERMAL_LAYOUT,
  autoPrint = true,
  setupUrl = '/dashboard/admin/printer',
}: ReceiptShellProps) {
  const ctx = useMemo(
    () => ({
      ...createThermalHelpers(layout),
      autoPrint,
      setupUrl,
    }),
    [layout, autoPrint, setupUrl],
  )

  const previewPx = previewWidthPx(layout.paperWidthMm)
  const paperLabel = `${layout.paperWidthMm}mm`

  useEffect(() => {
    if (!autoPrint) return
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => window.print())
    })
    return () => cancelAnimationFrame(raf)
  }, [autoPrint])

  return (
    <ReceiptPrintContext.Provider value={ctx}>
      <style>{`
        @page { size: ${layout.paperWidthMm}mm auto; margin: 0; }

        @media screen {
          html, body { margin: 0; padding: 0; }
          body { background: #f3f4f6; font-family: ui-monospace, Menlo, Consolas, 'Courier New', monospace; }
          .receipt-wrap { max-width: ${previewPx}px; margin: 16px auto; }
          .receipt {
            padding: 16px;
            background: white;
            box-shadow: 0 2px 12px rgba(0,0,0,0.08);
            border-radius: 4px;
          }
          .toolbar {
            max-width: ${previewPx}px;
            margin: 16px auto 0;
            display: flex;
            flex-wrap: wrap;
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
          .toolbar button.secondary { background: white; color: #111827; border: 1px solid #d1d5db; }
          .toolbar a.setup-link {
            font-size: 13px;
            color: #1E3BAA;
            text-decoration: underline;
            align-self: center;
            padding: 8px 4px;
          }
          .preview-note {
            max-width: ${previewPx}px;
            margin: 8px auto 16px;
            padding: 8px 12px;
            font-family: system-ui, sans-serif;
            font-size: 12px;
            color: #6b7280;
            text-align: center;
          }
        }

        @media print {
          html, body { margin: 0 !important; padding: 0 !important; width: ${layout.paperWidthMm}mm; }
          .toolbar, .preview-note { display: none !important; }
          .receipt-wrap { margin: 0; max-width: none; width: ${layout.paperWidthMm}mm; }
          .receipt {
            margin: 0;
            padding: 1.5mm 1mm;
            box-shadow: none;
            border-radius: 0;
            width: ${layout.paperWidthMm}mm;
            max-width: ${layout.paperWidthMm}mm;
            box-sizing: border-box;
          }
        }

        .receipt {
          font-family: ui-monospace, Menlo, Consolas, 'Courier New', monospace;
          font-size: 11px;
          line-height: 1.35;
          color: #000;
          white-space: pre;
        }
        .receipt .bold { font-weight: 700; }
        .receipt .block { white-space: pre; }
        .thermal-body {
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .thermal-body section { page-break-inside: avoid; break-inside: avoid; }
        .cut-feed { height: ${layout.cutFeedMm}mm; }
      `}</style>

      <div className="toolbar">
        <button type="button" className="secondary" onClick={() => window.close()}>
          Close
        </button>
        <a className="setup-link" href={setupUrl}>
          Alignment off?
        </a>
        <button type="button" onClick={() => window.print()}>
          Print
        </button>
      </div>
      <div className="preview-note">
        {paperLabel} thermal preview. In the print dialog, set margins to <strong>None</strong> if offered.
      </div>

      <div className="receipt-wrap">
        <div className="receipt thermal-body" lang={lang}>
          {children}
          <div className="cut-feed" aria-hidden="true">
            {ctx.cutFeed()}
          </div>
        </div>
      </div>
    </ReceiptPrintContext.Provider>
  )
}
