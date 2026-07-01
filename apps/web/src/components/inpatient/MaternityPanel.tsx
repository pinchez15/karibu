'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  recordDelivery,
  recordPostnatalObservation,
} from '@/app/dashboard/inpatient/actions'
import type { DeliveryDetail, PostnatalObservationRow } from '@/app/dashboard/inpatient/types'

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function MaternityPanel({
  admissionId,
  delivery,
  postnatalObs,
}: {
  admissionId: string
  delivery: DeliveryDetail | null
  postnatalObs: PostnatalObservationRow[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [deliveryOpen, setDeliveryOpen] = useState(false)
  const [postnatalSubject, setPostnatalSubject] = useState<'mother' | 'newborn' | null>(null)

  const [mode, setMode] = useState(delivery?.mode ?? '')
  const [outcome, setOutcome] = useState(delivery?.outcome ?? '')
  const [babySex, setBabySex] = useState(delivery?.baby_sex ?? '')
  const [birthWeight, setBirthWeight] = useState(
    delivery?.birth_weight_g != null ? String(delivery.birth_weight_g) : '',
  )
  const [apgar1, setApgar1] = useState(delivery?.apgar_1 != null ? String(delivery.apgar_1) : '')
  const [apgar5, setApgar5] = useState(delivery?.apgar_5 != null ? String(delivery.apgar_5) : '')
  const [bloodLoss, setBloodLoss] = useState(
    delivery?.blood_loss_ml != null ? String(delivery.blood_loss_ml) : '',
  )
  const [oxytocin, setOxytocin] = useState(delivery?.oxytocin_given ?? false)
  const [placentaComplete, setPlacentaComplete] = useState(delivery?.placenta_complete ?? false)
  const [resuscitation, setResuscitation] = useState(delivery?.resuscitation_done ?? false)
  const [vitaminK, setVitaminK] = useState(delivery?.vitamin_k_given ?? false)
  const [earlyBf, setEarlyBf] = useState(delivery?.early_breastfeeding ?? false)
  const [deliveryNotes, setDeliveryNotes] = useState(delivery?.notes ?? '')

  const [tempC, setTempC] = useState('')
  const [pulse, setPulse] = useState('')
  const [resp, setResp] = useState('')
  const [sys, setSys] = useState('')
  const [dia, setDia] = useState('')
  const [bleeding, setBleeding] = useState('')
  const [fundusFirm, setFundusFirm] = useState(false)
  const [feedingWell, setFeedingWell] = useState(false)
  const [notFeeding, setNotFeeding] = useState(false)
  const [convulsions, setConvulsions] = useState(false)
  const [jaundice, setJaundice] = useState(false)
  const [pnNote, setPnNote] = useState('')

  function refresh() {
    router.refresh()
  }

  function saveDelivery() {
    setError(null)
    start(async () => {
      const r = await recordDelivery(admissionId, {
        mode: mode || null,
        outcome: outcome || null,
        babySex: babySex || null,
        birthWeightG: birthWeight ? Number(birthWeight) : null,
        apgar1: apgar1 ? Number(apgar1) : null,
        apgar5: apgar5 ? Number(apgar5) : null,
        bloodLossMl: bloodLoss ? Number(bloodLoss) : null,
        oxytocinGiven: oxytocin,
        placentaComplete,
        resuscitationDone: resuscitation,
        vitaminKGiven: vitaminK,
        earlyBreastfeeding: earlyBf,
        notes: deliveryNotes,
      })
      if (!r.success) {
        setError(r.error)
        return
      }
      setDeliveryOpen(false)
      refresh()
    })
  }

  function savePostnatal() {
    if (!postnatalSubject) return
    setError(null)
    start(async () => {
      const r = await recordPostnatalObservation(admissionId, {
        subject: postnatalSubject,
        tempC: tempC ? Number(tempC) : null,
        pulseBpm: pulse ? Number(pulse) : null,
        respRate: resp ? Number(resp) : null,
        bpSystolic: sys ? Number(sys) : null,
        bpDiastolic: dia ? Number(dia) : null,
        bleeding: bleeding || null,
        fundusFirm: postnatalSubject === 'mother' ? fundusFirm : null,
        feedingWell: postnatalSubject === 'newborn' ? feedingWell : null,
        notFeeding: postnatalSubject === 'newborn' ? notFeeding : false,
        convulsions: postnatalSubject === 'newborn' ? convulsions : false,
        jaundice: postnatalSubject === 'newborn' ? jaundice : false,
        note: pnNote || null,
      })
      if (!r.success) {
        setError(r.error)
        return
      }
      setPostnatalSubject(null)
      setTempC('')
      setPulse('')
      setResp('')
      setSys('')
      setDia('')
      setBleeding('')
      setPnNote('')
      refresh()
    })
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-heading">Delivery</p>
          <Button type="button" variant="outline" size="sm" onClick={() => setDeliveryOpen(true)}>
            {delivery ? 'Edit' : 'Record'}
          </Button>
        </div>
        {delivery ? (
          <p className="mt-2 text-sm text-body">
            {[delivery.mode, delivery.outcome, delivery.baby_sex, delivery.birth_weight_g != null ? `${delivery.birth_weight_g} g` : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No delivery recorded yet.</p>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-heading">Postnatal rounds</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setPostnatalSubject('mother')}>
              Mother check
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setPostnatalSubject('newborn')}>
              Newborn check
            </Button>
          </div>
        </div>
        {postnatalObs.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No postnatal observations yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {postnatalObs.map((o) => (
              <li key={o.id} className="rounded-lg border border-border/60 px-3 py-2 text-sm">
                <span className="font-medium capitalize">{o.subject}</span>
                <span className="text-muted-foreground"> · {formatWhen(o.observed_at)}</span>
                {o.temp_c != null && <span> · {o.temp_c}°C</span>}
                {o.note && <p className="mt-1 text-muted-foreground">{o.note}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Sheet open={deliveryOpen} onOpenChange={setDeliveryOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Delivery record</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            <div>
              <Label>Mode</Label>
              <select className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm" value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="">—</option>
                <option value="svd">SVD</option>
                <option value="assisted">Assisted</option>
                <option value="breech">Breech</option>
                <option value="referred_for_cs">Referred (CS)</option>
              </select>
            </div>
            <div>
              <Label>Outcome</Label>
              <select className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                <option value="">—</option>
                <option value="live">Live birth</option>
                <option value="stillbirth">Stillbirth</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Baby sex</Label>
                <select className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm" value={babySex} onChange={(e) => setBabySex(e.target.value)}>
                  <option value="">—</option>
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                </select>
              </div>
              <div>
                <Label>Birth weight (g)</Label>
                <Input value={birthWeight} onChange={(e) => setBirthWeight(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>APGAR 1</Label>
                <Input value={apgar1} onChange={(e) => setApgar1(e.target.value)} />
              </div>
              <div>
                <Label>APGAR 5</Label>
                <Input value={apgar5} onChange={(e) => setApgar5(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Estimated blood loss (ml)</Label>
              <Input value={bloodLoss} onChange={(e) => setBloodLoss(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={oxytocin} onChange={(e) => setOxytocin(e.target.checked)} />
              Oxytocin given
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={placentaComplete} onChange={(e) => setPlacentaComplete(e.target.checked)} />
              Placenta complete
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={resuscitation} onChange={(e) => setResuscitation(e.target.checked)} />
              Resuscitation done
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={vitaminK} onChange={(e) => setVitaminK(e.target.checked)} />
              Vitamin K given
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={earlyBf} onChange={(e) => setEarlyBf(e.target.checked)} />
              Early breastfeeding
            </label>
            <div>
              <Label>Notes</Label>
              <Input value={deliveryNotes} onChange={(e) => setDeliveryNotes(e.target.value)} />
            </div>
            <Button type="button" disabled={pending} onClick={saveDelivery} className="w-full">
              {pending ? 'Saving…' : 'Save delivery'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={postnatalSubject != null} onOpenChange={(o) => !o && setPostnatalSubject(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>
              {postnatalSubject === 'newborn' ? 'Newborn check' : 'Mother postnatal check'}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Temp (°C)</Label>
                <Input value={tempC} onChange={(e) => setTempC(e.target.value)} />
              </div>
              <div>
                <Label>Pulse</Label>
                <Input value={pulse} onChange={(e) => setPulse(e.target.value)} />
              </div>
            </div>
            {postnatalSubject === 'mother' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>BP sys</Label>
                    <Input value={sys} onChange={(e) => setSys(e.target.value)} />
                  </div>
                  <div>
                    <Label>BP dia</Label>
                    <Input value={dia} onChange={(e) => setDia(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>Bleeding</Label>
                  <select className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm" value={bleeding} onChange={(e) => setBleeding(e.target.value)}>
                    <option value="">—</option>
                    <option value="normal">Normal</option>
                    <option value="heavy">Heavy</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={fundusFirm} onChange={(e) => setFundusFirm(e.target.checked)} />
                  Fundus firm
                </label>
              </>
            )}
            {postnatalSubject === 'newborn' && (
              <>
                <div>
                  <Label>Resp rate</Label>
                  <Input value={resp} onChange={(e) => setResp(e.target.value)} />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={feedingWell} onChange={(e) => setFeedingWell(e.target.checked)} />
                  Feeding well
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={notFeeding} onChange={(e) => setNotFeeding(e.target.checked)} />
                  Not feeding
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={convulsions} onChange={(e) => setConvulsions(e.target.checked)} />
                  Convulsions
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={jaundice} onChange={(e) => setJaundice(e.target.checked)} />
                  Jaundice
                </label>
              </>
            )}
            <div>
              <Label>Note</Label>
              <Input value={pnNote} onChange={(e) => setPnNote(e.target.value)} />
            </div>
            <Button type="button" disabled={pending} onClick={savePostnatal} className="w-full">
              {pending ? 'Saving…' : 'Save round'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
