'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  ANC_SCHEDULE_WEEKS,
  IPTP_TARGET,
  ancProtocolStatus,
} from '@/lib/anc-protocol'
import { patientDisplayName } from '@/lib/referral-summary'
import { cn } from '@/lib/utils'
import { recordAncContact } from '../actions'
import type { AncContactRow, PregnancyDetail } from '../actions'

function formatDate(iso: string): string {
  const d = new Date(iso.slice(0, 10))
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function ContactCard({ contact }: { contact: AncContactRow }) {
  const vitals = [
    contact.bp_systolic != null && contact.bp_diastolic != null
      ? `BP ${contact.bp_systolic}/${contact.bp_diastolic}`
      : null,
    contact.weight_kg != null ? `Wt ${contact.weight_kg}kg` : null,
    contact.fundal_height_cm != null ? `FH ${contact.fundal_height_cm}cm` : null,
    contact.fetal_heart_rate != null ? `FHR ${contact.fetal_heart_rate}` : null,
    contact.urine_protein ? `urine ${contact.urine_protein}` : null,
    contact.hb != null ? `Hb ${contact.hb}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const given = [
    contact.iptp_given && 'IPTp',
    contact.ifas_given && 'IFAS',
    contact.td_given && 'Td',
    contact.dewormed && 'dewormed',
    contact.itn_given && 'ITN',
  ]
    .filter(Boolean)
    .join(', ')

  const title = [
    contact.contact_number != null ? `Contact ${contact.contact_number}` : null,
    contact.gestation_weeks != null ? `${contact.gestation_weeks}wk` : null,
    formatDate(contact.contact_date),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-sm font-medium text-heading">{title}</p>
      {vitals && <p className="mt-1 text-sm text-body">{vitals}</p>}
      {given && <p className="mt-1 text-xs text-muted-foreground">Given: {given}</p>}
      {contact.notes && <p className="mt-1 text-sm text-muted-foreground">{contact.notes}</p>}
    </div>
  )
}

export function PregnancyDetailClient({
  pregnancy,
  contacts: initialContacts,
}: {
  pregnancy: PregnancyDetail
  contacts: AncContactRow[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [bpSys, setBpSys] = useState('')
  const [bpDia, setBpDia] = useState('')
  const [weightKg, setWeightKg] = useState('')
  const [fundalHeight, setFundalHeight] = useState('')
  const [fhr, setFhr] = useState('')
  const [urine, setUrine] = useState<'neg' | '+' | '++' | '+++' | ''>('')
  const [hb, setHb] = useState('')
  const [iptp, setIptp] = useState(false)
  const [ifas, setIfas] = useState(false)
  const [td, setTd] = useState(false)
  const [dewormed, setDewormed] = useState(false)
  const [itn, setItn] = useState(false)
  const [notes, setNotes] = useState('')

  const status = ancProtocolStatus({
    lmp: pregnancy.lmp,
    edd: pregnancy.edd,
    contactsDone: pregnancy.contact_count,
    iptpDone: pregnancy.iptp_count,
  })

  const displayName =
    pregnancy.patient_name ||
    (pregnancy.patient ? patientDisplayName(pregnancy.patient) : 'Mother')

  function resetForm() {
    setBpSys('')
    setBpDia('')
    setWeightKg('')
    setFundalHeight('')
    setFhr('')
    setUrine('')
    setHb('')
    setIptp(false)
    setIfas(false)
    setTd(false)
    setDewormed(false)
    setItn(false)
    setNotes('')
    setError(null)
  }

  function saveContact() {
    setError(null)
    startTransition(async () => {
      const result = await recordAncContact({
        pregnancy_id: pregnancy.id,
        bp_systolic: bpSys ? Number(bpSys) : undefined,
        bp_diastolic: bpDia ? Number(bpDia) : undefined,
        weight_kg: weightKg ? Number(weightKg) : undefined,
        fundal_height_cm: fundalHeight ? Number(fundalHeight) : undefined,
        fetal_heart_rate: fhr ? Number(fhr) : undefined,
        urine_protein: urine || undefined,
        hb: hb ? Number(hb) : undefined,
        iptp_given: iptp,
        ifas_given: ifas,
        td_given: td,
        dewormed,
        itn_given: itn,
        notes: notes || undefined,
      })
      if (!result.success) {
        setError(result.error)
        return
      }
      setSheetOpen(false)
      resetForm()
      router.refresh()
    })
  }

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-lg font-semibold text-heading">{displayName}</h2>
          <p className="mt-1 text-sm text-body">
            {[
              status.gestationWeeks != null ? `${status.gestationWeeks} weeks` : null,
              pregnancy.edd ? `EDD ${formatDate(pregnancy.edd)}` : null,
              `G${pregnancy.gravida ?? '?'}P${pregnancy.para ?? '?'}`,
              pregnancy.hiv_status ? `HIV ${pregnancy.hiv_status}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {pregnancy.risk_notes && (
            <p className="mt-2 text-sm text-destructive">Risk: {pregnancy.risk_notes}</p>
          )}
        </div>

        <div className="rounded-xl bg-background p-4">
          <p className="text-sm font-semibold text-heading">Protocol status</p>
          <p className="mt-2 text-sm text-body">
            ANC contacts: {status.contactsDone} done / {status.contactsDue} due (ANC8 at weeks{' '}
            {ANC_SCHEDULE_WEEKS.join(', ')})
          </p>
          <p className="text-sm text-body">
            IPTp-SP: {status.iptpDone} / {IPTP_TARGET}
          </p>
          {status.gaps.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {status.gaps.map((gap) => (
                <span
                  key={gap}
                  className="rounded-full bg-cobalt/10 px-2 py-0.5 text-xs font-semibold text-cobalt"
                >
                  {gap}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Up to date</p>
          )}
        </div>

        <Button
          onClick={() => setSheetOpen(true)}
          className="w-full bg-cobalt hover:bg-cobalt/90"
        >
          Record ANC contact
        </Button>

        <div>
          <p className="mb-2 text-sm font-semibold text-heading">Contacts</p>
          {initialContacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No contacts recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {initialContacts.map((c) => (
                <ContactCard key={c.id} contact={c} />
              ))}
            </div>
          )}
        </div>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>ANC contact</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs font-medium">BP sys</label>
                <Input value={bpSys} onChange={(e) => setBpSys(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium">BP dia</label>
                <Input value={bpDia} onChange={(e) => setBpDia(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium">Weight (kg)</label>
                <Input value={weightKg} onChange={(e) => setWeightKg(e.target.value)} className="mt-1" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium">Fundal height (cm)</label>
                <Input value={fundalHeight} onChange={(e) => setFundalHeight(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium">FHR</label>
                <Input value={fhr} onChange={(e) => setFhr(e.target.value)} className="mt-1" />
              </div>
            </div>

            <div>
              <p className="text-xs font-medium mb-1">Urine protein</p>
              <div className="flex flex-wrap gap-1">
                {(['neg', '+', '++', '+++'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setUrine(v)}
                    className={cn(
                      'rounded border px-2 py-1 text-xs',
                      urine === v ? 'border-cobalt bg-cobalt/10 text-cobalt' : 'border-border',
                    )}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium">Hb (g/dL)</label>
              <Input value={hb} onChange={(e) => setHb(e.target.value)} className="mt-1" />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium">Given today</p>
              {[
                ['IPTp-SP', iptp, setIptp],
                ['IFAS', ifas, setIfas],
                ['Td', td, setTd],
                ['Dewormed', dewormed, setDewormed],
                ['ITN', itn, setItn],
              ].map(([label, checked, setter]) => (
                <label key={String(label)} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checked as boolean}
                    onChange={(e) => (setter as (v: boolean) => void)(e.target.checked)}
                    className="rounded border-border"
                  />
                  {label as string}
                </label>
              ))}
            </div>

            <div>
              <label className="text-xs font-medium">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
              />
            </div>

            <Button
              onClick={saveContact}
              disabled={pending}
              className="w-full bg-cobalt hover:bg-cobalt/90"
            >
              {pending ? 'Saving…' : 'Save contact'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
