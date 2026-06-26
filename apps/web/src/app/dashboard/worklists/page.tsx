import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Activity,
  ClipboardList,
  CreditCard,
  FileText,
  FlaskConical,
  Pill,
  Stethoscope,
  type LucideIcon,
} from 'lucide-react'
import { getStaff } from '@/lib/auth'
import { WebTopBar } from '@/components/web-shell'
import { RealtimeRefresher } from '@/components/realtime-refresher'
import { Badge } from '@/components/ui/badge'
import type { CareTaskStatus, CareTaskType, StaffRole } from '@karibu/shared'
import {
  getAllWorklists,
  type CareTaskRow,
  type MyDraftRow,
  type NeedsClinicianRow,
  type NeedsLabRow,
  type NeedsPaymentRow,
  type NeedsPharmacyRow,
  type NeedsVitalsRow,
} from './actions'

// Phase 5 worklists index — one card per RPC, top 5 rows previewed, link
// through to the relevant detail surface. Role-specific homes (HC III rollout)
// will compose subsets of these RPCs into focused screens; this page is the
// generic "what's pending across the clinic" view.

const PAGE_SUBTITLE = 'WORKLISTS'

// Cards are scrollable, so show real depth rather than a 5-row teaser.
const PREVIEW_LIMIT = 25

// ---------------------------------------------------------------------------
// Tiny formatters — duplicated locally so the page stays a server component.
// ---------------------------------------------------------------------------

function shortDate(value: string | null | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function waitLabel(checkedInAt: string | null | undefined): string {
  if (!checkedInAt) return ''
  const t = new Date(checkedInAt)
  if (Number.isNaN(t.getTime())) return ''
  const minutes = Math.max(0, Math.round((Date.now() - t.getTime()) / 60000))
  if (minutes < 60) return `${minutes}m wait`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}h ${m}m wait`
}

function truncate(value: string | null | undefined, max = 80): string {
  if (!value) return ''
  if (value.length <= max) return value
  return `${value.slice(0, max - 1).trimEnd()}…`
}

// Mirrors the relative due formatter on the patient detail page; kept local
// so this page has no client-component coupling.
function dueLabel(value: string | null | undefined): { text: string; overdue: boolean } {
  if (!value) return { text: '', overdue: false }
  const due = new Date(value)
  if (Number.isNaN(due.getTime())) return { text: '', overdue: false }
  const startOfDay = (d: Date) =>
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const diffDays = Math.round(
    (startOfDay(due) - startOfDay(new Date())) / (1000 * 60 * 60 * 24),
  )
  if (diffDays < 0) {
    const overdue = Math.abs(diffDays)
    return { text: `Overdue ${overdue}d`, overdue: true }
  }
  if (diffDays === 0) return { text: 'Due today', overdue: false }
  if (diffDays === 1) return { text: 'Due tomorrow', overdue: false }
  if (diffDays < 14) return { text: `Due in ${diffDays}d`, overdue: false }
  return { text: `Due ${shortDate(value)}`, overdue: false }
}

// ---------------------------------------------------------------------------
// Label maps
// ---------------------------------------------------------------------------

const TASK_TYPE_LABEL: Record<CareTaskType, string> = {
  lab_followup: 'Lab follow-up',
  phone_callback: 'Phone callback',
  home_visit: 'Home visit',
  medication_review: 'Medication review',
  referral_followup: 'Referral follow-up',
  general: 'General',
}

const TASK_STATUS_CONFIG: Record<CareTaskStatus, { label: string; color: string; bg: string }> = {
  open: { label: 'Open', color: 'text-primary', bg: 'bg-primary/10' },
  in_progress: { label: 'In progress', color: 'text-primary', bg: 'bg-primary/10' },
  completed: { label: 'Completed', color: 'text-accent', bg: 'bg-accent/10' },
  cancelled: { label: 'Cancelled', color: 'text-muted-foreground', bg: 'bg-muted' },
}

const NOTE_SOURCE_LABEL: Record<string, string> = {
  visit: 'Visit',
  phone_call: 'Phone call',
  follow_up: 'Follow-up',
  lab_update: 'Lab update',
  pharmacy_update: 'Pharmacy update',
  general: 'General',
}

const ROLE_LABEL: Record<StaffRole, string> = {
  admin: 'Admin',
  doctor: 'Doctor',
  nurse: 'Nurse',
  clinical_officer: 'Clinical officer',
  midwife: 'Midwife',
  nursing_assistant: 'Nursing assistant',
  records_officer: 'Records officer',
  lab_tech: 'Lab tech',
  dispenser: 'Dispenser',
}

// ---------------------------------------------------------------------------
// Generic card scaffolding
// ---------------------------------------------------------------------------

function WorklistCard({
  title,
  count,
  icon: Icon,
  empty,
  children,
}: {
  title: string
  count: number
  icon: LucideIcon
  empty: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-card border border-border rounded-lg flex flex-col min-w-0">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
          <h2 className="text-sm font-semibold truncate">{title}</h2>
        </div>
        <Badge variant={count > 0 ? 'info' : 'neutral'}>{count}</Badge>
      </div>
      {count === 0 ? (
        <div className="p-4 text-sm text-muted-foreground italic">{empty}</div>
      ) : (
        // Scrollable so a long pending list stays a compact quick-view card
        // instead of stretching the whole page (worklist mockup feedback).
        <ul className="max-h-[420px] overflow-y-auto divide-y divide-border">{children}</ul>
      )}
    </div>
  )
}

function PreviewRow({
  href,
  title,
  meta,
  right,
}: {
  href: string
  title: string
  meta?: React.ReactNode
  right?: React.ReactNode
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-start justify-between gap-3 px-4 py-2.5 hover:bg-secondary/40 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{title}</p>
          {meta && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{meta}</p>
          )}
        </div>
        {right && <div className="shrink-0 text-xs text-muted-foreground">{right}</div>}
      </Link>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Specific worklist cards
// ---------------------------------------------------------------------------

function NeedsVitalsCard({ rows }: { rows: NeedsVitalsRow[] }) {
  return (
    <WorklistCard
      title="Pending vitals"
      count={rows.length}
      icon={Activity}
      empty="No patients waiting for vitals."
    >
      {rows.slice(0, PREVIEW_LIMIT).map((r) => (
        <PreviewRow
          key={r.visit_id}
          href={`/dashboard/visits/${r.visit_id}`}
          title={r.patient_name || 'Unknown patient'}
          meta={r.chief_complaint ?? '—'}
          right={waitLabel(r.checked_in_at)}
        />
      ))}
    </WorklistCard>
  )
}

function NeedsClinicianCard({ rows }: { rows: NeedsClinicianRow[] }) {
  return (
    <WorklistCard
      title="Pending clinician"
      count={rows.length}
      icon={Stethoscope}
      empty="No patients ready for a clinician."
    >
      {rows.slice(0, PREVIEW_LIMIT).map((r) => (
        <PreviewRow
          key={r.visit_id}
          href={`/dashboard/visits/${r.visit_id}`}
          title={r.patient_name || 'Unknown patient'}
          meta={r.chief_complaint ?? '—'}
          right={
            <span className="flex items-center gap-1.5">
              {r.priority !== 'normal' && (
                <Badge
                  variant={
                    r.priority === 'urgent'
                      ? 'urgent'
                      : r.priority === 'high'
                        ? 'warning'
                        : 'neutral'
                  }
                >
                  {r.priority}
                </Badge>
              )}
              {waitLabel(r.checked_in_at)}
            </span>
          }
        />
      ))}
    </WorklistCard>
  )
}

function NeedsLabCard({ rows }: { rows: NeedsLabRow[] }) {
  return (
    <WorklistCard
      title="Pending lab"
      count={rows.length}
      icon={FlaskConical}
      empty="No pending lab orders."
    >
      {rows.slice(0, PREVIEW_LIMIT).map((r) => (
        <PreviewRow
          key={r.visit_id}
          href={`/dashboard/visits/${r.visit_id}`}
          title={r.patient_name || 'Unknown patient'}
          meta={r.chief_complaint ?? '—'}
          right={r.lab_status}
        />
      ))}
    </WorklistCard>
  )
}

function NeedsPharmacyCard({ rows }: { rows: NeedsPharmacyRow[] }) {
  return (
    <WorklistCard
      title="Pending pharmacy"
      count={rows.length}
      icon={Pill}
      empty="No pending dispensing."
    >
      {rows.slice(0, PREVIEW_LIMIT).map((r) => (
        <PreviewRow
          key={r.visit_id}
          href={`/dashboard/visits/${r.visit_id}`}
          title={r.patient_name || 'Unknown patient'}
          meta={truncate(r.medications, 90) || '—'}
          right={r.dispensing_status.replace('_', ' ')}
        />
      ))}
    </WorklistCard>
  )
}

function NeedsPaymentCard({ rows }: { rows: NeedsPaymentRow[] }) {
  return (
    <WorklistCard
      title="Pending payment"
      count={rows.length}
      icon={CreditCard}
      empty="No outstanding payments."
    >
      {rows.slice(0, PREVIEW_LIMIT).map((r) => (
        <PreviewRow
          key={r.visit_id}
          href={`/dashboard/visits/${r.visit_id}`}
          title={r.patient_name || 'Unknown patient'}
          meta={truncate(r.diagnosis, 90) || '—'}
          right={shortDate(r.visit_date)}
        />
      ))}
    </WorklistCard>
  )
}

function MyDraftsCard({ rows }: { rows: MyDraftRow[] }) {
  return (
    <WorklistCard
      title="My drafts"
      count={rows.length}
      icon={FileText}
      empty="No drafts to finish."
    >
      {rows.slice(0, PREVIEW_LIMIT).map((r) => {
        // Visit-tied drafts go to the visit; standalone notes go to the patient.
        const href = r.visit_id
          ? `/dashboard/visits/${r.visit_id}`
          : `/dashboard/patients/${r.patient_id}`
        const sourceLabel = NOTE_SOURCE_LABEL[r.source] ?? r.source
        return (
          <PreviewRow
            key={r.note_id}
            href={href}
            title={r.patient_name || 'Unknown patient'}
            meta={
              <span className="flex items-center gap-2">
                <span className="shrink-0 uppercase tracking-wide text-[10px] text-muted-foreground">
                  {sourceLabel}
                </span>
                <span className="truncate">{truncate(r.transcript_preview, 100) || '(empty draft)'}</span>
              </span>
            }
            right={shortDate(r.updated_at)}
          />
        )
      })}
    </WorklistCard>
  )
}

function CareTasksCard({ rows }: { rows: CareTaskRow[] }) {
  return (
    <WorklistCard
      title="Care tasks"
      count={rows.length}
      icon={ClipboardList}
      empty="No open care tasks."
    >
      {rows.slice(0, PREVIEW_LIMIT).map((r) => {
        const due = dueLabel(r.due_at)
        const statusCfg = TASK_STATUS_CONFIG[r.status] ?? TASK_STATUS_CONFIG.open
        const typeLabel = TASK_TYPE_LABEL[r.task_type] ?? r.task_type
        const roleLabel = r.assignee_role ? ROLE_LABEL[r.assignee_role] : null
        return (
          <PreviewRow
            key={r.task_id}
            href={`/dashboard/patients/${r.patient_id}`}
            title={r.title}
            meta={
              <span className="flex flex-wrap items-center gap-2">
                <span className="shrink-0 uppercase tracking-wide text-[10px] text-muted-foreground">
                  {typeLabel}
                </span>
                <span className="truncate">{r.patient_name || 'Unknown patient'}</span>
                {roleLabel && (
                  <span className="text-[10px] text-muted-foreground">· {roleLabel}</span>
                )}
              </span>
            }
            right={
              <span className="flex items-center gap-1.5">
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${statusCfg.bg} ${statusCfg.color}`}
                >
                  {statusCfg.label}
                </span>
                {due.text && (
                  <span
                    className={
                      due.overdue
                        ? 'text-destructive font-medium'
                        : 'text-muted-foreground'
                    }
                  >
                    {due.text}
                  </span>
                )}
              </span>
            }
          />
        )
      })}
    </WorklistCard>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function WorklistsPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')

  // All 7 worklists are independent — fetch in parallel. Errors inside each
  // action are logged + degraded to [], so Promise.all never rejects.
  const {
    needsVitals,
    needsClinician,
    needsLab,
    needsPharmacy,
    needsPayment,
    myDrafts,
    careTasks,
  } = await getAllWorklists()

  return (
    <>
      <WebTopBar title="Worklists" subtitle={PAGE_SUBTITLE} />
      <RealtimeRefresher clinicId={staff.clinic_id} />
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <NeedsVitalsCard rows={needsVitals} />
        <NeedsClinicianCard rows={needsClinician} />
        <NeedsLabCard rows={needsLab} />
        <NeedsPharmacyCard rows={needsPharmacy} />
        <NeedsPaymentCard rows={needsPayment} />
        <MyDraftsCard rows={myDrafts} />
        <CareTasksCard rows={careTasks} />
      </div>
    </>
  )
}
