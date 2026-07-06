'use client'

/**
 * Manual thermal printer wizard. Future: AI photo calibration loop — see
 * docs/thermal-printer-setup.md § "AI calibration loop" (parked, not scheduled).
 */

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { CheckCircle2, ExternalLink, Loader2, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { updateClinicPrintSettings } from './actions'
import type { ClinicPrintSettings } from '@/lib/clinic-print-settings'
import type { PaperWidthMm } from '@/lib/thermal-print'

const CUT_FEED_PRESETS = [
  { mm: 10, label: 'Less feed', hint: 'Cut lands closer to text' },
  { mm: 14, label: 'Normal', hint: 'Default for most printers' },
  { mm: 20, label: 'More feed', hint: 'Use if cut slices through footer' },
] as const

type Step = 1 | 2 | 3

export function PrinterSetupClient({ initial }: { initial: ClinicPrintSettings }) {
  const [step, setStep] = useState<Step>(initial.setupCompletedAt ? 3 : 1)
  const [paperWidthMm, setPaperWidthMm] = useState<PaperWidthMm>(initial.paperWidthMm)
  const [cutFeedMm, setCutFeedMm] = useState(initial.cutFeedMm)
  const [autoPrint, setAutoPrint] = useState(initial.autoPrint)
  const [checkedConnect, setCheckedConnect] = useState({
    usb: false,
    power: false,
    driver: false,
  })
  const [verify, setVerify] = useState({ centered: false, cut: false, readable: false })
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()

  const allConnectChecked = checkedConnect.usb && checkedConnect.power && checkedConnect.driver
  const allVerifyChecked = verify.centered && verify.cut && verify.readable

  function save(markComplete: boolean, onSuccess?: () => void) {
    setError(null)
    setSaved(false)
    start(async () => {
      const r = await updateClinicPrintSettings({
        paperWidthMm,
        cutFeedMm,
        autoPrint,
        markSetupComplete: markComplete,
      })
      if (!r.success) {
        setError(r.error)
        return
      }
      setSaved(true)
      onSuccess?.()
    })
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-base font-semibold">Why thermal?</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Every patient leaving Karibu needs a paper record of their visit and proof of payment.
          Thermal rolls are cheap, dust-proof, and never run out of ink mid-shift — so one printer
          at the desk can replace both the receipt book and the inkjet discharge summary.
        </p>
      </div>

      <ol className="flex gap-2 text-xs font-medium">
        {([1, 2, 3] as Step[]).map((n) => (
          <li
            key={n}
            className={`rounded-full px-3 py-1 ${
              step === n ? 'bg-cobalt text-white' : 'bg-muted text-muted-foreground'
            }`}
          >
            Step {n}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Connect the printer</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Karibu prints through your laptop browser. The printer must be installed at the
              operating-system level first.
            </p>
          </div>
          <ul className="space-y-3 text-sm">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1"
                checked={checkedConnect.usb}
                onChange={(e) => setCheckedConnect((c) => ({ ...c, usb: e.target.checked }))}
              />
              <span>USB cable connected to this computer (or Bluetooth paired)</span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1"
                checked={checkedConnect.power}
                onChange={(e) => setCheckedConnect((c) => ({ ...c, power: e.target.checked }))}
              />
              <span>Printer is powered on and has paper loaded</span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1"
                checked={checkedConnect.driver}
                onChange={(e) => setCheckedConnect((c) => ({ ...c, driver: e.target.checked }))}
              />
              <span>Driver installed — printer appears in Windows / Mac printer list</span>
            </label>
          </ul>

          <details className="rounded-lg border border-line-soft bg-muted/30 p-3 text-sm">
            <summary className="cursor-pointer font-medium">Print dialog tips</summary>
            <ul className="mt-2 list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Set <strong>margins</strong> to <strong>None</strong> (or Minimum)</li>
              <li>Paper size: <strong>58mm</strong> or <strong>80mm</strong> roll — match your hardware</li>
              <li>Scale: <strong>100%</strong> — not &quot;Fit to page&quot;</li>
              <li>Mark this printer as <strong>default</strong> so staff do not pick the wrong device</li>
            </ul>
          </details>

          <Button disabled={!allConnectChecked} onClick={() => setStep(2)}>
            Continue
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Print a test receipt</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              The test slip mirrors a real billing receipt plus a short visit note. Use it to
              confirm centering and where the auto-cutter fires.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Paper width</Label>
              <div className="flex gap-2">
                {([58, 80] as PaperWidthMm[]).map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setPaperWidthMm(w)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      paperWidthMm === w
                        ? 'border-cobalt bg-cobalt-soft text-cobalt'
                        : 'border-border hover:border-cobalt/40'
                    }`}
                  >
                    {w}mm
                    <span className="block text-xs font-normal text-muted-foreground">
                      {w === 58 ? '32 chars' : '48 chars'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Cut feed</Label>
              <div className="space-y-1">
                {CUT_FEED_PRESETS.map((p) => (
                  <button
                    key={p.mm}
                    type="button"
                    onClick={() => setCutFeedMm(p.mm)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                      cutFeedMm === p.mm
                        ? 'border-cobalt bg-cobalt-soft'
                        : 'border-border hover:border-cobalt/40'
                    }`}
                  >
                    <span className="font-medium">{p.label}</span>
                    <span className="text-xs text-muted-foreground"> — {p.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={autoPrint}
              onChange={(e) => setAutoPrint(e.target.checked)}
            />
            Open print dialog automatically when a receipt opens
          </label>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="gap-2"
              disabled={pending}
              onClick={() => save(false)}
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save preferences
            </Button>
            <Button
              className="gap-2"
              disabled={pending}
              onClick={() =>
                save(false, () => {
                  window.open('/dashboard/settings/printer/test', '_blank', 'noopener,noreferrer')
                })
              }
            >
              <Printer className="h-4 w-4" />
              Print test receipt
              <ExternalLink className="h-3.5 w-3.5 opacity-60" />
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              disabled={pending}
              onClick={() =>
                save(false, () => {
                  window.open(
                    '/dashboard/settings/printer/test?long=1',
                    '_blank',
                    'noopener,noreferrer',
                  )
                })
              }
            >
              <Printer className="h-4 w-4" />
              Print long test receipt
              <ExternalLink className="h-3.5 w-3.5 opacity-60" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Use &quot;Print long test receipt&quot; (12 medicines) to check that the printer does not cut
            in the middle of the slip.
          </p>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button onClick={() => setStep(3)}>I printed the test — continue</Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Does the test receipt look right?</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Adjust paper width or cut feed in step 2 and print again until all three are true.
            </p>
          </div>

          <ul className="space-y-3 text-sm">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1"
                checked={verify.centered}
                onChange={(e) => setVerify((v) => ({ ...v, centered: e.target.checked }))}
              />
              <span>Text is centered on the paper (no wide blank strip on one side)</span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1"
                checked={verify.cut}
                onChange={(e) => setVerify((v) => ({ ...v, cut: e.target.checked }))}
              />
              <span>Cut is below &quot;CUT SHOULD BE BELOW&quot; — not through totals or notes</span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1"
                checked={verify.readable}
                onChange={(e) => setVerify((v) => ({ ...v, readable: e.target.checked }))}
              />
              <span>Nothing is cut off on the right edge</span>
            </label>
          </ul>

          {initial.setupCompletedAt && (
            <p className="flex items-center gap-2 text-sm text-green">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Setup completed{' '}
              {new Date(initial.setupCompletedAt).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </p>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
          {saved && (
            <p className="text-sm text-green">Saved. All receipts use these settings.</p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setStep(2)}>
              Back to test print
            </Button>
            <Button
              disabled={!allVerifyChecked || pending}
              className="gap-2"
              onClick={() => save(true)}
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Finish setup
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-5 space-y-2">
        <h3 className="text-sm font-semibold">What prints on thermal</h3>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>Visit summary — diagnosis, medicines, patient note, clinic phone</li>
          <li>Billing receipt — charges, payments, balance</li>
          <li>Pharmacy slip — bilingual medicine instructions</li>
        </ul>
        <Button variant="outline" size="sm" className="mt-2 gap-2" asChild>
          <Link href="/dashboard/settings/printer/test" target="_blank" rel="noopener noreferrer">
            <Printer className="h-4 w-4" />
            Print test again
          </Link>
        </Button>
      </div>
    </div>
  )
}
