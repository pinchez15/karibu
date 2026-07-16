import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  BedDouble,
  CreditCard,
  FlaskConical,
  HeartPulse,
  Baby,
  Pill,
  Stethoscope,
} from 'lucide-react'
import { formatUgX } from '@/lib/money'
import { cn } from '@/lib/utils'
import {
  CLINIC_EVENT_META,
  appointmentTitle,
  type ClinicAppointment,
} from '@/lib/calendar-events'
import {
  groupAppointmentsByDay,
  type BriefingData,
  type NeedsAttentionItem,
} from '@/lib/dashboard-briefing-helpers'

/**
 * Clinic-wide briefing dashboard — the Home page. Whole-clinic numbers for
 * every desk (not role-scoped) so any staff member can read the shape of the
 * day and see what needs to happen across every station.
 *
 * Presentational only: all data is loaded server-side by `loadBriefing()` and
 * passed in as props, which keeps this component render-testable in jsdom.
 */
export function BriefingDashboard({ data }: { data: BriefingData }) {
  const { daySize, stations, needsAttention, appointments, monthToDate } = data

  return (
    <div className="p-6 overflow-auto flex-1 space-y-5">
      {/* 1. Day-size banner */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="kh-meta">{data.dateLabel}</div>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <BannerMetric label="Visits today" value={daySize.visitsToday} />
          <BannerMetric label="Waiting now" value={daySize.waitingNow} />
          <BannerMetric label="With a clinician" value={daySize.withClinicianNow} />
          <BannerMetric
            label="To finalize"
            value={daySize.toFinalize}
            amber={daySize.toFinalize > 0}
          />
        </div>
      </section>

      {/* 2. Station tiles */}
      <section>
        <h2 className="kh-meta mb-2">Stations</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StationTile
            href="/dashboard/opd"
            icon={Stethoscope}
            title="OPD"
            metrics={[
              { label: 'Waiting', value: stations.opd.waiting },
              { label: 'With clinician', value: stations.opd.withClinician },
              { label: 'To finalize', value: stations.opd.toFinalize, amber: stations.opd.toFinalize > 0 },
            ]}
          />
          <StationTile
            href="/dashboard/inpatient"
            icon={BedDouble}
            title="Inpatient"
            metrics={[{ label: 'Admitted · beds used', value: stations.inpatient.admitted }]}
          />
          <StationTile
            href="/dashboard/lab"
            icon={FlaskConical}
            title="Lab"
            metrics={[
              { label: 'On bench', value: stations.lab.visitsOnBench },
              { label: 'Open tests', value: stations.lab.openTests },
            ]}
          />
          <StationTile
            href="/dashboard/pharmacy"
            icon={Pill}
            title="Pharmacy"
            metrics={[
              { label: 'To dispense', value: stations.pharmacy.toDispense },
              { label: 'Partial', value: stations.pharmacy.partial },
              { label: 'Returned', value: stations.pharmacy.returned },
              { label: 'Low stock', value: stations.pharmacy.lowStock, amber: stations.pharmacy.lowStock > 0 },
            ]}
          />
          {stations.anc && (
            <StationTile
              href="/dashboard/anc"
              icon={Baby}
              title="ANC"
              metrics={[{ label: 'Active pregnancies', value: stations.anc.active }]}
            />
          )}
          {stations.hivTb && (
            <StationTile
              href="/dashboard/hiv-tb"
              icon={HeartPulse}
              title="HIV / TB"
              metrics={[
                { label: 'On HIV care', value: stations.hivTb.hiv },
                { label: 'TB episodes', value: stations.hivTb.tb },
              ]}
            />
          )}
        </div>
      </section>

      {/* 3. Needs attention */}
      <NeedsAttention items={needsAttention} />

      {/* 4. Today + next 7 days strip */}
      <WeekStrip appointments={appointments} />

      {/* 5. Month-to-date footer */}
      <MonthFooter data={monthToDate} />
    </div>
  )
}

// --- Day-size banner --------------------------------------------------------

function BannerMetric({ label, value, amber }: { label: string; value: number; amber?: boolean }) {
  return (
    <div>
      <div className="kh-meta">{label}</div>
      <div
        className={cn(
          'mt-1 text-[34px] font-semibold leading-none tracking-tight tabular-nums',
          amber && 'text-amber-ink',
        )}
      >
        {value}
      </div>
    </div>
  )
}

// --- Station tiles ----------------------------------------------------------

type TileMetric = { label: string; value: number; amber?: boolean }

export function StationTile({
  href,
  icon: Icon,
  title,
  metrics,
}: {
  href: string
  icon: React.ComponentType<{ className?: string }>
  title: string
  metrics: TileMetric[]
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-cobalt/40 hover:bg-background/40"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-cobalt-soft text-cobalt">
            <Icon className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold">{title}</span>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {metrics.map((m) => (
          <div key={m.label}>
            <div
              className={cn(
                'text-[22px] font-semibold leading-none tabular-nums',
                m.amber && 'text-amber-ink',
              )}
            >
              {m.value}
            </div>
            <div className="kh-meta mt-1">{m.label}</div>
          </div>
        ))}
      </div>
    </Link>
  )
}

// --- Needs attention --------------------------------------------------------

const TONE_CLASS: Record<NeedsAttentionItem['tone'], string> = {
  amber: 'bg-amber-soft text-amber-ink',
  cobalt: 'bg-cobalt-soft text-cobalt',
  slate: 'bg-slate-soft text-slate',
}

export function NeedsAttention({ items }: { items: NeedsAttentionItem[] }) {
  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line-soft px-4 py-2.5">
        <AlertTriangle className="h-4 w-4 text-amber-ink" />
        <h2 className="text-sm font-semibold">Needs attention</h2>
        <span className="text-[11px] text-muted-foreground">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          Nothing needs attention right now — every desk is clear.
        </p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-background/60"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2.5 py-[3px] text-[11px] font-semibold',
                      TONE_CLASS[item.tone],
                    )}
                  >
                    {item.label}
                  </span>
                  <span className="text-[13px] text-body">{item.detail}</span>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// --- Week strip -------------------------------------------------------------

function timeLabel(ts: string): string {
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export function WeekStrip({ appointments }: { appointments: ClinicAppointment[] }) {
  const buckets = groupAppointmentsByDay(appointments, 8)

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-4 py-2.5">
        <div>
          <h2 className="text-sm font-semibold">Today &amp; next 7 days</h2>
          <p className="text-xs text-muted-foreground">Follow-ups, outreach days, and clinic events</p>
        </div>
        <Link
          href="/dashboard/calendar"
          className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-[12px] font-semibold text-cobalt hover:bg-cobalt-soft/30 transition-colors"
        >
          Open calendar
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-2 divide-x divide-y divide-line-soft sm:grid-cols-4 lg:grid-cols-8">
        {buckets.map((day) => (
          <div
            key={day.key}
            className={cn('min-h-[6rem] p-2', day.isToday && 'bg-cobalt-soft/20')}
          >
            <div className="mb-1.5 flex items-baseline justify-between gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {day.weekdayLabel}
              </span>
              <span
                className={cn(
                  'text-[11px] font-semibold tabular-nums',
                  day.isToday ? 'text-cobalt' : 'text-body',
                )}
              >
                {day.dayNumber}
              </span>
            </div>
            <div className="space-y-1">
              {day.items.length === 0 ? (
                <span className="text-[10px] text-muted-foreground/50">—</span>
              ) : (
                day.items.slice(0, 3).map((a) => {
                  const meta = CLINIC_EVENT_META[a.event_type] ?? CLINIC_EVENT_META.admin
                  const chip = (
                    <div
                      className="rounded px-1.5 py-1 text-[10px] leading-tight text-white"
                      style={{ backgroundColor: meta.color }}
                    >
                      <span className="block truncate font-medium">{appointmentTitle(a)}</span>
                      <span className="block opacity-90">
                        {timeLabel(a.scheduled_at)} · {meta.shortLabel}
                      </span>
                    </div>
                  )
                  return a.patient_id ? (
                    <Link key={a.id} href={`/dashboard/patients/${a.patient_id}`} className="block">
                      {chip}
                    </Link>
                  ) : (
                    <div key={a.id}>{chip}</div>
                  )
                })
              )}
              {day.items.length > 3 && (
                <Link
                  href="/dashboard/calendar"
                  className="text-[10px] font-medium text-cobalt hover:underline"
                >
                  +{day.items.length - 3} more
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 border-t border-line-soft px-4 py-2.5">
        {(Object.keys(CLINIC_EVENT_META) as Array<keyof typeof CLINIC_EVENT_META>).map((key) => (
          <span key={key} className="inline-flex items-center gap-1.5 text-[11px] text-body">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: CLINIC_EVENT_META[key].color }}
            />
            {CLINIC_EVENT_META[key].label}
          </span>
        ))}
      </div>
    </section>
  )
}

// --- Month-to-date footer ---------------------------------------------------

export function MonthFooter({ data }: { data: BriefingData['monthToDate'] }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="kh-meta">Month to date · {data.monthLabel}</h2>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-soft px-2.5 py-1 text-[11px] font-semibold text-slate">
          <CreditCard className="h-3 w-3" />
          HMIS 105 due {data.hmisDueLabel}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <FooterMetric label="OPD visits" value={String(data.opdVisits)} />
        <FooterMetric label="Admissions" value={String(data.admissions)} />
        <FooterMetric label="Unique patients" value={String(data.uniquePatients)} />
        <FooterMetric
          label="Revenue · charged"
          value={formatUgX(data.revenueUgx)}
          sub={`of ${formatUgX(data.chargedUgx)}`}
        />
      </div>
    </section>
  )
}

function FooterMetric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="kh-meta">{label}</div>
      <div className="mt-1 text-[20px] font-semibold leading-none tracking-tight tabular-nums">
        {value}
      </div>
      {sub && <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  )
}
