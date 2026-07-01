'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { VHF_SYMPTOMS, type VhfSymptomSlug } from '@/lib/outbreak-screening-rules'
import { recordEbolaScreening } from './ebola-actions'

export type EbolaScreeningRecord = {
  id: string
  is_suspect: boolean
  temp_c: number | null
  epi_contact: boolean
  unexplained_bleeding: boolean
  symptoms: string | null
  created_at: string
}

export function EbolaScreeningCard({
  visitId,
  patientId,
  febrile,
  screening,
  tempC,
}: {
  visitId: string
  patientId: string
  febrile: boolean
  screening: EbolaScreeningRecord | null
  tempC: number | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [contact, setContact] = useState(false)
  const [bleeding, setBleeding] = useState(false)
  const [symptoms, setSymptoms] = useState<VhfSymptomSlug[]>([])

  function toggleSymptom(slug: VhfSymptomSlug) {
    setSymptoms((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    )
  }

  function submit() {
    setError(null)
    start(async () => {
      const r = await recordEbolaScreening({
        visitId,
        patientId,
        tempC,
        epidemiologicalContact: contact,
        unexplainedBleeding: bleeding,
        symptoms,
      })
      if (!r.success) {
        setError(r.error)
        return
      }
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <div className="rounded-xl border border-amber-500/50 bg-amber-50/80 dark:bg-amber-950/20 p-4">
      <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
        Ebola protocol active
        {febrile ? ' — screen this febrile patient' : ' — VHF screen available'}
      </p>
      {screening ? (
        <p className="mt-1 text-sm text-amber-900/80 dark:text-amber-100/80">
          {screening.is_suspect
            ? 'Suspect case recorded — follow isolation protocol.'
            : 'Screen recorded: not a suspect case.'}
        </p>
      ) : (
        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setOpen(true)}>
          Record Ebola / VHF screen
        </Button>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Ebola / VHF screen</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Fever: {tempC != null ? `${tempC}°C` : 'not recorded — record vitals first if missing'}
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={contact} onChange={(e) => setContact(e.target.checked)} />
              Epidemiological contact (case / funeral / sick animal)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={bleeding} onChange={(e) => setBleeding(e.target.checked)} />
              Unexplained bleeding
            </label>
            <div>
              <Label className="mb-2 block">Symptoms</Label>
              <div className="space-y-2">
                {VHF_SYMPTOMS.map((s) => (
                  <label key={s.slug} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={symptoms.includes(s.slug)}
                      onChange={() => toggleSymptom(s.slug)}
                    />
                    {s.label}
                  </label>
                ))}
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="button" className="w-full" disabled={pending} onClick={submit}>
              {pending ? 'Saving…' : 'Record screen'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
