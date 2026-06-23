import { cn } from '@/lib/utils'
import type { ReviewPanelVisit } from './load-visit'
import {
  buildNotePreview,
  formatPatientDemographics,
  hasDiagnosis,
} from './visit-context'

function ContextRow({
  label,
  value,
  highlight,
  children,
}: {
  label: string
  value?: string
  highlight?: boolean
  children?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'rounded-md px-2.5 py-2 text-[13px]',
        highlight ? 'border border-amber/50 bg-amber-soft/25' : 'bg-card/80',
      )}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {children ?? <p className="mt-0.5 text-body">{value || '—'}</p>}
    </div>
  )
}

/** Read-only visit summary so gap actions (age, HMIS, sign) have local context. */
export function ReviewVisitContext({ visit }: { visit: ReviewPanelVisit }) {
  const demo = formatPatientDemographics(visit.patient)
  const notePreview = buildNotePreview(visit)
  const diagnosis =
    visit.diagnosis?.trim() || visit.initialNoteSections.diagnosis?.trim() || ''
  const dxMissing = !hasDiagnosis(visit)

  return (
    <section className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Visit record
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <ContextRow label="Sex" value={demo.sexLabel} highlight={demo.missingSex} />
        <ContextRow label="Age / DOB" value={demo.ageLabel} highlight={demo.missingAge} />
      </div>
      <ContextRow
        label="Diagnosis (chart)"
        value={diagnosis || 'Not recorded on this visit'}
        highlight={dxMissing}
      />
      {visit.medications?.trim() && (
        <ContextRow label="Medications" value={visit.medications.trim()} />
      )}
      {visit.lab_results?.trim() && (
        <ContextRow
          label="Lab results"
          highlight={visit.lab_abnormal}
          value={visit.lab_results.trim()}
        />
      )}
      {notePreview ? (
        <ContextRow label="Clinician note" highlight={!visit.documentation_complete}>
          <div className="mt-1 max-h-32 overflow-y-auto rounded border border-border/80 bg-background p-2 text-xs leading-relaxed whitespace-pre-wrap">
            {notePreview}
          </div>
        </ContextRow>
      ) : (
        <ContextRow
          label="Clinician note"
          value="No note text yet"
          highlight={!visit.documentation_complete}
        />
      )}
    </section>
  )
}
