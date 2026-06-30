'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createReferral, type ReferralFormContext } from '../actions'

const URGENCY_OPTIONS = [
  { value: 'routine', label: 'Routine' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'emergency', label: 'Emergency' },
] as const

export function ReferralFormClient({ context }: { context: ReferralFormContext }) {
  const [toFacility, setToFacility] = useState('')
  const [urgency, setUrgency] = useState<'routine' | 'urgent' | 'emergency'>('urgent')
  const [reason, setReason] = useState('')
  const [clinicalSummary, setClinicalSummary] = useState(context.defaultSummary)
  const [transportMode, setTransportMode] = useState('')
  const [printableSummary, setPrintableSummary] = useState<string | null>(null)
  const [referralId, setReferralId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const handleSubmit = () => {
    setError(null)
    startTransition(async () => {
      const result = await createReferral({
        visitId: context.visitId,
        toFacility,
        urgency,
        reason,
        clinicalSummary,
        transportMode,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setPrintableSummary(result.summary)
      setReferralId(result.referralId)
      window.open(`/dashboard/referrals/${result.referralId}/print`, '_blank', 'noopener,noreferrer')
    })
  }

  const printHref = referralId ? `/dashboard/referrals/${referralId}/print` : null

  const handlePrint = () => {
    if (!printHref) return
    window.open(printHref, '_blank', 'noopener,noreferrer')
  }

  if (printableSummary) {
    return (
      <div className="max-w-2xl space-y-4">
        <p className="text-sm text-accent font-medium">Referral recorded. Print or share this summary with the patient.</p>
        <pre className="bg-card border border-border rounded-lg p-4 text-xs whitespace-pre-wrap font-mono leading-relaxed">
          {printableSummary}
        </pre>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={handlePrint} className="gap-2" disabled={!printHref}>
            <Printer className="h-4 w-4" />
            Print summary
          </Button>
          {printHref && (
            <Button type="button" variant="outline" asChild>
              <a href={printHref} target="_blank" rel="noopener noreferrer">
                Open print preview
              </a>
            </Button>
          )}
          <Button type="button" variant="outline" asChild>
            <Link href={`/dashboard/visits/${context.visitId}`}>Back to visit</Link>
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/dashboard/orders?tab=referrals">View in Orders</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="text-sm text-muted-foreground">
        Patient: <span className="font-medium text-foreground">{context.patientName}</span>
        {' · '}
        {context.patientNumber}
      </div>

      <div className="space-y-2">
        <Label htmlFor="toFacility">Receiving facility (HCIV / hospital)</Label>
        <input
          id="toFacility"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="e.g. Ssunga HCIV"
          value={toFacility}
          onChange={(e) => setToFacility(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>Urgency</Label>
        <div className="flex flex-wrap gap-2">
          {URGENCY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setUrgency(opt.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium border ${
                urgency === opt.value
                  ? 'bg-cobalt text-white border-cobalt'
                  : 'bg-background border-border text-body'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="reason">Reason for referral</Label>
        <Textarea
          id="reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why is this patient being transferred?"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="clinicalSummary">Clinical summary (for print packet)</Label>
        <Textarea
          id="clinicalSummary"
          rows={8}
          value={clinicalSummary}
          onChange={(e) => setClinicalSummary(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="transport">Transport (optional)</Label>
        <input
          id="transport"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="Ambulance, private vehicle, etc."
          value={transportMode}
          onChange={(e) => setTransportMode(e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={pending || !toFacility.trim() || !reason.trim()}
          onClick={handleSubmit}
          className="gap-2"
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Create referral &amp; print summary
        </Button>
        <Button type="button" variant="ghost" asChild>
          <Link href={`/dashboard/visits/${context.visitId}`} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Cancel
          </Link>
        </Button>
      </div>
    </div>
  )
}
