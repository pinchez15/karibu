'use client'

import Link from 'next/link'
import { ancProtocolStatus } from '@/lib/anc-protocol'
import type { ActivePregnancyRow } from './actions'
import { cn } from '@/lib/utils'

type RegistryItem = ActivePregnancyRow & {
  status: ReturnType<typeof ancProtocolStatus>
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso.slice(0, 10))
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function AncRegistryClient({ rows }: { rows: ActivePregnancyRow[] }) {
  const items: RegistryItem[] = rows.map((row) => ({
    ...row,
    status: ancProtocolStatus({
      lmp: row.lmp,
      edd: row.edd,
      contactsDone: row.contact_count,
      iptpDone: row.iptp_count,
    }),
  }))

  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
        <p className="text-body font-medium">No pregnancies registered yet.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Register an expectant mother to start ANC tracking.
        </p>
        <Link
          href="/dashboard/anc/new"
          className="mt-4 inline-flex rounded-md bg-cobalt px-4 py-2 text-sm font-semibold text-white hover:bg-cobalt/90"
        >
          Register pregnancy
        </Link>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6">
      <div className="mx-auto max-w-3xl space-y-3">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/dashboard/anc/${item.id}`}
            className="block rounded-xl border border-border bg-card p-4 transition-colors hover:border-cobalt/30 hover:bg-background"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-heading">{item.patient_name ?? 'Mother'}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  G{item.gravida ?? '—'} P{item.para ?? '—'}
                  {item.status.gestationWeeks != null && (
                    <span> · {item.status.gestationWeeks} wks</span>
                  )}
                  {item.edd && <span> · EDD {formatDate(item.edd)}</span>}
                </p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p>{item.contact_count} contact{item.contact_count === 1 ? '' : 's'}</p>
                {item.last_contact_at && <p>Last {formatDate(item.last_contact_at)}</p>}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium text-body">
                ANC {item.contact_count}/{item.status.contactsDue}
              </span>
              <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium text-body">
                IPTp {item.iptp_count}/{3}
              </span>
              {item.td_count > 0 && (
                <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium text-body">
                  Td {item.td_count}
                </span>
              )}
              {item.status.gaps.map((gap) => (
                <span
                  key={gap}
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-semibold',
                    gap === 'Due soon'
                      ? 'bg-amber-100 text-amber-900'
                      : gap === 'Post-dates'
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-cobalt/10 text-cobalt',
                  )}
                >
                  {gap}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
