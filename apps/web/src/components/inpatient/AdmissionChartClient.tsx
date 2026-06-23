'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { ArrowLeft, MoreVertical } from 'lucide-react'
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
import {
  addAdmissionNote,
  addMedicationOrder,
  dischargeAdmission,
  recordAdmissionObservation,
  recordMedicationAdmin,
  referAdmission,
  stopMedicationOrder,
} from '@/app/dashboard/inpatient/actions'
import type {
  AdmissionDetail,
  AdmissionNote,
  AdmissionObservation,
  InpatientVisitContext,
  MedicationAdmin,
  MedicationOrder,
  ObservationInput,
} from '@/app/dashboard/inpatient/types'
import {
  INPATIENT_DANGER_ACTION,
  checkObservationRanges,
  evaluateInpatientDangerSigns,
} from '@/lib/inpatient-danger-signs'
import { ageYearsFromDob, timeAgo, wardLabel } from '@/lib/inpatient-format'
import { patientDisplayName } from '@/lib/referral-summary'
import type { StaffRole } from '@karibu/shared'
import { cn } from '@/lib/utils'

const NOT_GIVEN_REASONS = ['Out of stock', 'Refused', 'Nil by mouth', 'Patient absent', 'Other']
const DISCHARGE_OUTCOMES = ['recovered', 'improved', 'unchanged', 'absconded', 'died'] as const

type ChartProps = {
  admission: AdmissionDetail
  observations: AdmissionObservation[]
  medicationOrders: MedicationOrder[]
  medicationAdmins: MedicationAdmin[]
  notes: AdmissionNote[]
  visit: InpatientVisitContext | null
  staffRole: StaffRole
}

export function AdmissionChartClient(props: ChartProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [menuOpen, setMenuOpen] = useState(false)
  const [showObs, setShowObs] = useState(false)
  const [showMed, setShowMed] = useState(false)
  const [showNote, setShowNote] = useState(false)
  const [showDischarge, setShowDischarge] = useState(false)
  const [showRefer, setShowRefer] = useState(false)
  const [notGivenOrderId, setNotGivenOrderId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { admission } = props
  const patientName = patientDisplayName(admission.patient)
  const ageYears = ageYearsFromDob(admission.patient.date_of_birth)

  const dangerFindings = useMemo(() => {
    const latest = props.observations[0]
    if (!latest) return []
    return evaluateInpatientDangerSigns(
      {
        tempC: latest.temp_c,
        pulseBpm: latest.pulse_bpm,
        respRate: latest.resp_rate,
        bpSystolic: latest.bp_systolic,
        bpDiastolic: latest.bp_diastolic,
        spo2Pct: latest.spo2_pct,
        avpu: latest.avpu,
        imciNotFeeding: latest.imci_not_feeding,
        imciVomitingEverything: latest.imci_vomiting_everything,
        imciConvulsions: latest.imci_convulsions,
        imciLethargicUnconscious: latest.imci_lethargic_unconscious,
      },
      ageYears,
    )
  }, [props.observations, ageYears])

  const activeOrders = props.medicationOrders.filter((o) => o.active)

  function onDischarged() {
    router.push('/dashboard/inpatient')
    router.refresh()
  }

  return (
    <>
      <div className="px-6 py-4 border-b border-border bg-card flex items-center gap-3 shrink-0">
        <Link
          href="/dashboard/inpatient"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-semibold truncate flex-1">{patientName}</h1>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-md p-2 text-muted-foreground hover:bg-background"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-md border border-border bg-card py-1 shadow-lg">
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-background"
                  onClick={() => {
                    setMenuOpen(false)
                    setShowRefer(true)
                  }}
                >
                  Refer out
                </button>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-background"
                  onClick={() => {
                    setMenuOpen(false)
                    setShowDischarge(true)
                  }}
                >
                  Discharge
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="p-6 overflow-auto flex-1 space-y-4 max-w-3xl">
        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="rounded-xl border border-border bg-card p-4 space-y-1">
          <p className="font-medium text-sm">
            {[
              wardLabel(admission.ward),
              admission.bed_label ? `Bed ${admission.bed_label}` : null,
              admission.weight_kg != null ? `${admission.weight_kg} kg` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {admission.chief_complaint?.trim() && (
            <p className="text-sm text-body">{admission.chief_complaint}</p>
          )}
          {admission.ward === 'maternity' && (
            <p className="text-xs text-muted-foreground">
              {[
                admission.gravida != null ? `G${admission.gravida}` : null,
                admission.para != null ? `P${admission.para}` : null,
                admission.gestation_weeks != null ? `${admission.gestation_weeks} wk` : null,
                admission.presenting_status,
                admission.hiv_status ? `HIV: ${admission.hiv_status}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </div>

        {dangerFindings.length > 0 && (
          <div className="rounded-xl border border-destructive/30 bg-red-50 p-4">
            <p className="text-xs font-bold text-destructive">DANGER SIGN</p>
            <ul className="mt-2 space-y-1 text-sm text-red-900">
              {dangerFindings.map((f) => (
                <li key={f.slug}>• {f.label}</li>
              ))}
            </ul>
            <p className="mt-2 text-sm font-semibold text-red-900">{INPATIENT_DANGER_ACTION}</p>
          </div>
        )}

        {/* Lab & pharmacy orders */}
        {props.visit && (
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold mb-1">Orders</h2>
            <p className="text-xs text-muted-foreground mb-3">
              Lab and pharmacy queues use the linked encounter for this admission.
            </p>
            {props.visit.tests_ordered && (
              <p className="text-xs text-body mb-2">
                <span className="font-medium">Labs:</span> {props.visit.tests_ordered}
                {props.visit.lab_status && props.visit.lab_status !== 'not_ordered' && (
                  <span className="ml-2 text-muted-foreground">({props.visit.lab_status})</span>
                )}
              </p>
            )}
            <VisitLabPanel
              visitId={props.visit.visitId}
              staffRole={props.staffRole}
              onSubmitted={() => router.refresh()}
            />
            {props.visit.pharmacy_order_submitted_at ? (
              <p className="text-xs text-green font-medium mt-3">Sent to pharmacy</p>
            ) : (
              <VisitPharmacyPanel
                visitId={props.visit.visitId}
                alreadySubmitted={false}
                staffRole={props.staffRole}
                onSubmitted={() => router.refresh()}
              />
            )}
          </section>
        )}

        {/* Treatment */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold">Treatment</h2>
            <Button variant="ghost" size="sm" onClick={() => setShowMed(true)}>
              Add medication
            </Button>
          </div>
          {activeOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active medications.</p>
          ) : (
            <div className="space-y-3">
              {activeOrders.map((order) => (
                <MedicationOrderCard
                  key={order.id}
                  order={order}
                  lastAdmin={props.medicationAdmins.find((a) => a.order_id === order.id)}
                  pending={pending}
                  onGive={() => {
                    setError(null)
                    startTransition(async () => {
                      const r = await recordMedicationAdmin(admission.id, order.id, true)
                      if (!r.success) setError(r.error)
                      else router.refresh()
                    })
                  }}
                  onNotGiven={() => setNotGivenOrderId(order.id)}
                  onStop={() => {
                    setError(null)
                    startTransition(async () => {
                      const r = await stopMedicationOrder(admission.id, order.id)
                      if (!r.success) setError(r.error)
                      else router.refresh()
                    })
                  }}
                />
              ))}
            </div>
          )}
        </section>

        <Button className="w-full" onClick={() => setShowObs(true)}>
          Record observation
        </Button>

        {/* Rounds */}
        <section>
          <h2 className="text-sm font-semibold mb-2">Rounds</h2>
          {props.observations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No observations yet.</p>
          ) : (
            <div className="space-y-2">
              {props.observations.map((obs) => (
                <ObservationRow key={obs.id} obs={obs} />
              ))}
            </div>
          )}
        </section>

        {/* Progress notes */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold">Progress notes</h2>
            <Button variant="ghost" size="sm" onClick={() => setShowNote(true)}>
              Add note
            </Button>
          </div>
          {props.notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No progress notes yet.</p>
          ) : (
            <div className="space-y-2">
              {props.notes.map((note) => (
                <div key={note.id} className="rounded-xl border border-border bg-card p-3">
                  <p className="text-xs text-muted-foreground font-medium">
                    {timeAgo(note.created_at)}
                    {note.author_name ? ` · ${note.author_name}` : ''}
                  </p>
                  <p className="mt-1 text-sm whitespace-pre-wrap">{note.note}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <RecordObservationSheet
        open={showObs}
        onOpenChange={setShowObs}
        admissionId={admission.id}
        onSaved={() => {
          setShowObs(false)
          router.refresh()
        }}
        onError={setError}
      />

      <AddMedicationSheet
        open={showMed}
        onOpenChange={setShowMed}
        admissionId={admission.id}
        onSaved={() => {
          setShowMed(false)
          router.refresh()
        }}
        onError={setError}
      />

      <AddNoteSheet
        open={showNote}
        onOpenChange={setShowNote}
        admissionId={admission.id}
        onSaved={() => {
          setShowNote(false)
          router.refresh()
        }}
        onError={setError}
      />

      <DischargeSheet
        open={showDischarge}
        onOpenChange={setShowDischarge}
        admissionId={admission.id}
        onDone={onDischarged}
        onError={setError}
      />

      <ReferSheet
        open={showRefer}
        onOpenChange={setShowRefer}
        admissionId={admission.id}
        onDone={onDischarged}
        onError={setError}
      />

      {notGivenOrderId && (
        <NotGivenDialog
          onPick={(reason) => {
            const orderId = notGivenOrderId
            setNotGivenOrderId(null)
            setError(null)
            startTransition(async () => {
              const r = await recordMedicationAdmin(admission.id, orderId, false, reason)
              if (!r.success) setError(r.error)
              else router.refresh()
            })
          }}
          onDismiss={() => setNotGivenOrderId(null)}
        />
      )}
    </>
  )
}

function MedicationOrderCard({
  order,
  lastAdmin,
  pending,
  onGive,
  onNotGiven,
  onStop,
}: {
  order: MedicationOrder
  lastAdmin?: MedicationAdmin
  pending: boolean
  onGive: () => void
  onNotGiven: () => void
  onStop: () => void
}) {
  const detail = [order.dose, order.route, order.frequency].filter(Boolean).join(' · ')
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="font-semibold text-sm">{order.drug_name}</p>
      {detail && <p className="text-sm text-muted-foreground">{detail}</p>}
      {order.instructions?.trim() && (
        <p className="text-xs text-muted-foreground mt-1">{order.instructions}</p>
      )}
      {lastAdmin && (
        <p
          className={cn(
            'text-xs mt-2',
            lastAdmin.status === 'given' ? 'text-muted-foreground' : 'text-destructive',
          )}
        >
          Last: {lastAdmin.status === 'given' ? 'given' : `not given (${lastAdmin.not_given_reason ?? '—'})`}{' '}
          {timeAgo(lastAdmin.administered_at)}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" disabled={pending} onClick={onGive}>
          Give
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={onNotGiven}>
          Not given
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={onStop} className="ml-auto">
          Stop
        </Button>
      </div>
    </div>
  )
}

function ObservationRow({ obs }: { obs: AdmissionObservation }) {
  const vitals = [
    obs.temp_c != null ? `T ${obs.temp_c}°C` : null,
    obs.pulse_bpm != null ? `P ${obs.pulse_bpm}` : null,
    obs.resp_rate != null ? `RR ${obs.resp_rate}` : null,
    obs.bp_systolic != null ? `BP ${obs.bp_systolic}/${obs.bp_diastolic ?? '—'}` : null,
    obs.spo2_pct != null ? `SpO₂ ${obs.spo2_pct}%` : null,
    obs.avpu ? `AVPU ${obs.avpu}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const imci = [
    obs.imci_not_feeding ? 'Not feeding' : null,
    obs.imci_vomiting_everything ? 'Vomiting all' : null,
    obs.imci_convulsions ? 'Convulsions' : null,
    obs.imci_lethargic_unconscious ? 'Lethargic' : null,
  ].filter(Boolean)

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-xs font-medium text-muted-foreground">{timeAgo(obs.observed_at)}</p>
      {vitals && <p className="mt-1 text-sm">{vitals}</p>}
      {imci.length > 0 && <p className="text-xs text-destructive mt-1">{imci.join(' · ')}</p>}
      {obs.note?.trim() && <p className="text-sm text-body mt-1">{obs.note}</p>}
    </div>
  )
}

function RecordObservationSheet({
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
  const [confirmWarnings, setConfirmWarnings] = useState<string[] | null>(null)
  const [pendingInput, setPendingInput] = useState<ObservationInput | null>(null)
  const [temp, setTemp] = useState('')
  const [pulse, setPulse] = useState('')
  const [resp, setResp] = useState('')
  const [sys, setSys] = useState('')
  const [dia, setDia] = useState('')
  const [spo2, setSpo2] = useState('')
  const [avpu, setAvpu] = useState<string | null>(null)
  const [flags, setFlags] = useState({
    notFeeding: false,
    vomiting: false,
    convulsions: false,
    lethargic: false,
  })
  const [note, setNote] = useState('')

  function buildInput(): ObservationInput {
    return {
      tempC: temp ? Number(temp) : null,
      pulseBpm: pulse ? Number(pulse) : null,
      respRate: resp ? Number(resp) : null,
      bpSystolic: sys ? Number(sys) : null,
      bpDiastolic: dia ? Number(dia) : null,
      spo2Pct: spo2 ? Number(spo2) : null,
      avpu,
      imciNotFeeding: flags.notFeeding,
      imciVomitingEverything: flags.vomiting,
      imciConvulsions: flags.convulsions,
      imciLethargicUnconscious: flags.lethargic,
      note: note || null,
    }
  }

  function save(input: ObservationInput) {
    startTransition(async () => {
      const r = await recordAdmissionObservation(admissionId, input)
      if (!r.success) {
        onError(r.error)
        return
      }
      setTemp('')
      setPulse('')
      setResp('')
      setSys('')
      setDia('')
      setSpo2('')
      setAvpu(null)
      setFlags({ notFeeding: false, vomiting: false, convulsions: false, lethargic: false })
      setNote('')
      setConfirmWarnings(null)
      setPendingInput(null)
      onSaved()
    })
  }

  function trySave() {
    const input = buildInput()
    const warnings = checkObservationRanges({
      tempC: input.tempC,
      pulseBpm: input.pulseBpm,
      respRate: input.respRate,
      bpSystolic: input.bpSystolic,
      bpDiastolic: input.bpDiastolic,
      spo2Pct: input.spo2Pct,
    })
    if (warnings.length > 0) {
      setPendingInput(input)
      setConfirmWarnings(warnings)
      return
    }
    save(input)
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Record observation</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4 px-1">
            <div className="grid grid-cols-3 gap-2">
              <NumField label="Temp °C" value={temp} onChange={setTemp} decimal />
              <NumField label="Pulse" value={pulse} onChange={setPulse} />
              <NumField label="Resp" value={resp} onChange={setResp} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <NumField label="BP sys" value={sys} onChange={setSys} />
              <NumField label="BP dia" value={dia} onChange={setDia} />
              <NumField label="SpO₂" value={spo2} onChange={setSpo2} />
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Consciousness (AVPU)</p>
              <div className="flex gap-2">
                {(['A', 'V', 'P', 'U'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setAvpu(avpu === v ? null : v)}
                    className={cn(
                      'rounded-md border px-3 py-1.5 text-sm font-medium',
                      avpu === v
                        ? 'border-cobalt bg-cobalt-soft text-cobalt'
                        : 'border-border',
                    )}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Danger signs (under 5)</p>
              <div className="space-y-2 text-sm">
                {(
                  [
                    ['notFeeding', 'Not feeding / drinking'],
                    ['vomiting', 'Vomiting everything'],
                    ['convulsions', 'Convulsions'],
                    ['lethargic', 'Lethargic / unconscious'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={flags[key]}
                      onChange={(e) => setFlags((f) => ({ ...f, [key]: e.target.checked }))}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Note (optional)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
              />
            </div>
            <Button className="w-full" disabled={pending} onClick={trySave}>
              {pending ? 'Saving…' : 'Save round'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {confirmWarnings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-card p-5 shadow-lg">
            <h3 className="font-semibold">Check these values</h3>
            <ul className="mt-3 space-y-1 text-sm text-body">
              {confirmWarnings.map((w) => (
                <li key={w}>• {w}</li>
              ))}
            </ul>
            <div className="mt-4 flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setConfirmWarnings(null)}>
                Go back
              </Button>
              <Button
                onClick={() => pendingInput && save(pendingInput)}
                disabled={pending}
              >
                Save anyway
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function NumField({
  label,
  value,
  onChange,
  decimal = false,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  decimal?: boolean
}) {
  return (
    <div>
      <label className="text-xs font-medium">{label}</label>
      <Input
        value={value}
        onChange={(e) => {
          const v = e.target.value
          onChange(v.replace(decimal ? /[^\d.]/g : /\D/g, ''))
        }}
        inputMode={decimal ? 'decimal' : 'numeric'}
        className="mt-1"
      />
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
  const [route, setRoute] = useState('')
  const [freq, setFreq] = useState('')
  const [instr, setInstr] = useState('')

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add medication</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-3 px-1">
          <div>
            <label className="text-sm font-medium">Drug</label>
            <Input value={drug} onChange={(e) => setDrug(e.target.value)} className="mt-1" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs font-medium">Dose</label>
              <Input value={dose} onChange={(e) => setDose(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium">Route</label>
              <Input value={route} onChange={(e) => setRoute(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium">Freq</label>
              <Input value={freq} onChange={(e) => setFreq(e.target.value)} className="mt-1" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Instructions (optional)</label>
            <Input value={instr} onChange={(e) => setInstr(e.target.value)} className="mt-1" />
          </div>
          <Button
            className="w-full"
            disabled={!drug.trim() || pending}
            onClick={() => {
              startTransition(async () => {
                const r = await addMedicationOrder(admissionId, {
                  drugName: drug,
                  dose,
                  route,
                  frequency: freq,
                  instructions: instr,
                })
                if (!r.success) {
                  onError(r.error)
                  return
                }
                setDrug('')
                setDose('')
                setRoute('')
                setFreq('')
                setInstr('')
                onSaved()
              })
            }}
          >
            {pending ? 'Adding…' : 'Add to chart'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function AddNoteSheet({
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
  const [text, setText] = useState('')

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Progress note</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-3 px-1">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
            placeholder="Note…"
          />
          <Button
            className="w-full"
            disabled={!text.trim() || pending}
            onClick={() => {
              startTransition(async () => {
                const r = await addAdmissionNote(admissionId, text)
                if (!r.success) {
                  onError(r.error)
                  return
                }
                setText('')
                onSaved()
              })
            }}
          >
            {pending ? 'Saving…' : 'Save note'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function DischargeSheet({
  open,
  onOpenChange,
  admissionId,
  onDone,
  onError,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  admissionId: string
  onDone: () => void
  onError: (msg: string) => void
}) {
  const [pending, startTransition] = useTransition()
  const [outcome, setOutcome] = useState<string | null>(null)
  const [notes, setNotes] = useState('')

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Discharge</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4 px-1">
          <div>
            <p className="text-sm font-medium mb-2">Outcome</p>
            <div className="flex flex-wrap gap-2">
              {DISCHARGE_OUTCOMES.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setOutcome(o)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium capitalize',
                    outcome === o
                      ? 'border-cobalt bg-cobalt-soft text-cobalt'
                      : 'border-border',
                  )}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
            />
          </div>
          <Button
            className="w-full"
            disabled={!outcome || pending}
            onClick={() => {
              startTransition(async () => {
                const r = await dischargeAdmission(admissionId, {
                  outcome: outcome!,
                  disposition: 'home',
                  notes,
                })
                if (!r.success) {
                  onError(r.error)
                  return
                }
                onOpenChange(false)
                onDone()
              })
            }}
          >
            {pending ? 'Discharging…' : 'Confirm discharge'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function ReferSheet({
  open,
  onOpenChange,
  admissionId,
  onDone,
  onError,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  admissionId: string
  onDone: () => void
  onError: (msg: string) => void
}) {
  const [pending, startTransition] = useTransition()
  const [facility, setFacility] = useState('')
  const [reason, setReason] = useState('')
  const [transport, setTransport] = useState('')
  const [urgency, setUrgency] = useState<'routine' | 'urgent' | 'emergency'>('urgent')

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Refer out</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-3 px-1">
          <div>
            <label className="text-sm font-medium">Receiving facility</label>
            <Input value={facility} onChange={(e) => setFacility(e.target.value)} className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium">Reason</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Urgency</label>
            <div className="mt-1 flex gap-2">
              {(['routine', 'urgent', 'emergency'] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUrgency(u)}
                  className={cn(
                    'rounded-md border px-2 py-1 text-xs capitalize',
                    urgency === u ? 'border-cobalt bg-cobalt-soft text-cobalt' : 'border-border',
                  )}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Transport (optional)</label>
            <Input value={transport} onChange={(e) => setTransport(e.target.value)} className="mt-1" />
          </div>
          <Button
            className="w-full"
            disabled={!facility.trim() || !reason.trim() || pending}
            onClick={() => {
              startTransition(async () => {
                const r = await referAdmission(admissionId, {
                  toFacility: facility,
                  urgency,
                  reason,
                  transportMode: transport,
                })
                if (!r.success) {
                  onError(r.error)
                  return
                }
                onOpenChange(false)
                onDone()
              })
            }}
          >
            {pending ? 'Referring…' : 'Confirm referral'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function NotGivenDialog({
  onPick,
  onDismiss,
}: {
  onPick: (reason: string) => void
  onDismiss: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-card p-5 shadow-lg">
        <h3 className="font-semibold">Why not given?</h3>
        <div className="mt-3 space-y-1">
          {NOT_GIVEN_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-background"
              onClick={() => onPick(r)}
            >
              {r}
            </button>
          ))}
        </div>
        <Button variant="ghost" className="mt-2 w-full" onClick={onDismiss}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
