import { redirect } from 'next/navigation'
import Link from 'next/link'
import { FlaskConical } from 'lucide-react'
import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { WebTopBar } from '@/components/web-shell'

// Clinician-facing read-only view of lab orders they requested. Mirrors the
// lab-tech queue at /dashboard/lab but scoped to `doctor_id = me` and shows
// completed + abnormal results too — the clinician needs to know what came
// back, not just what's pending.

interface MyLabRow {
  id: string
  visit_date: string
  tests_ordered: string | null
  lab_status: string
  lab_results: string | null
  lab_abnormal: boolean
  patient: {
    id: string
    patient_number: string | null
    first_name: string | null
    last_name: string | null
    display_name: string | null
  } | null
}

const LAB_STATUS_DISPLAY: Record<string, { label: string; color: string; bg: string }> = {
  not_ordered: { label: 'Not ordered', color: 'text-muted-foreground', bg: 'bg-muted' },
  pending: { label: 'Pending', color: 'text-primary', bg: 'bg-primary/10' },
  running: { label: 'Running', color: 'text-primary', bg: 'bg-primary/10' },
  done: { label: 'Done', color: 'text-accent', bg: 'bg-accent/10' },
  abnormal: { label: 'Abnormal', color: 'text-destructive', bg: 'bg-destructive/10' },
}

async function getMyLabs(clinicId: string, staffId: string): Promise<MyLabRow[]> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('visits')
    .select(`
      id,
      visit_date,
      tests_ordered,
      lab_status,
      lab_results,
      lab_abnormal,
      patient:patients!inner (
        id,
        patient_number,
        first_name,
        last_name,
        display_name
      )
    `)
    .eq('clinic_id', clinicId)
    .eq('doctor_id', staffId)
    .not('tests_ordered', 'is', null)
    .neq('tests_ordered', '')
    .order('visit_date', { ascending: false })
    .limit(100)

  if (error) {
    console.error('Failed to load my lab orders:', error)
    return []
  }
  return (data ?? []) as unknown as MyLabRow[]
}

function patientName(p: MyLabRow['patient']): string {
  if (!p) return 'Unknown patient'
  return [p.first_name, p.last_name].filter(Boolean).join(' ') || p.display_name || 'Unknown patient'
}

export default async function MyLabsPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')

  const orders = await getMyLabs(staff.clinic_id, staff.id)
  const pending = orders.filter(o => ['pending', 'running'].includes(o.lab_status))
  const done = orders.filter(o => ['done', 'abnormal'].includes(o.lab_status))

  return (
    <>
      <WebTopBar
        title="Lab status"
        subtitle="CLINICIAN · YOUR ORDERS"
      />

      <div className="p-6 overflow-auto flex-1 space-y-6">
        {orders.length === 0 ? (
          <div className="py-20 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-cobalt-soft text-cobalt mb-5">
              <FlaskConical className="h-7 w-7" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight mb-2">No lab orders yet</h2>
            <p className="text-base text-body leading-relaxed max-w-lg mx-auto">
              Tests you order during a visit appear here so you can track when results
              come back without leaving your queue.
            </p>
          </div>
        ) : (
          <>
            <LabSection
              title="Awaiting results"
              rows={pending}
              emptyHint="No tests waiting."
            />
            <LabSection
              title="Resulted"
              rows={done}
              emptyHint="No results yet."
              highlightAbnormal
            />
          </>
        )}
      </div>
    </>
  )
}

function LabSection({
  title,
  rows,
  emptyHint,
  highlightAbnormal = false,
}: {
  title: string
  rows: MyLabRow[]
  emptyHint: string
  highlightAbnormal?: boolean
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title} ({rows.length})
      </h2>
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="hidden md:grid md:grid-cols-[minmax(220px,2fr)_120px_minmax(220px,2fr)_minmax(220px,2fr)_120px] gap-4 px-4 py-2.5 bg-muted/40 border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <div>Patient</div>
          <div>Visit date</div>
          <div>Tests ordered</div>
          <div>Result</div>
          <div>Status</div>
        </div>
        {rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">{emptyHint}</div>
        ) : (
          rows.map((row) => {
            const display =
              LAB_STATUS_DISPLAY[row.lab_status] ?? LAB_STATUS_DISPLAY.pending
            const isAbnormal = highlightAbnormal && row.lab_abnormal
            return (
              <div
                key={row.id}
                className={`grid grid-cols-1 md:grid-cols-[minmax(220px,2fr)_120px_minmax(220px,2fr)_minmax(220px,2fr)_120px] gap-y-1 md:gap-4 px-4 py-3 border-b border-border last:border-b-0 hover:bg-secondary/40 transition-colors ${isAbnormal ? 'bg-destructive/5' : ''}`}
              >
                <div className="min-w-0">
                  <Link
                    href={`/dashboard/patients/${row.patient?.id}`}
                    className="font-medium hover:underline truncate block"
                  >
                    {patientName(row.patient)}
                  </Link>
                  {row.patient?.patient_number && (
                    <div className="text-xs text-muted-foreground truncate">
                      #{row.patient.patient_number}
                    </div>
                  )}
                </div>
                <div className="text-sm text-muted-foreground md:text-foreground">
                  {new Date(row.visit_date).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                  })}
                </div>
                <div className="text-sm whitespace-pre-wrap break-words">
                  {row.tests_ordered}
                </div>
                <div className="text-sm whitespace-pre-wrap break-words text-muted-foreground">
                  {row.lab_results || '—'}
                </div>
                <div>
                  <Link
                    href={`/dashboard/visits/${row.id}`}
                    className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full hover:opacity-80 ${display.bg} ${display.color}`}
                  >
                    {display.label}
                  </Link>
                </div>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}
