'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { ArrowLeft, MoreVertical, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { VisitLabPanel } from '@/components/lab/VisitLabPanel'
import { VisitPharmacyPanel } from '@/components/prescription/VisitPharmacyPanel'
import { DueNowPanel } from '@/components/inpatient/DueNowPanel'
import { IvDripPanel } from '@/components/inpatient/IvDripPanel'
import { QuickVitalsBar } from '@/components/inpatient/QuickVitalsBar'
import { MaternityPanel } from '@/components/inpatient/MaternityPanel'
import {
  addAdmissionNote,
  addMedicationOrder,
  dischargeAdmission,
  recordAdmissionObservation,
  referAdmission,
  stopMedicationOrder,
} from '@/app/dashboard/inpatient/actions'
import type {
  AdmissionDetail,
  AdmissionNote,
  AdmissionObservation,
  DeliveryDetail,
  InpatientVisitContext,
  IvInfusion,
  IvInfusionCheck,
  MedicationAdmin,
  MedicationOrder,
  PostnatalObservationRow,
  ObservationInput,
} from '@/app/dashboard/inpatient/types'
import {
  INPATIENT_DANGER_ACTION,
  evaluateInpatientDangerSigns,
} from '@/lib/inpatient-danger-signs'
import { ageYearsFromDob, timeAgo, wardLabel } from '@/lib/inpatient-format'
import { patientDisplayName } from '@/lib/referral-summary'
import type { StaffRole } from '@karibu/shared'
import { cn } from '@/lib/utils'

const DISCHARGE_OUTCOMES = ['recovered', 'improved', 'unchanged', 'absconded', 'died'] as const
const FREQ_OPTIONS = ['STAT', 'OD', 'BD', 'TDS', 'QDS', 'PRN'] as const
type TabId = 'rounds' | 'meds' | 'orders' | 'maternity' | 'notes'

type ChartProps = {
  admission: AdmissionDetail
  observations: AdmissionObservation[]
  medicationOrders: MedicationOrder[]
  medicationAdmins: MedicationAdmin[]
  notes: AdmissionNote[]
  ivInfusions: IvInfusion[]
  ivInfusionChecks: IvInfusionCheck[]
  visit: InpatientVisitContext | null
  staffRole: StaffRole
  delivery: DeliveryDetail | null
  postnatalObs: PostnatalObservationRow[]
}

export function AdmissionChartClient(props: ChartProps) {
  const router = useRouter()
  const [tab, setTab] = useState<TabId>('rounds')
  const [menuOpen, setMenuOpen] = useState(false)
  const [showMed, setShowMed] = useState(false)
  const [showNote, setShowNote] = useState(false)
  const [showDischarge, setShowDischarge] = useState(false)
  const [showRefer, setShowRefer] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { admission } = props
  const patientName = patientDisplayName(admission.patient)
  const ageYears = ageYearsFromDob(admission.patient.date_of_birth)
  const latestObs = props.observations[0] ?? null
  const isMaternity = admission.ward === 'maternity'
  // B1/B3: closed (discharged/transferred) admissions render read-only — the
  // ward reporting/print work needs to view them, but ordering, discharge,
  // and referral only make sense for an active admission.
  const isActive = admission.status === 'active'

  const tabDefs = (
    [
      ['rounds', 'Rounds'],
      ['meds', 'All meds'],
      ...(isActive ? [['orders', 'Lab / Rx'] as const] : []),
      ...(isMaternity ? [['maternity', 'Maternity'] as const] : []),
      ['notes', 'Notes'],
    ] as const
  )

  const dangerFindings = useMemo(() => {
    if (!latestObs) return []
    return evaluateInpatientDangerSigns(
      {
        tempC: latestObs.temp_c,
        pulseBpm: latestObs.pulse_bpm,
        respRate: latestObs.resp_rate,
        bpSystolic: latestObs.bp_systolic,
        bpDiastolic: latestObs.bp_diastolic,
        spo2Pct: latestObs.spo2_pct,
        avpu: latestObs.avpu,
        imciNotFeeding: latestObs.imci_not_feeding,
        imciVomitingEverything: latestObs.imci_vomiting_everything,
        imciConvulsions: latestObs.imci_convulsions,
        imciLethargicUnconscious: latestObs.imci_lethargic_unconscious,
      },
      ageYears,
    )
  }, [latestObs, ageYears])

  const refresh = () => router.refresh()

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-card flex items-center gap-3 shrink-0">
        <Link href="/dashboard/inpatient" className="rounded-md p-1.5 text-muted-foreground hover:bg-background">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold truncate">{patientName}</h1>
          <p className="text-xs text-muted-foreground truncate">
            {[
              wardLabel(admission.ward),
              admission.bed_label ? `Bed ${admission.bed_label}` : null,
              admission.weight_kg != null ? `${admission.weight_kg} kg` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <Link
          href={`/dashboard/inpatient/${admission.id}/print?full=1`}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-background"
          title="Print full chart"
        >
          <Printer className="h-5 w-5" />
        </Link>
        {isActive && (
          <div className="relative">
            <button type="button" onClick={() => setMenuOpen((v) => !v)} className="rounded-md p-2 text-muted-foreground hover:bg-background">
              <MoreVertical className="h-5 w-5" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-md border border-border bg-card py-1 shadow-lg">
                  <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-background" onClick={() => { setMenuOpen(false); setShowRefer(true) }}>Refer out</button>
                  <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-background" onClick={() => { setMenuOpen(false); setShowDischarge(true) }}>Discharge</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Admission reason — always visible */}
      {admission.chief_complaint?.trim() && (
        <div className="shrink-0 px-4 py-2 bg-cobalt-soft/40 border-b border-line-soft">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-cobalt">Reason for admission</p>
          <p className="text-sm font-medium text-foreground">{admission.chief_complaint}</p>
        </div>
      )}

      {error && (
        <p className="shrink-0 px-4 py-1 text-xs text-destructive bg-red-50 border-b border-destructive/20">{error}</p>
      )}

      {dangerFindings.length > 0 && (
        <div className="shrink-0 px-4 py-2 bg-red-50 border-b border-destructive/30">
          <p className="text-[10px] font-bold text-destructive">DANGER SIGN</p>
          <p className="text-xs text-red-900">{dangerFindings.map((f) => f.label).join(' · ')}</p>
          <p className="text-xs font-semibold text-red-900">{INPATIENT_DANGER_ACTION}</p>
        </div>
      )}

      {/* Clinical dock — vitals, due meds, IVs (no scroll). Active admissions only. */}
      {isActive ? (
        <div className="shrink-0 px-4 py-3 space-y-2 border-b border-border bg-card/50">
          <QuickVitalsBar
            admissionId={admission.id}
            latest={latestObs}
            onSaved={refresh}
            onError={setError}
          />
          <div className="grid gap-2 lg:grid-cols-2">
            <DueNowPanel
              admissionId={admission.id}
              orders={props.medicationOrders}
              admins={props.medicationAdmins}
              onRefresh={refresh}
              onError={setError}
              onAddMed={() => setShowMed(true)}
            />
            <IvDripPanel
              admissionId={admission.id}
              infusions={props.ivInfusions}
              checks={props.ivInfusionChecks}
              onRefresh={refresh}
              onError={setError}
            />
          </div>
        </div>
      ) : (
        <DischargeSummaryBanner admission={admission} />
      )}

      {/* Tabs — only this section scrolls */}
      <div className="flex shrink-0 border-b border-border px-4 gap-1 pt-1">
        {tabDefs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id as TabId)}
            className={cn(
              'px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors',
              tab === id ? 'border-cobalt text-cobalt' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-auto px-4 py-3">
        {tab === 'rounds' && (
          <RoundsTab
            admissionId={admission.id}
            observations={props.observations}
            readOnly={!isActive}
            onSaved={refresh}
            onError={setError}
          />
        )}
        {tab === 'meds' && (
          <MedsTab
            admissionId={admission.id}
            orders={props.medicationOrders.filter((o) => o.active)}
            admins={props.medicationAdmins}
            readOnly={!isActive}
            onAdd={() => setShowMed(true)}
            onStop={(orderId) => {
              void stopMedicationOrder(admission.id, orderId).then((r) => {
                if (!r.success) setError(r.error)
                else refresh()
              })
            }}
          />
        )}
        {tab === 'orders' && isActive && props.visit && (
          <OrdersTab visit={props.visit} staffRole={props.staffRole} onSubmitted={refresh} />
        )}
        {tab === 'maternity' && isMaternity && (
          <MaternityPanel
            admissionId={admission.id}
            delivery={props.delivery}
            postnatalObs={props.postnatalObs}
          />
        )}
        {tab === 'notes' && (
          <NotesTab notes={props.notes} readOnly={!isActive} onAdd={() => setShowNote(true)} />
        )}
      </div>

      {isActive && (
        <>
          <AddMedicationSheet open={showMed} onOpenChange={setShowMed} admissionId={admission.id} onSaved={() => { setShowMed(false); refresh() }} onError={setError} />
          <AddNoteSheet open={showNote} onOpenChange={setShowNote} admissionId={admission.id} onSaved={() => { setShowNote(false); refresh() }} onError={setError} />
          <DischargeSheet open={showDischarge} onOpenChange={setShowDischarge} admissionId={admission.id} onDone={() => { router.push('/dashboard/inpatient'); router.refresh() }} onError={setError} />
          <ReferSheet open={showRefer} onOpenChange={setShowRefer} admissionId={admission.id} onDone={() => { router.push('/dashboard/inpatient'); router.refresh() }} onError={setError} />
        </>
      )}
    </div>
  )
}

function DischargeSummaryBanner({ admission }: { admission: AdmissionDetail }) {
  const fmt = (iso: string | null) => {
    if (!iso) return '—'
    const d = new Date(iso)
    return Number.isNaN(d.getTime())
      ? '—'
      : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }
  const statusLabel = admission.status === 'transferred' ? 'Transferred' : 'Discharged'

  return (
    <div className="shrink-0 px-4 py-3 border-b border-border bg-secondary/40">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {statusLabel} · {fmt(admission.discharged_at)}
          </p>
          <p className="text-sm text-foreground capitalize">
            {admission.outcome ?? 'Outcome not recorded'}
            {admission.disposition ? ` · ${admission.disposition}` : ''}
          </p>
        </div>
        <Link
          href={`/dashboard/inpatient/${admission.id}/print`}
          className="inline-flex items-center gap-1.5 rounded-md bg-cobalt px-3 py-1.5 text-xs font-semibold text-white hover:bg-cobalt/90"
        >
          <Printer className="h-3.5 w-3.5" />
          Print discharge summary
        </Link>
      </div>
    </div>
  )
}

function RoundsTab({
  admissionId,
  observations,
  readOnly,
  onSaved,
  onError,
}: {
  admissionId: string
  observations: AdmissionObservation[]
  readOnly?: boolean
  onSaved: () => void
  onError: (msg: string) => void
}) {
  const [pending, startTransition] = useTransition()
  const [avpu, setAvpu] = useState<string | null>(null)
  const [flags, setFlags] = useState({ notFeeding: false, vomiting: false, convulsions: false, lethargic: false })
  const [note, setNote] = useState('')

  function saveFullRound() {
    startTransition(async () => {
      const input: ObservationInput = {
        avpu,
        imciNotFeeding: flags.notFeeding,
        imciVomitingEverything: flags.vomiting,
        imciConvulsions: flags.convulsions,
        imciLethargicUnconscious: flags.lethargic,
        note: note || null,
      }
      const r = await recordAdmissionObservation(admissionId, input)
      if (!r.success) onError(r.error)
      else {
        setAvpu(null)
        setFlags({ notFeeding: false, vomiting: false, convulsions: false, lethargic: false })
        setNote('')
        onSaved()
      }
    })
  }

  return (
    <div className="space-y-3 max-w-xl">
      {!readOnly && (
        <div className="rounded-lg border border-border p-3 space-y-2">
          <p className="text-xs font-semibold">Full round (AVPU + danger signs)</p>
          <div className="flex gap-2">
            {(['A', 'V', 'P', 'U'] as const).map((v) => (
              <button key={v} type="button" onClick={() => setAvpu(avpu === v ? null : v)} className={cn('rounded-md border px-3 py-1 text-sm', avpu === v ? 'border-cobalt bg-cobalt-soft text-cobalt' : 'border-border')}>{v}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1 text-xs">
            {([['notFeeding', 'Not feeding'], ['vomiting', 'Vomiting all'], ['convulsions', 'Convulsions'], ['lethargic', 'Lethargic']] as const).map(([k, label]) => (
              <label key={k} className="flex items-center gap-1.5">
                <input type="checkbox" checked={flags[k]} onChange={(e) => setFlags((f) => ({ ...f, [k]: e.target.checked }))} />
                {label}
              </label>
            ))}
          </div>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Round note" className="h-8 text-sm" />
          <Button size="sm" disabled={pending} onClick={saveFullRound}>Save round details</Button>
        </div>
      )}
      <div className="space-y-2">
        {observations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No observations yet.</p>
        ) : (
          observations.map((obs) => <ObservationRow key={obs.id} obs={obs} />)
        )}
      </div>
    </div>
  )
}

function MedsTab({
  orders,
  admins,
  readOnly,
  onAdd,
  onStop,
}: {
  admissionId: string
  orders: MedicationOrder[]
  admins: MedicationAdmin[]
  readOnly?: boolean
  onAdd: () => void
  onStop: (orderId: string) => void
}) {
  return (
    <div className="space-y-2 max-w-xl">
      {!readOnly && <Button variant="outline" size="sm" onClick={onAdd}>Add medication</Button>}
      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active medications.</p>
      ) : (
        orders.map((o) => {
          const last = admins.find((a) => a.order_id === o.id)
          return (
            <div key={o.id} className="rounded-lg border border-border p-3 text-sm">
              <div className="flex justify-between gap-2">
                <span className="font-semibold">{o.drug_name}</span>
                {!readOnly && (
                  <button type="button" className="text-xs text-muted-foreground hover:text-destructive" onClick={() => onStop(o.id)}>Stop</button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{[o.dose, o.route, o.frequency].filter(Boolean).join(' · ')}</p>
              {last && <p className="text-[10px] text-muted-foreground mt-1">Last: {last.status} {timeAgo(last.administered_at)}</p>}
            </div>
          )
        })
      )}
    </div>
  )
}

function OrdersTab({
  visit,
  staffRole,
  onSubmitted,
}: {
  visit: InpatientVisitContext
  staffRole: StaffRole
  onSubmitted: () => void
}) {
  return (
    <div className="max-w-2xl space-y-4">
      <VisitLabPanel visitId={visit.visitId} staffRole={staffRole} onSubmitted={onSubmitted} />
      {visit.pharmacy_order_submitted_at ? (
        <p className="text-xs text-green font-medium">Sent to pharmacy</p>
      ) : (
        <VisitPharmacyPanel visitId={visit.visitId} alreadySubmitted={false} staffRole={staffRole} onSubmitted={onSubmitted} />
      )}
    </div>
  )
}

function NotesTab({ notes, readOnly, onAdd }: { notes: AdmissionNote[]; readOnly?: boolean; onAdd: () => void }) {
  return (
    <div className="space-y-2 max-w-xl">
      {!readOnly && <Button variant="outline" size="sm" onClick={onAdd}>Add note</Button>}
      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No progress notes yet.</p>
      ) : (
        notes.map((n) => (
          <div key={n.id} className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">{timeAgo(n.created_at)}{n.author_name ? ` · ${n.author_name}` : ''}</p>
            <p className="text-sm mt-1 whitespace-pre-wrap">{n.note}</p>
          </div>
        ))
      )}
    </div>
  )
}

function ObservationRow({ obs }: { obs: AdmissionObservation }) {
  const vitals = [
    obs.temp_c != null ? `T ${obs.temp_c}°C` : null,
    obs.pulse_bpm != null ? `P ${obs.pulse_bpm}` : null,
    obs.resp_rate != null ? `RR ${obs.resp_rate}` : null,
    obs.bp_systolic != null ? `BP ${obs.bp_systolic}/${obs.bp_diastolic ?? '—'}` : null,
    obs.avpu ? `AVPU ${obs.avpu}` : null,
  ].filter(Boolean).join(' · ')
  return (
    <div className="rounded-lg border border-border p-2.5 text-sm">
      <p className="text-xs text-muted-foreground">{timeAgo(obs.observed_at)}</p>
      {vitals && <p className="mt-0.5">{vitals}</p>}
      {obs.note?.trim() && <p className="text-xs text-body mt-1">{obs.note}</p>}
    </div>
  )
}

function AddMedicationSheet({
  open,
  onOpenChange,
  admissionId,
  onSaved,
  onError,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  admissionId: string
  onSaved: () => void
  onError: (msg: string) => void
}) {
  const [pending, startTransition] = useTransition()
  const [drug, setDrug] = useState('')
  const [dose, setDose] = useState('')
  const [route, setRoute] = useState('PO')
  const [freq, setFreq] = useState('BD')
  const [instr, setInstr] = useState('')

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader><SheetTitle>Add medication</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-3 px-1">
          <Input value={drug} onChange={(e) => setDrug(e.target.value)} placeholder="Drug name" />
          <div className="grid grid-cols-2 gap-2">
            <Input value={dose} onChange={(e) => setDose(e.target.value)} placeholder="Dose" />
            <Input value={route} onChange={(e) => setRoute(e.target.value)} placeholder="Route" />
          </div>
          <div>
            <p className="text-xs font-medium mb-1">Frequency</p>
            <div className="flex flex-wrap gap-1">
              {FREQ_OPTIONS.map((f) => (
                <button key={f} type="button" onClick={() => setFreq(f)} className={cn('rounded-md border px-2 py-1 text-xs', freq === f ? 'border-cobalt bg-cobalt-soft text-cobalt' : 'border-border')}>{f}</button>
              ))}
            </div>
          </div>
          <Input value={instr} onChange={(e) => setInstr(e.target.value)} placeholder="Instructions (optional)" />
          <Button className="w-full" disabled={!drug.trim() || pending} onClick={() => {
            startTransition(async () => {
              const r = await addMedicationOrder(admissionId, { drugName: drug, dose, route, frequency: freq, instructions: instr })
              if (!r.success) onError(r.error)
              else { setDrug(''); onSaved() }
            })
          }}>{pending ? 'Adding…' : 'Add to chart'}</Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function AddNoteSheet({ open, onOpenChange, admissionId, onSaved, onError }: { open: boolean; onOpenChange: (v: boolean) => void; admissionId: string; onSaved: () => void; onError: (msg: string) => void }) {
  const [pending, startTransition] = useTransition()
  const [text, setText] = useState('')
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader><SheetTitle>Progress note</SheetTitle></SheetHeader>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} className="mt-4 w-full rounded-md border border-border px-3 py-2 text-sm" />
        <Button className="w-full mt-3" disabled={!text.trim() || pending} onClick={() => {
          startTransition(async () => {
            const r = await addAdmissionNote(admissionId, text)
            if (!r.success) onError(r.error)
            else { setText(''); onSaved() }
          })
        }}>{pending ? 'Saving…' : 'Save note'}</Button>
      </SheetContent>
    </Sheet>
  )
}

function DischargeSheet({ open, onOpenChange, admissionId, onDone, onError }: { open: boolean; onOpenChange: (v: boolean) => void; admissionId: string; onDone: () => void; onError: (msg: string) => void }) {
  const [pending, startTransition] = useTransition()
  const [outcome, setOutcome] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader><SheetTitle>Discharge</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-3 px-1">
          <div className="flex flex-wrap gap-2">
            {DISCHARGE_OUTCOMES.map((o) => (
              <button key={o} type="button" onClick={() => setOutcome(o)} className={cn('rounded-full border px-3 py-1 text-xs capitalize', outcome === o ? 'border-cobalt bg-cobalt-soft text-cobalt' : 'border-border')}>{o}</button>
            ))}
          </div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-md border border-border px-3 py-2 text-sm" placeholder="Notes" />
          <Button className="w-full" disabled={!outcome || pending} onClick={() => {
            startTransition(async () => {
              const r = await dischargeAdmission(admissionId, { outcome: outcome!, disposition: 'home', notes })
              if (!r.success) onError(r.error)
              else { onOpenChange(false); onDone() }
            })
          }}>Confirm discharge</Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function ReferSheet({ open, onOpenChange, admissionId, onDone, onError }: { open: boolean; onOpenChange: (v: boolean) => void; admissionId: string; onDone: () => void; onError: (msg: string) => void }) {
  const [pending, startTransition] = useTransition()
  const [facility, setFacility] = useState('')
  const [reason, setReason] = useState('')
  const [urgency, setUrgency] = useState<'routine' | 'urgent' | 'emergency'>('urgent')
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader><SheetTitle>Refer out</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-3 px-1">
          <Input value={facility} onChange={(e) => setFacility(e.target.value)} placeholder="Receiving facility" />
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="w-full rounded-md border border-border px-3 py-2 text-sm" placeholder="Reason" />
          <Button className="w-full" disabled={!facility.trim() || !reason.trim() || pending} onClick={() => {
            startTransition(async () => {
              const r = await referAdmission(admissionId, { toFacility: facility, urgency, reason })
              if (!r.success) onError(r.error)
              else { onOpenChange(false); onDone() }
            })
          }}>Confirm referral</Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
