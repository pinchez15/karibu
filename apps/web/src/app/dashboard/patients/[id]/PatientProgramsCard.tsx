'use client'

import { useState } from 'react'
import Link from 'next/link'
import { HeartPulse } from 'lucide-react'
import {
  RecordHtsSheet,
  RecordHivCareSheet,
  RecordTbSheet,
} from '@/app/dashboard/hiv-tb/RecordSheets'

export function PatientProgramsCard({
  patientId,
  canRecord,
}: {
  patientId: string
  canRecord: boolean
}) {
  const [htsOpen, setHtsOpen] = useState(false)
  const [hivOpen, setHivOpen] = useState(false)
  const [tbOpen, setTbOpen] = useState(false)

  if (!canRecord) return null

  return (
    <>
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <HeartPulse className="h-4 w-4 text-cobalt" />
            <h3 className="font-semibold text-sm">HIV / TB programs</h3>
          </div>
          <Link href="/dashboard/hiv-tb" className="text-xs text-cobalt hover:underline">
            Open registers
          </Link>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Records feed HMIS 106a quarterly reports for DHIS2.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setHtsOpen(true)}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            Record HTS
          </button>
          <button
            type="button"
            onClick={() => setHivOpen(true)}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            HIV care
          </button>
          <button
            type="button"
            onClick={() => setTbOpen(true)}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            Register TB
          </button>
        </div>
      </div>

      <RecordHtsSheet open={htsOpen} onOpenChange={setHtsOpen} defaultPatientId={patientId} />
      <RecordHivCareSheet open={hivOpen} onOpenChange={setHivOpen} defaultPatientId={patientId} />
      <RecordTbSheet open={tbOpen} onOpenChange={setTbOpen} defaultPatientId={patientId} />
    </>
  )
}
