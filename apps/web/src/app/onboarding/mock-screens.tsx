'use client'

import { cn } from '@/lib/utils'
import {
  Activity,
  BedDouble,
  Calendar,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  FlaskConical,
  Home,
  ListTodo,
  Pill,
  Printer,
  Search,
  Stethoscope,
  Users,
} from 'lucide-react'

type MockProps = {
  activeStepId: string
  onStepAction: (stepId: string) => void
}

/** Matches `VitalsCard` on the visit detail page. */
const VITALS_FIELDS: { label: string; value?: string }[] = [
  { label: 'Temp °C', value: '37.8' },
  { label: 'BP sys' },
  { label: 'BP dia' },
  { label: 'Pulse', value: '88' },
  { label: 'Resp' },
  { label: 'SpO₂ %' },
  { label: 'Weight kg' },
  { label: 'Height cm' },
  { label: 'MUAC cm' },
]

const OPD_NAV = [
  { id: 'today', label: 'Today', icon: Home },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'patients', label: 'Patients', icon: Users },
  { id: 'worklists', label: 'Worklists', icon: ListTodo },
  { id: 'orders', label: 'Orders', icon: ClipboardList },
  { id: 'review', label: 'Review Notes', icon: ClipboardCheck },
]

const UNIT_TABS = [
  { id: 'opd', label: 'OPD', icon: Stethoscope },
  { id: 'inpatient', label: 'Inpatient', icon: BedDouble },
  { id: 'lab', label: 'Lab', icon: FlaskConical },
  { id: 'pharmacy', label: 'Pharmacy', icon: Pill },
  { id: 'billing', label: 'Billing', icon: CreditCard },
]

function Shell({
  unit,
  activeUnit = 'opd',
  children,
  sidebarHighlight,
  onSidebarSelect,
  topTitle,
}: {
  unit: string
  activeUnit?: string
  children: React.ReactNode
  sidebarHighlight?: string
  /**
   * Makes the highlighted sidebar item clickable. Without this, a step whose
   * coach text says "tap the highlighted button" had NO tappable target on
   * screens >= sm where the sidebar shows — the sm:hidden fallback button was
   * the only handler, soft-locking step 1 of onboarding on laptops/tablets
   * (field report 2026-07-10).
   */
  onSidebarSelect?: (id: string) => void
  topTitle?: string
}) {
  return (
    <div className="flex h-full min-h-[360px] flex-col overflow-hidden rounded-xl border border-border bg-background text-sm shadow-sm">
      <header className="flex h-10 shrink-0 items-center border-b border-border bg-card px-2">
        <div className="flex w-24 shrink-0 items-center gap-1 px-1">
          <div className="h-5 w-5 rounded bg-cobalt" aria-hidden />
          <span className="text-[10px] font-semibold text-cobalt">KaribuEHR</span>
        </div>
        <nav className="flex flex-1 gap-0.5 overflow-x-auto">
          {UNIT_TABS.map(({ id, label, icon: Icon }) => (
            <div
              key={id}
              className={cn(
                'flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium whitespace-nowrap',
                activeUnit === id ? 'bg-cobalt-soft text-cobalt' : 'text-muted-foreground',
              )}
            >
              <Icon className="h-3 w-3" />
              {label}
            </div>
          ))}
        </nav>
      </header>

      <div className="flex min-h-0 flex-1">
        {activeUnit === 'opd' && (
          <aside className="hidden w-32 shrink-0 border-r border-border bg-card p-2 sm:block">
            <p className="px-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
              Clinic
            </p>
            <p className="px-1 text-[10px] font-semibold text-foreground">Ssunga HC III</p>
            <p className="mb-2 px-1 text-[9px] font-semibold text-cobalt">{unit}</p>
            <nav className="space-y-0.5">
              {OPD_NAV.map(({ id, label, icon: Icon }) => {
                const isTarget = sidebarHighlight === id && onSidebarSelect != null
                const classes = cn(
                  'flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-[10px]',
                  sidebarHighlight === id
                    ? 'bg-cobalt-soft font-semibold text-cobalt'
                    : 'text-muted-foreground',
                  isTarget && 'ring-2 ring-cobalt ring-offset-1',
                )
                return isTarget ? (
                  <button key={id} type="button" className={classes} onClick={() => onSidebarSelect(id)}>
                    <Icon className="h-3 w-3 shrink-0" />
                    {label}
                  </button>
                ) : (
                  <div key={id} className={classes}>
                    <Icon className="h-3 w-3 shrink-0" />
                    {label}
                  </div>
                )
              })}
            </nav>
          </aside>
        )}

        <div className="min-w-0 flex-1 overflow-auto bg-background p-3">
          {topTitle && (
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {topTitle}
            </p>
          )}
          {children}
        </div>
      </div>
    </div>
  )
}

function MockBtn({
  children,
  active,
  onClick,
  variant = 'primary',
  className,
  size = 'default',
}: {
  children: React.ReactNode
  active?: boolean
  onClick?: () => void
  variant?: 'primary' | 'outline' | 'ghost' | 'green' | 'cobalt-soft'
  className?: string
  size?: 'default' | 'sm'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md font-medium transition-colors',
        size === 'sm' ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs',
        active && 'ring-2 ring-cobalt ring-offset-2',
        variant === 'primary' && 'bg-cobalt text-white hover:bg-cobalt-deep',
        variant === 'outline' && 'border border-border bg-card hover:bg-muted',
        variant === 'ghost' && 'border border-dashed border-cobalt/40 bg-cobalt-soft/50 text-cobalt',
        variant === 'green' && 'bg-green text-white',
        variant === 'cobalt-soft' && 'bg-cobalt-soft text-cobalt',
        className,
      )}
    >
      {children}
    </button>
  )
}

function Field({
  label,
  value,
  highlight,
}: {
  label: string
  value?: string
  highlight?: boolean
}) {
  return (
    <div className="space-y-0.5">
      <label className="text-[10px] font-medium text-muted-foreground">{label}</label>
      <div
        className={cn(
          'rounded-md border border-input bg-background px-2 py-1 text-[10px]',
          highlight && 'ring-1 ring-cobalt',
        )}
      >
        {value ?? ''}
      </div>
    </div>
  )
}

function SectionCard({
  title,
  children,
  active,
}: {
  title: string
  children?: React.ReactNode
  active?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card p-2',
        active && 'ring-2 ring-cobalt ring-offset-1',
      )}
    >
      <p className="text-[10px] font-semibold text-muted-foreground">{title}</p>
      {children}
    </div>
  )
}

export function RecordsDeskMock({ activeStepId, onStepAction }: MockProps) {
  const h = (step: string) => activeStepId === step

  return (
    <Shell
      unit="OPD"
      sidebarHighlight={h('open-patients') ? 'patients' : undefined}
      onSidebarSelect={h('open-patients') ? () => onStepAction('open-patients') : undefined}
      topTitle="Patients"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold">Patients</span>
        <span className="text-[10px] text-muted-foreground">142 patients</span>
      </div>

      {h('open-patients') && (
        <MockBtn active className="mb-2 sm:hidden" onClick={() => onStepAction('open-patients')}>
          Open Patients
        </MockBtn>
      )}

      <div className="mb-2 flex gap-2">
        <div
          className={cn(
            'flex flex-1 items-center gap-2 rounded-md border border-input bg-card px-2 py-1.5',
            h('search-first') && 'ring-2 ring-cobalt ring-offset-1',
          )}
        >
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">
            Search name, patient #, phone, or address…
          </span>
        </div>
        {h('search-first') && (
          <MockBtn active variant="ghost" onClick={() => onStepAction('search-first')}>
            Search
          </MockBtn>
        )}
        <MockBtn
          active={h('new-patient')}
          variant={h('new-patient') ? 'primary' : 'outline'}
          onClick={() => onStepAction('new-patient')}
        >
          New Patient
        </MockBtn>
      </div>

      {(h('fill-form') || h('create-visit')) && (
        <div className="space-y-2 rounded-lg border border-border bg-card p-3">
          <p className="text-xs font-semibold">New patient</p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="First Name *" value="Grace" highlight={h('fill-form')} />
            <Field label="Last Name *" value="Akello" />
            <Field label="Phone (optional)" value="+256 7XX XXX XXX" />
            <div className="space-y-0.5">
              <span className="text-[10px] font-medium text-muted-foreground">Sex *</span>
              <div className="flex gap-2 text-[10px]">
                <span className="rounded border border-cobalt bg-cobalt-soft px-2 py-0.5 text-cobalt">Female</span>
                <span className="text-muted-foreground">Male</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {['Exact date', 'Year only', 'Approx. age', 'Unknown'].map((opt, i) => (
              <span
                key={opt}
                className={cn(
                  'rounded px-2 py-0.5 text-[10px]',
                  i === 2 ? 'bg-cobalt text-white' : 'bg-muted text-muted-foreground',
                )}
              >
                {opt}
              </span>
            ))}
          </div>
          <Field label="Approximate age *" value="34" />
          <div className="grid grid-cols-3 gap-2">
            <Field label="Village" value="Kapeeka" />
            <Field label="Parish" value="" />
            <Field label="District" value="Mityana" />
          </div>
          {h('fill-form') && (
            <MockBtn active onClick={() => onStepAction('fill-form')}>
              Details entered
            </MockBtn>
          )}
          {h('create-visit') && (
            <MockBtn active onClick={() => onStepAction('create-visit')}>
              Create Patient & Start Visit
            </MockBtn>
          )}
        </div>
      )}

      {activeStepId === 'done' && (
        <div className="rounded-lg border border-accent/30 bg-accent/10 p-2 text-[10px] text-accent">
          Grace Akello · Visit opened · Pending vitals
        </div>
      )}
    </Shell>
  )
}

export function VitalsMock({ activeStepId, onStepAction }: MockProps) {
  const h = (step: string) => activeStepId === step

  if (h('open-worklist')) {
    return (
      <Shell unit="OPD" sidebarHighlight="worklists" topTitle="Worklists">
        <p className="mb-2 text-sm font-semibold">Worklists</p>
        <div className="rounded-lg border border-border bg-card p-2">
          <div className="mb-1 flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-cobalt" />
            <span className="text-xs font-semibold">Pending vitals</span>
            <span className="rounded-full bg-cobalt-soft px-1.5 text-[10px] text-cobalt">1</span>
          </div>
          <div
            className={cn(
              'mt-2 rounded-md border border-border p-2',
              h('open-worklist') && 'ring-2 ring-cobalt',
            )}
          >
            <p className="text-xs font-medium">Nakato Mary</p>
            <p className="text-[10px] text-muted-foreground">Fever 2 days · 12 min wait</p>
            <MockBtn active className="mt-2" size="sm" onClick={() => onStepAction('open-worklist')}>
              View worklist
            </MockBtn>
          </div>
        </div>
      </Shell>
    )
  }

  return (
    <Shell unit="OPD" topTitle="Visit">
      <div className="mb-1 text-[10px] text-muted-foreground">Visit · Today</div>
      <h3 className="mb-3 text-sm font-semibold">Nakato Mary</h3>

      {h('open-visit') && (
        <MockBtn active className="mb-3" onClick={() => onStepAction('open-visit')}>
          Open visit
        </MockBtn>
      )}

      <div className="rounded-lg border border-border bg-card p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-cobalt" />
            <span className="text-xs font-medium">Vitals</span>
          </div>
          <MockBtn
            active={h('record-vitals')}
            variant="outline"
            size="sm"
            onClick={() => onStepAction('record-vitals')}
          >
            Record vitals
          </MockBtn>
        </div>

        {(h('enter-values') || h('save-vitals')) && (
          <>
            <p className="mb-2 text-[10px] text-muted-foreground">
              Every field is optional. Capture whatever you measured today.
            </p>
            <div
              className={cn(
                'grid grid-cols-2 gap-2 sm:grid-cols-3',
                h('enter-values') && 'rounded-lg ring-2 ring-cobalt ring-offset-1 p-1',
              )}
            >
              {VITALS_FIELDS.map((f) => (
                <Field key={f.label} label={f.label} value={f.value} />
              ))}
            </div>
            <Field label="Notes" value="" />
            {h('enter-values') && (
              <MockBtn active className="mt-2" onClick={() => onStepAction('enter-values')}>
                Values entered
              </MockBtn>
            )}
            {h('save-vitals') && (
              <div className="mt-2 flex justify-end">
                <MockBtn active onClick={() => onStepAction('save-vitals')}>
                  Save vitals
                </MockBtn>
              </div>
            )}
          </>
        )}
      </div>

      {activeStepId === 'done' && (
        <p className="mt-2 text-[10px] text-accent">Worklist: Ready for clinician</p>
      )}
    </Shell>
  )
}

export function ClinicianNoteMock({ activeStepId, onStepAction }: MockProps) {
  const h = (step: string) => activeStepId === step

  return (
    <Shell unit="OPD" topTitle="Visit">
      <h3 className="mb-1 text-sm font-semibold">Nakato Mary</h3>
      <p className="mb-3 text-[10px] text-muted-foreground">Queue: Ready for clinician</p>

      {h('open-visit') && (
        <MockBtn active className="mb-3" onClick={() => onStepAction('open-visit')}>
          Open visit
        </MockBtn>
      )}

      <div className="space-y-2">
        <SectionCard title="Chief complaint" active={h('chief-complaint')}>
          <p className="mt-1 text-[10px]">Fever and headache × 2 days</p>
          {h('chief-complaint') && (
            <MockBtn active className="mt-2" size="sm" onClick={() => onStepAction('chief-complaint')}>
              Continue
            </MockBtn>
          )}
        </SectionCard>

        <SectionCard title="History of present illness" active={h('chief-complaint')}>
          <p className="mt-1 text-[10px] text-muted-foreground">Onset, duration, severity…</p>
        </SectionCard>

        <SectionCard title="Diagnosis" active={h('diagnosis-plan')}>
          <p className="mt-1 text-[10px]">Acute febrile illness</p>
          {h('diagnosis-plan') && (
            <MockBtn active className="mt-2" size="sm" onClick={() => onStepAction('diagnosis-plan')}>
              Continue
            </MockBtn>
          )}
        </SectionCard>

        <SectionCard title="Assessment and plan" active={h('diagnosis-plan')}>
          <p className="mt-1 text-[10px] text-muted-foreground">Plan, counseling…</p>
        </SectionCard>

        {h('order-labs') && (
          <div className="rounded-xl border border-line-soft bg-muted/30 p-2">
            <p className="text-[10px] font-semibold">Order lab tests</p>
            <p className="text-[9px] text-muted-foreground">Pick from the catalog</p>
            <label className="mt-2 flex items-center gap-1.5 text-[10px]">
              <input type="checkbox" readOnly checked className="accent-cobalt" />
              Malaria RDT
            </label>
            <MockBtn
              className="mt-2"
              variant="outline"
              size="sm"
              onClick={() => onStepAction('order-labs')}
            >
              Send to lab
            </MockBtn>
          </div>
        )}

        <div
          className={cn(
            'rounded-xl border border-line-soft bg-muted/30 p-2',
            h('send-pharmacy') && 'ring-2 ring-cobalt',
          )}
        >
          <p className="text-[10px] font-semibold">Structured prescriptions</p>
          <p className="text-[9px] text-muted-foreground">Add each medication as a separate line</p>
          <p className="mt-1 text-[10px]">Paracetamol 500mg · 20 tabs</p>
          <p className="text-[10px]">Amoxicillin 250mg · 15 caps</p>
          {h('send-pharmacy') && (
            <MockBtn active className="mt-2" size="sm" onClick={() => onStepAction('send-pharmacy')}>
              Send to pharmacy
            </MockBtn>
          )}
        </div>
      </div>

      {activeStepId === 'done' && (
        <MockBtn className="mt-3" variant="outline" size="sm">
          Sign note
        </MockBtn>
      )}
    </Shell>
  )
}

export function LabQueueMock({ activeStepId, onStepAction }: MockProps) {
  const h = (step: string) => activeStepId === step

  return (
    <Shell activeUnit="lab" unit="LAB" topTitle="Today · Laboratory orders">
      {h('open-lab') && (
        <MockBtn active className="mb-3" onClick={() => onStepAction('open-lab')}>
          View lab queue
        </MockBtn>
      )}

      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-line-soft px-3 py-2">
          <p className="text-xs font-semibold">Pending + running</p>
          <p className="text-[10px] text-muted-foreground">1 test · 1 patient · oldest first</p>
        </div>

        <div className="p-3">
          <p className="text-xs font-semibold">Nakato Mary</p>
          <p className="text-[10px] font-mono text-muted-foreground">PT-100042 · 34F</p>

          <div className="mt-2 grid grid-cols-4 gap-1 border-b border-line-soft pb-1 text-[9px] font-semibold uppercase text-muted-foreground">
            <span>Test</span>
            <span>Result</span>
            <span>Status</span>
            <span>Actions</span>
          </div>

          <div
            className={cn(
              'mt-1 grid grid-cols-4 items-center gap-1 py-2',
              (h('start-test') || h('enter-result') || h('save-result')) && 'rounded ring-2 ring-cobalt',
            )}
          >
            <span className="text-[10px] font-medium">Malaria RDT</span>
            <input
              readOnly
              value={h('enter-result') || h('save-result') ? 'Positive' : ''}
              className="rounded border border-border px-1 py-0.5 text-[10px]"
              aria-label="Result"
            />
            <span className="text-[10px] text-cobalt">{h('start-test') ? 'pending' : 'running'}</span>
            <div className="flex flex-wrap gap-1">
              {h('start-test') && (
                <MockBtn active size="sm" variant="cobalt-soft" onClick={() => onStepAction('start-test')}>
                  Start
                </MockBtn>
              )}
              {h('enter-result') && (
                <>
                  <MockBtn size="sm" variant="outline" onClick={() => onStepAction('enter-result')}>
                    Positive
                  </MockBtn>
                  <MockBtn size="sm" variant="outline">
                    Negative
                  </MockBtn>
                </>
              )}
              {h('save-result') && (
                <MockBtn active size="sm" variant="green" onClick={() => onStepAction('save-result')}>
                  Save
                </MockBtn>
              )}
            </div>
          </div>
        </div>
      </div>
    </Shell>
  )
}

export function PharmacyMock({ activeStepId, onStepAction }: MockProps) {
  const h = (step: string) => activeStepId === step

  return (
    <Shell activeUnit="pharmacy" unit="PHARMACY · DISPENSING">
      <p className="mb-2 text-sm font-semibold">Today</p>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {[
          { id: 'waiting', label: 'Waiting (1)', active: true },
          { id: 'in_progress', label: 'In progress (0)', active: false },
          { id: 'done', label: 'Done today (0)', active: false },
        ].map((tab) => (
          <span
            key={tab.id}
            className={cn(
              'rounded-full px-2.5 py-1 text-[10px] font-medium',
              tab.active && h('open-pharmacy')
                ? 'bg-cobalt text-white ring-2 ring-cobalt ring-offset-1'
                : tab.active
                  ? 'bg-cobalt text-white'
                  : 'bg-muted/50 text-muted-foreground',
            )}
          >
            {tab.label}
          </span>
        ))}
      </div>

      {h('open-pharmacy') && (
        <MockBtn active className="mb-3" onClick={() => onStepAction('open-pharmacy')}>
          Open pharmacy queue
        </MockBtn>
      )}

      <div
        className={cn(
          'rounded-lg border border-border bg-card p-3',
          (h('select-order') || h('dispense')) && 'ring-2 ring-cobalt',
        )}
      >
        <p className="text-xs font-semibold">Nakato Mary</p>
        <p className="text-[10px] text-muted-foreground">1. Paracetamol 500mg · 2. Amoxicillin 250mg</p>
        {h('select-order') && (
          <MockBtn active className="mt-2" size="sm" onClick={() => onStepAction('select-order')}>
            Open worksheet
          </MockBtn>
        )}
        {h('dispense') && (
          <MockBtn active className="mt-2" onClick={() => onStepAction('dispense')}>
            Dispense & complete
          </MockBtn>
        )}
      </div>
    </Shell>
  )
}

export function BillingMock({ activeStepId, onStepAction }: MockProps) {
  const h = (step: string) => activeStepId === step

  if (h('open-billing')) {
    return (
      <Shell activeUnit="billing" unit="PATIENT BILLS" topTitle="Payments">
        <MockBtn active className="mb-3" onClick={() => onStepAction('open-billing')}>
          Open payments desk
        </MockBtn>
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-line-soft px-3 py-2 text-xs font-semibold">
            Patients with balance
          </div>
          <div className="flex items-center justify-between px-3 py-2 text-[10px]">
            <span className="font-medium">Nakato Mary</span>
            <span className="font-semibold text-amber-ink">UGX 13,000 owed</span>
          </div>
        </div>
      </Shell>
    )
  }

  return (
    <Shell activeUnit="billing" unit="PATIENT BILL">
      <h3 className="text-sm font-semibold">Nakato Mary</h3>
      <p className="mb-3 text-[10px] text-muted-foreground">Patient bill</p>

      <div className="mb-3 rounded-xl border border-border bg-card p-3">
        <p className="text-[10px] font-semibold">Bill summary</p>
        <dl className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
          <div>
            <dt className="text-muted-foreground">Total</dt>
            <dd className="font-semibold">UGX 13,000</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Paid</dt>
            <dd>UGX 0</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Owed</dt>
            <dd className="font-semibold text-amber-ink">UGX 13,000</dd>
          </div>
        </dl>
      </div>

      <div
        className={cn(
          'rounded-xl border border-border bg-card p-3',
          h('find-patient') && 'ring-2 ring-cobalt',
        )}
      >
        {h('find-patient') && (
          <MockBtn active onClick={() => onStepAction('find-patient')}>
            Open patient bill
          </MockBtn>
        )}
      </div>

      {(h('record-payment') || activeStepId === 'done') && (
        <div
          className={cn(
            'mt-3 rounded-xl border border-border bg-card p-3',
            h('record-payment') && 'ring-2 ring-cobalt',
          )}
        >
          <p className="text-[10px] font-semibold">Record payment</p>
          <p className="text-[9px] text-muted-foreground">Partial payments allowed</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Field label="Method" value="Cash" />
            <Field label="Cash / mobile (UGX)" value="13,000" />
          </div>
          {h('record-payment') && (
            <MockBtn active className="mt-2" onClick={() => onStepAction('record-payment')}>
              Record payment
            </MockBtn>
          )}
        </div>
      )}

      {activeStepId === 'done' && (
        <p className="mt-2 text-[10px] text-accent">Receipt printed · balance UGX 0</p>
      )}
    </Shell>
  )
}

export function PrinterSetupMock({ activeStepId, onStepAction }: MockProps) {
  const h = (step: string) => activeStepId === step

  return (
    <div className="mx-auto max-w-sm rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Printer className="h-4 w-4 text-cobalt" />
        Thermal printer setup
      </div>

      {h('open-admin') && (
        <MockBtn active className="mb-3 w-full" onClick={() => onStepAction('open-admin')}>
          Open Settings → Printer setup
        </MockBtn>
      )}

      <div className="space-y-2 text-[10px]">
        <div
          className={cn(
            'rounded-lg border border-line-soft p-2',
            h('connect') && 'ring-2 ring-cobalt',
          )}
        >
          <p className="font-semibold">1. Connect USB printer</p>
          {h('connect') && (
            <MockBtn active size="sm" className="mt-2" onClick={() => onStepAction('connect')}>
              Mark connected
            </MockBtn>
          )}
        </div>

        <div
          className={cn(
            'rounded-lg border border-line-soft p-2',
            (h('test-print') || h('verify')) && 'ring-2 ring-cobalt',
          )}
        >
          <p className="font-semibold">2. Print test receipt</p>
          <p className="text-muted-foreground">58mm · sample charges + visit note</p>
          {h('test-print') && (
            <MockBtn active size="sm" className="mt-2" onClick={() => onStepAction('test-print')}>
              Print test
            </MockBtn>
          )}
        </div>

        <div
          className={cn(
            'rounded-lg border border-line-soft p-2',
            h('finish') && 'ring-2 ring-cobalt',
          )}
        >
          <p className="font-semibold">3. Confirm alignment</p>
          {h('finish') && (
            <MockBtn active size="sm" className="mt-2" onClick={() => onStepAction('finish')}>
              Finish setup
            </MockBtn>
          )}
        </div>
      </div>

      {activeStepId === 'done' && (
        <p className="mt-3 text-[10px] text-accent">
          Ready — visit slips, billing, and pharmacy use this printer.
        </p>
      )}
    </div>
  )
}
