import Link from 'next/link'
import type { UnfinalizedVisitRow } from '@/lib/review-notes'

// Per-clinician "finalize before it counts" list (#11). Unfinalized visits are
// excluded from HMIS 105 (only signed sent/completed visits count). Grouped by
// the clinician who saw the patient so each gets their own short list to sign.
export function FinalizeList({ rows }: { rows: UnfinalizedVisitRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="no-print rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        All visits this month are finalized — nothing pending for HMIS 105.
      </div>
    )
  }

  const groups = new Map<string, UnfinalizedVisitRow[]>()
  for (const r of rows) {
    const key = r.doctor_name ?? 'Unassigned'
    const list = groups.get(key) ?? []
    list.push(r)
    groups.set(key, list)
  }

  return (
    <div className="no-print rounded-xl border border-amber-soft bg-amber-soft/20 p-4">
      <h3 className="text-base font-semibold text-amber-ink">
        Finalize before counting — {rows.length} {rows.length === 1 ? 'visit' : 'visits'}
      </h3>
      <p className="mt-1 text-sm text-body">
        These visits aren&apos;t signed, so they&apos;re excluded from HMIS 105. Each clinician opens
        their visits, reviews, and signs to count them.
      </p>
      <div className="mt-3 space-y-4">
        {Array.from(groups.entries())
          .sort((a, b) => b[1].length - a[1].length)
          .map(([doctor, list]) => (
            <div key={doctor}>
              <div className="text-sm font-semibold">
                {doctor} <span className="text-muted-foreground">— {list.length}</span>
              </div>
              <ul className="mt-1 divide-y divide-border/60 rounded-md border border-border bg-card">
                {list.map((r) => (
                  <li key={r.visit_id}>
                    <Link
                      href={`/dashboard/visits/${r.visit_id}`}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-[13px] hover:bg-secondary/40"
                    >
                      <span className="min-w-0 truncate">
                        {r.patient_name || 'Unknown patient'}
                        {r.patient_number != null && (
                          <span className="text-muted-foreground"> #{r.patient_number}</span>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
                        {!r.has_diagnosis && <span className="text-amber-ink">no dx</span>}
                        <span className="capitalize">{r.status}</span>
                        <span>{new Date(r.visit_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </div>
    </div>
  )
}
