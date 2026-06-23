'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, ExternalLink, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PendingDictationCard } from '@/app/dashboard/visits/[id]/PendingDictationCard'
import { DiagnosisCoder } from '@/components/DiagnosisCoder'
import { PatientSexEditor } from '@/app/dashboard/patients/[id]/PatientSexEditor'
import { PatientAgeQuickSet } from './PatientAgeQuickSet'
import { ReviewVisitContext } from './ReviewVisitContext'
import { formatPatientDemographics, hasDiagnosis } from './visit-context'
import {
  checkReviewVisitResolved,
  loadReviewVisitPanel,
  type ReviewPanelVisit,
  type ReviewVisitKind,
} from './load-visit'
import type { StaffRole } from '@karibu/shared'
import { cn } from '@/lib/utils'

export function ReviewVisitPanel({
  visitId,
  kind,
  staffRole,
  positionLabel,
  focusTags = [],
  onClose,
  onResolved,
  onDemographicsUpdated,
}: {
  visitId: string
  kind: ReviewVisitKind
  staffRole: StaffRole
  positionLabel?: string
  focusTags?: string[]
  onClose: () => void
  onResolved: () => void
  onDemographicsUpdated?: () => void
}) {
  const [visit, setVisit] = useState<ReviewPanelVisit | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await loadReviewVisitPanel(visitId)
    if (result.error || !result.data) {
      setError(result.error ?? 'Could not load visit')
      setVisit(null)
    } else {
      setVisit(result.data)
    }
    setLoading(false)
  }, [visitId])

  useEffect(() => {
    void reload()
  }, [reload])

  const tryResolve = useCallback(async () => {
    const { resolved } = await checkReviewVisitResolved(visitId, kind)
    if (resolved) onResolved()
    else void reload()
  }, [visitId, kind, onResolved, reload])

  const handleDemographicsSaved = () => {
    onDemographicsUpdated?.()
    void reload()
  }

  if (loading && !visit) {
    return (
      <PanelChrome
        title="Loading…"
        positionLabel={positionLabel}
        onClose={onClose}
        visitId={visitId}
      >
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </PanelChrome>
    )
  }

  if (error || !visit) {
    return (
      <PanelChrome title="Error" positionLabel={positionLabel} onClose={onClose} visitId={visitId}>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-sm text-destructive">{error ?? 'Visit not found'}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void reload()}>
            Retry
          </Button>
        </div>
      </PanelChrome>
    )
  }

  const demo = formatPatientDemographics(visit.patient)
  const needsSign = !visit.documentation_complete
  const needsHmis = kind === 'uncoded' || focusTags.some((t) => t.includes('HMIS'))
  const needsDx = !hasDiagnosis(visit) || focusTags.some((t) => t.includes('diagnosis'))
  const diagnosisText =
    visit.diagnosis?.trim() || visit.initialNoteSections.diagnosis?.trim() || ''

  return (
    <PanelChrome
      title={visit.patient.display_name || 'Unknown patient'}
      subtitle={new Date(visit.visit_date).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })}
      positionLabel={positionLabel}
      onClose={onClose}
      visitId={visit.id}
      footer={
        <div className="flex flex-wrap gap-2">
          <Button type="button" className="gap-1.5" onClick={() => void tryResolve()}>
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href={`/dashboard/visits/${visit.id}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-1.5" />
              Full chart
            </Link>
          </Button>
        </div>
      }
    >
      <div className="space-y-3 p-4">
        <ReviewVisitContext visit={visit} />

        {(demo.missingSex || demo.missingAge) && (
          <ActionCard title="Complete patient demographics" highlight>
            <p className="text-xs text-muted-foreground mb-2">
              HMIS reporting needs sex and age. Use the visit record above for context.
            </p>
            {demo.missingSex && (
              <PatientSexEditor
                patientId={visit.patient.id}
                currentSex={visit.patient.sex}
                onSaved={handleDemographicsSaved}
              />
            )}
            {demo.missingAge && (
              <div className={demo.missingSex ? 'mt-3' : undefined}>
                <PatientAgeQuickSet patientId={visit.patient.id} onSaved={handleDemographicsSaved} />
              </div>
            )}
          </ActionCard>
        )}

        {needsSign && (
          <ActionCard title="Sign note to finalize" highlight={needsDx}>
            <PendingDictationCard
              visitId={visit.id}
              initialSections={visit.initialNoteSections}
              initialNoteId={visit.initialNoteId}
              labResults={visit.lab_results}
              labAbnormal={visit.lab_abnormal}
              labStatus={visit.lab_status}
              pharmacyOrderSubmitted={!!visit.pharmacy_order_submitted_at}
              staffRole={staffRole}
              variant="review"
              showLabBanner={false}
              onClose={() => void tryResolve()}
            />
          </ActionCard>
        )}

        {!needsSign && needsHmis && (
          <ActionCard title="Add HMIS diagnosis code" highlight>
            <p className="text-sm text-body mb-1">
              Match this visit to an HMIS 105 code using the chart diagnosis and note above.
            </p>
            {diagnosisText ? (
              <p className="mb-3 rounded-md border border-cobalt/30 bg-cobalt-soft/20 px-2.5 py-2 text-sm font-medium">
                {diagnosisText}
              </p>
            ) : (
              <p className="mb-3 text-sm text-amber-ink">
                No diagnosis on the chart — add one in the full chart if needed before coding.
              </p>
            )}
            <DiagnosisCoder visitId={visit.id} onCodesAssigned={() => void tryResolve()} />
          </ActionCard>
        )}
      </div>
    </PanelChrome>
  )
}

function ActionCard({
  title,
  highlight,
  children,
}: {
  title: string
  highlight?: boolean
  children: React.ReactNode
}) {
  return (
    <section
      className={cn(
        'rounded-lg border p-3',
        highlight ? 'border-amber/45 bg-amber-soft/10' : 'border-border bg-card',
      )}
    >
      <h3 className="text-sm font-semibold text-amber-ink mb-2">{title}</h3>
      {children}
    </section>
  )
}

function PanelChrome({
  title,
  subtitle,
  positionLabel,
  onClose,
  visitId,
  footer,
  children,
}: {
  title: string
  subtitle?: string
  positionLabel?: string
  onClose: () => void
  visitId: string
  footer?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-card" data-visit-id={visitId}>
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          {positionLabel && <p className="kh-meta text-cobalt mb-0.5">{positionLabel}</p>}
          <h2 className="text-base font-semibold truncate">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={onClose}
          aria-label="Close panel"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      {footer && (
        <div className="shrink-0 border-t border-border p-4">{footer}</div>
      )}
    </div>
  )
}
