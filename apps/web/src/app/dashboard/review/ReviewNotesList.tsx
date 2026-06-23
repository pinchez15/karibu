import Link from 'next/link'
import { Check } from 'lucide-react'
import type { ReviewNotesVisit, UncodedVisitRow } from '@/lib/review-notes'
import { cn } from '@/lib/utils'

function VisitDate({ value }: { value: string }) {
  return (
    <span>
      {new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
    </span>
  )
}

function RowButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-[13px] transition-colors',
        active ? 'bg-cobalt-soft/80 ring-1 ring-inset ring-cobalt/30' : 'hover:bg-background/60',
      )}
    >
      {children}
    </button>
  )
}

function UnfinalizedSection({
  rows,
  selectedVisitId,
  onSelectVisit,
}: {
  rows: ReviewNotesVisit[]
  selectedVisitId: string | null
  onSelectVisit: (visitId: string) => void
}) {
  if (rows.length === 0) return null

  const groups = new Map<string, ReviewNotesVisit[]>()
  for (const r of rows) {
    const key = r.doctor_name ?? 'Unassigned'
    const list = groups.get(key) ?? []
    list.push(r)
    groups.set(key, list)
  }

  return (
    <section className="rounded-xl border border-amber/40 bg-amber-soft/15 p-5">
      <h2 className="text-base font-semibold text-amber-ink">
        Notes to sign — {rows.length} {rows.length === 1 ? 'visit' : 'visits'}
      </h2>
      <p className="mt-1 text-sm text-body">
        Select a visit to complete missing data and sign — the list stays open while you work.
      </p>
      <div className="mt-4 space-y-4">
        {Array.from(groups.entries())
          .sort((a, b) => b[1].length - a[1].length)
          .map(([doctor, list]) => (
            <div key={doctor}>
              <div className="text-sm font-semibold">
                {doctor} <span className="text-muted-foreground">— {list.length}</span>
              </div>
              <ul className="mt-1 divide-y divide-border/60 rounded-md border border-border bg-card">
                {list.map((r) => {
                  const tags: string[] = []
                  if (!r.has_diagnosis) tags.push('no diagnosis')
                  if (r.missing_age) tags.push('no age')
                  if (r.missing_sex) tags.push('no sex')
                  if (tags.length === 0) tags.push('unsigned')

                  return (
                    <li key={r.visit_id}>
                      <RowButton
                        active={selectedVisitId === r.visit_id}
                        onClick={() => onSelectVisit(r.visit_id)}
                      >
                        <span className="min-w-0 truncate font-medium">
                          {r.patient_name || 'Unknown patient'}
                          {r.patient_number != null && (
                            <span className="font-normal text-muted-foreground">
                              {' '}
                              #{r.patient_number}
                            </span>
                          )}
                        </span>
                        <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 text-[11px]">
                          {tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-amber-soft px-2 py-px font-semibold text-amber-ink"
                            >
                              {tag}
                            </span>
                          ))}
                          <VisitDate value={r.visit_date} />
                        </span>
                      </RowButton>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
      </div>
    </section>
  )
}

function UncodedSection({
  rows,
  selectedVisitId,
  onSelectVisit,
}: {
  rows: UncodedVisitRow[]
  selectedVisitId: string | null
  onSelectVisit: (visitId: string) => void
}) {
  if (rows.length === 0) return null

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-base font-semibold">
        Needs HMIS coding — {rows.length} {rows.length === 1 ? 'visit' : 'visits'}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Add HMIS diagnosis codes without leaving this worklist.
      </p>
      <ul className="mt-3 divide-y divide-border rounded-md border border-border">
        {rows.map((r) => (
          <li key={r.visit_id}>
            <RowButton
              active={selectedVisitId === r.visit_id}
              onClick={() => onSelectVisit(r.visit_id)}
            >
              <span className="min-w-0 truncate font-medium">
                {r.patient_name || 'Unknown patient'}
              </span>
              <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
                <span className="rounded-full bg-cobalt-soft px-2 py-px text-[11px] font-semibold text-cobalt">
                  no HMIS code
                </span>
                <VisitDate value={r.visit_date} />
              </span>
            </RowButton>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function ReviewNotesList({
  unfinalized,
  uncoded,
  periodLabel,
  selectedVisitId = null,
  onSelectVisit,
}: {
  unfinalized: ReviewNotesVisit[]
  uncoded: UncodedVisitRow[]
  periodLabel: string
  selectedVisitId?: string | null
  onSelectVisit?: (visitId: string) => void
}) {
  const total = unfinalized.length + uncoded.length

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card px-6 py-16 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent/10">
          <Check className="h-7 w-7 text-accent" />
        </div>
        <h2 className="text-lg font-semibold">All caught up</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Every visit in {periodLabel} is signed and coded. Nothing needs review right now.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 rounded-md bg-cobalt px-4 py-2 text-[13px] font-semibold text-white hover:bg-cobalt/90"
        >
          Back to Today
        </Link>
      </div>
    )
  }

  const select = onSelectVisit ?? (() => {})

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Showing visits in <span className="font-medium text-body">{periodLabel}</span> that need
        clinical data completed before they can be sent to HMIS reporting.
      </p>
      <UnfinalizedSection
        rows={unfinalized}
        selectedVisitId={selectedVisitId}
        onSelectVisit={select}
      />
      <UncodedSection
        rows={uncoded}
        selectedVisitId={selectedVisitId}
        onSelectVisit={select}
      />
    </div>
  )
}
