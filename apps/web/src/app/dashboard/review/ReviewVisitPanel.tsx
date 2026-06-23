'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, ExternalLink, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PendingDictationCard } from '@/app/dashboard/visits/[id]/PendingDictationCard'
import { DiagnosisCoder } from '@/components/DiagnosisCoder'
import { PatientSexEditor } from '@/app/dashboard/patients/[id]/PatientSexEditor'
import { PatientAgeQuickSet } from './PatientAgeQuickSet'
import {
  checkReviewVisitResolved,
  loadReviewVisitPanel,
  type ReviewPanelVisit,
  type ReviewVisitKind,
} from './load-visit'
import type { StaffRole } from '@karibu/shared'

export function ReviewVisitPanel({
  visitId,
  kind,
  staffRole,
  positionLabel,
  onClose,
  onResolved,
  onDemographicsUpdated,
}: {
  visitId: string
  kind: ReviewVisitKind
  staffRole: StaffRole
  positionLabel?: string
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
        <div className="flex flex-1 items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </PanelChrome>
    )
  }

  if (error || !visit) {
    return (
      <PanelChrome title="Error" positionLabel={positionLabel} onClose={onClose} visitId={visitId}>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-sm text-destructive">{error ?? 'Visit not found'}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void reload()}>
            Retry
          </Button>
        </div>
      </PanelChrome>
    )
  }

  const missingSex = visit.patient.sex == null
  const missingAge = visit.patient.dob_precision === 'unknown'
  const showNoteEditor = !visit.documentation_complete
  const showCoder =
    kind === 'uncoded' || ['sent', 'completed', 'review'].includes(visit.status)

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
    >
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {(missingSex || missingAge) && (
          <section className="rounded-lg border border-amber/40 bg-amber-soft/15 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-amber-ink">Patient data for HMIS</h3>
            {missingSex && (
              <PatientSexEditor
                patientId={visit.patient.id}
                currentSex={visit.patient.sex}
                onSaved={handleDemographicsSaved}
              />
            )}
            {missingAge && (
              <PatientAgeQuickSet patientId={visit.patient.id} onSaved={handleDemographicsSaved} />
            )}
          </section>
        )}

        {showNoteEditor && (
          <PendingDictationCard
            visitId={visit.id}
            initialSections={visit.initialNoteSections}
            initialNoteId={visit.initialNoteId}
            labResults={visit.lab_results}
            labAbnormal={visit.lab_abnormal}
            labStatus={visit.lab_status}
            pharmacyOrderSubmitted={!!visit.pharmacy_order_submitted_at}
            staffRole={staffRole}
            onClose={() => void tryResolve()}
          />
        )}

        {showCoder && (
          <DiagnosisCoder visitId={visit.id} onCodesAssigned={() => void tryResolve()} />
        )}

        {!showNoteEditor && !showCoder && (
          <p className="text-sm text-muted-foreground">
            This visit is ready. Use Next to continue, or open the full chart for more context.
          </p>
        )}
      </div>

      <div className="shrink-0 border-t border-border p-4 flex flex-wrap gap-2">
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
    </PanelChrome>
  )
}

function PanelChrome({
  title,
  subtitle,
  positionLabel,
  onClose,
  visitId,
  children,
}: {
  title: string
  subtitle?: string
  positionLabel?: string
  onClose: () => void
  visitId: string
  children: React.ReactNode
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-card" data-visit-id={visitId}>
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          {positionLabel && (
            <p className="kh-meta text-cobalt mb-0.5">{positionLabel}</p>
          )}
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
      {children}
    </div>
  )
}
