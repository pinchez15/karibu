'use client'

import { cn } from '@/lib/utils'
import {
  ClipboardList,
  CreditCard,
  FlaskConical,
  Home,
  ListTodo,
  Pill,
  Search,
  Stethoscope,
  Users,
} from 'lucide-react'

type MockProps = {
  activeStepId: string
  onStepAction: (stepId: string) => void
}

function Shell({
  unit,
  children,
  sidebarHighlight,
}: {
  unit: string
  children: React.ReactNode
  sidebarHighlight?: string
}) {
  const nav = [
    { id: 'today', label: 'Today', icon: Home },
    { id: 'patients', label: 'Patients', icon: Users },
    { id: 'worklists', label: 'Worklists', icon: ListTodo },
    { id: 'orders', label: 'Orders', icon: ClipboardList },
  ]

  return (
    <div className="flex h-full min-h-[320px] overflow-hidden rounded-xl border border-border bg-card text-sm shadow-sm">
      <aside className="hidden w-36 shrink-0 border-r border-border bg-muted/30 p-2 sm:block">
        <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Clinic
        </p>
        <p className="px-2 text-xs font-semibold text-foreground">Ssunga HC III</p>
        <p className="mb-2 px-2 text-[10px] text-cobalt">{unit}</p>
        <nav className="space-y-0.5">
          {nav.map(({ id, label, icon: Icon }) => (
            <div
              key={id}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs',
                sidebarHighlight === id
                  ? 'bg-cobalt-soft font-medium text-cobalt'
                  : 'text-muted-foreground',
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {label}
            </div>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1 overflow-auto p-3">{children}</div>
    </div>
  )
}

function MockBtn({
  children,
  active,
  onClick,
  variant = 'primary',
  className,
}: {
  children: React.ReactNode
  active?: boolean
  onClick?: () => void
  variant?: 'primary' | 'outline' | 'ghost'
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg px-3 py-2 text-xs font-medium transition-colors',
        active && 'ring-2 ring-cobalt ring-offset-2',
        variant === 'primary' && 'bg-cobalt text-white hover:bg-cobalt-deep',
        variant === 'outline' && 'border border-border bg-background hover:bg-muted',
        variant === 'ghost' && 'border border-dashed border-cobalt/40 bg-cobalt-soft/50 text-cobalt',
        className,
      )}
    >
      {children}
    </button>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-medium text-muted-foreground">{label}</label>
      <div className="rounded-md border border-input bg-background px-2 py-1.5 text-xs">{value}</div>
    </div>
  )
}

export function RecordsDeskMock({ activeStepId, onStepAction }: MockProps) {
  const highlight = (step: string) => activeStepId === step

  return (
    <Shell unit="OPD" sidebarHighlight={highlight('open-patients') ? 'patients' : undefined}>
      <div className="mb-2 flex items-center gap-2">
        <Stethoscope className="h-4 w-4 text-cobalt" />
        <span className="font-semibold">Patients</span>
      </div>

      {highlight('open-patients') && (
        <MockBtn active className="mb-3" onClick={() => onStepAction('open-patients')}>
          Open Patients
        </MockBtn>
      )}

      <div
        className={cn(
          'mb-3 flex items-center gap-2 rounded-lg border border-input bg-background px-2 py-2',
          highlight('search-first') && 'ring-2 ring-cobalt ring-offset-1',
        )}
      >
        <Search className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Search name, phone, or ID…</span>
        {highlight('search-first') && (
          <MockBtn active onClick={() => onStepAction('search-first')} variant="ghost">
            Try search
          </MockBtn>
        )}
      </div>

      <div className="mb-3 flex gap-2">
        <MockBtn
          active={highlight('new-patient')}
          onClick={() => onStepAction('new-patient')}
        >
          + New patient
        </MockBtn>
      </div>

      {(highlight('save-patient') || highlight('check-in')) && (
        <div className="mb-3 space-y-2 rounded-lg border border-border bg-muted/20 p-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="First name *" value="Grace" />
            <Field label="Last name *" value="Akello" />
            <Field label="Sex *" value="F" />
            <Field label="Village" value="Kapeeka" />
          </div>
          {highlight('save-patient') && (
            <MockBtn active onClick={() => onStepAction('save-patient')}>
              Save patient
            </MockBtn>
          )}
        </div>
      )}

      {highlight('check-in') && (
        <div className="space-y-2 rounded-lg border border-cobalt/20 bg-cobalt-soft/30 p-3">
          <p className="text-xs font-medium">Check in to department</p>
          <div className="flex flex-wrap gap-2">
            {['OPD', 'ANC', 'Maternity'].map((d) => (
              <MockBtn
                key={d}
                active={d === 'OPD'}
                onClick={() => onStepAction('check-in')}
                variant={d === 'OPD' ? 'primary' : 'outline'}
              >
                {d}
              </MockBtn>
            ))}
          </div>
        </div>
      )}

      {activeStepId === 'done' && (
        <div className="rounded-lg border border-accent/30 bg-accent/10 p-3 text-xs text-accent">
          Grace Akello · OPD · Waiting · checked in 2 min ago
        </div>
      )}
    </Shell>
  )
}

export function VitalsMock({ activeStepId, onStepAction }: MockProps) {
  const highlight = (step: string) => activeStepId === step

  return (
    <Shell unit="OPD" sidebarHighlight={highlight('open-chart') ? 'worklists' : undefined}>
      <div className="mb-2 text-xs text-muted-foreground">Patient chart · Training patient</div>
      <h3 className="mb-3 text-base font-semibold">Nakato Mary · F · 34y</h3>

      {highlight('open-chart') && (
        <MockBtn active onClick={() => onStepAction('open-chart')}>
          Open from queue
        </MockBtn>
      )}

      <div
        className={cn(
          'mt-3 rounded-lg border border-border p-3',
          highlight('vitals-section') && 'ring-2 ring-cobalt ring-offset-1',
        )}
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="font-medium">Vitals</span>
          {highlight('vitals-section') && (
            <MockBtn active onClick={() => onStepAction('vitals-section')}>
              Record vitals
            </MockBtn>
          )}
        </div>
        {(highlight('enter-values') || highlight('save-vitals')) && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Temp °C" value="37.8" />
            <Field label="Pulse" value="88" />
            <Field label="BP" value="118/76" />
            <Field label="RR" value="18" />
          </div>
        )}
        {highlight('enter-values') && (
          <div className="mt-2">
            <MockBtn active onClick={() => onStepAction('enter-values')}>
              Values entered
            </MockBtn>
          </div>
        )}
        {highlight('save-vitals') && (
          <div className="mt-2">
            <MockBtn active onClick={() => onStepAction('save-vitals')}>
              Save vitals
            </MockBtn>
          </div>
        )}
      </div>

      {activeStepId === 'done' && (
        <p className="mt-3 text-xs text-accent">Queue: Ready for clinician</p>
      )}
    </Shell>
  )
}

export function ClinicianNoteMock({ activeStepId, onStepAction }: MockProps) {
  const h = (s: string) => activeStepId === s

  return (
    <Shell unit="OPD">
      <h3 className="mb-1 font-semibold">Visit · Nakato Mary</h3>
      <p className="mb-3 text-xs text-muted-foreground">Chief complaint: fever 2 days</p>

      {h('claim-patient') && (
        <MockBtn active onClick={() => onStepAction('claim-patient')}>
          Claim patient
        </MockBtn>
      )}

      <div className="mt-3 space-y-2">
        <div className={cn('rounded-lg border p-2', h('chief-complaint') && 'ring-2 ring-cobalt')}>
          <p className="text-[10px] font-medium text-muted-foreground">History & exam</p>
          <p className="text-xs">Fever, headache, no cough…</p>
          {h('chief-complaint') && (
            <MockBtn active onClick={() => onStepAction('chief-complaint')}>
              Continue
            </MockBtn>
          )}
        </div>
        <div className={cn('rounded-lg border p-2', h('diagnosis-plan') && 'ring-2 ring-cobalt')}>
          <p className="text-[10px] font-medium text-muted-foreground">Diagnosis</p>
          <p className="text-xs">Acute febrile illness</p>
          {h('diagnosis-plan') && (
            <MockBtn active onClick={() => onStepAction('diagnosis-plan')}>
              Continue
            </MockBtn>
          )}
        </div>
        {h('order-labs') && (
          <MockBtn variant="outline" onClick={() => onStepAction('order-labs')}>
            Order labs
          </MockBtn>
        )}
        <div className={cn('rounded-lg border p-2', h('send-pharmacy') && 'ring-2 ring-cobalt')}>
          <p className="text-[10px] font-medium text-muted-foreground">Medicines</p>
          <p className="text-xs">Paracetamol 500mg · Amoxicillin 250mg</p>
          {h('send-pharmacy') && (
            <MockBtn active onClick={() => onStepAction('send-pharmacy')}>
              Send to pharmacy
            </MockBtn>
          )}
        </div>
      </div>
    </Shell>
  )
}

export function LabQueueMock({ activeStepId, onStepAction }: MockProps) {
  const h = (s: string) => activeStepId === s

  return (
    <div className="min-h-[320px] rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-cobalt" />
        <span className="font-semibold">Lab queue</span>
      </div>

      {h('open-lab') && (
        <MockBtn active onClick={() => onStepAction('open-lab')}>
          View pending tests
        </MockBtn>
      )}

      <div
        className={cn(
          'mt-3 rounded-lg border p-3',
          (h('collect-specimen') || h('enter-result') || h('release')) && 'ring-2 ring-cobalt',
        )}
      >
        <p className="font-medium">Nakato Mary</p>
        <p className="text-xs text-muted-foreground">Malaria RDT · Ordered 09:12</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {h('collect-specimen') && (
            <MockBtn active onClick={() => onStepAction('collect-specimen')}>
              Collected
            </MockBtn>
          )}
          {h('enter-result') && (
            <>
              <Field label="Result" value="Positive" />
              <MockBtn active onClick={() => onStepAction('enter-result')}>
                Save result
              </MockBtn>
            </>
          )}
          {h('release') && (
            <MockBtn active onClick={() => onStepAction('release')}>
              Release result
            </MockBtn>
          )}
        </div>
      </div>
    </div>
  )
}

export function PharmacyMock({ activeStepId, onStepAction }: MockProps) {
  const h = (s: string) => activeStepId === s

  return (
    <div className="min-h-[320px] rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Pill className="h-4 w-4 text-cobalt" />
        <span className="font-semibold">Pharmacy queue</span>
      </div>

      {h('open-pharmacy') && (
        <MockBtn active onClick={() => onStepAction('open-pharmacy')}>
          Open queue
        </MockBtn>
      )}

      <div
        className={cn(
          'mt-3 rounded-lg border p-3',
          (h('select-order') || h('dispense')) && 'ring-2 ring-cobalt',
        )}
      >
        <p className="font-medium">Nakato Mary</p>
        <p className="text-xs">Paracetamol 500mg × 20</p>
        <p className="text-xs">Amoxicillin 250mg × 15</p>
        {h('select-order') && (
          <MockBtn active onClick={() => onStepAction('select-order')}>
            Open order
          </MockBtn>
        )}
        {h('dispense') && (
          <MockBtn active onClick={() => onStepAction('dispense')}>
            Dispense
          </MockBtn>
        )}
      </div>
    </div>
  )
}

export function BillingMock({ activeStepId, onStepAction }: MockProps) {
  const h = (s: string) => activeStepId === s

  return (
    <div className="min-h-[320px] rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <CreditCard className="h-4 w-4 text-cobalt" />
        <span className="font-semibold">Billing</span>
      </div>

      {h('open-billing') && (
        <MockBtn active onClick={() => onStepAction('open-billing')}>
          Open billing desk
        </MockBtn>
      )}

      <div
        className={cn(
          'mt-3 space-y-2',
          (h('find-patient') || h('record-payment')) && 'rounded-lg p-2 ring-2 ring-cobalt',
        )}
      >
        <p className="font-medium">Nakato Mary</p>
        <p className="text-xs text-muted-foreground">Consultation 5,000 · Meds 8,000</p>
        <p className="text-sm font-semibold">Balance: UGX 13,000</p>
        {h('find-patient') && (
          <MockBtn active onClick={() => onStepAction('find-patient')}>
            Select patient
          </MockBtn>
        )}
        {h('record-payment') && (
          <MockBtn active onClick={() => onStepAction('record-payment')}>
            Record payment
          </MockBtn>
        )}
      </div>

      {activeStepId === 'done' && (
        <p className="mt-3 text-xs text-accent">Receipt printed · balance UGX 0</p>
      )}
    </div>
  )
}
