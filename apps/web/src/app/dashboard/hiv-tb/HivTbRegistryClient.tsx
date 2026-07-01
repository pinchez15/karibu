'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import type { HivCareRow, HtsEventRow, TbEpisodeRow } from './actions'
import { RecordHtsSheet, RecordHivCareSheet, RecordTbSheet } from './RecordSheets'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso.slice(0, 10)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

const CARE_STATUS_LABEL: Record<string, string> = {
  pre_art: 'Pre-ART',
  on_art: 'On ART',
}

const TB_CASE_LABEL: Record<string, string> = {
  new: 'New',
  relapse: 'Relapse',
  retreatment_default: 'After default',
  failure: 'Failure',
  other: 'Other',
}

const TB_CLASS_LABEL: Record<string, string> = {
  pulmonary_smear_positive: 'Pulm +',
  pulmonary_smear_negative: 'Pulm −',
  extrapulmonary: 'EPT',
}

export function HivTbRegistryClient({
  hts,
  hiv,
  tb,
}: {
  hts: HtsEventRow[]
  hiv: HivCareRow[]
  tb: TbEpisodeRow[]
}) {
  const [htsOpen, setHtsOpen] = useState(false)
  const [hivOpen, setHivOpen] = useState(false)
  const [tbOpen, setTbOpen] = useState(false)

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <p className="text-sm text-muted-foreground">
          Longitudinal HIV/TB registers for HMIS 106a quarterly DHIS2 submission. Record HTS,
          ART, and TB episodes here — reports aggregate from this data.
        </p>

        <Tabs defaultValue="hts">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="hts">HTS ({hts.length})</TabsTrigger>
            <TabsTrigger value="hiv">HIV care ({hiv.length})</TabsTrigger>
            <TabsTrigger value="tb">TB ({tb.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="hts" className="mt-4 space-y-3">
            <button
              type="button"
              onClick={() => setHtsOpen(true)}
              className="w-full rounded-xl border border-dashed border-cobalt/40 bg-cobalt/5 px-4 py-3 text-sm font-semibold text-cobalt hover:bg-cobalt/10"
            >
              + Record HIV test / counseling
            </button>
            {hts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No HTS events yet.</p>
            ) : (
              hts.map((row) => (
                <Link
                  key={row.id}
                  href={`/dashboard/patients/${row.patient_id}`}
                  className="block rounded-xl border border-border bg-card p-4 hover:border-cobalt/30"
                >
                  <div className="flex justify-between gap-2">
                    <div>
                      <p className="font-semibold text-heading">{row.patient_name ?? 'Patient'}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {formatDate(row.event_date)}
                        {row.tested && (
                          <span>
                            {' '}
                            · {row.result ?? 'pending'}
                            {row.result_received ? ' (result given)' : ''}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </TabsContent>

          <TabsContent value="hiv" className="mt-4 space-y-3">
            <button
              type="button"
              onClick={() => setHivOpen(true)}
              className="w-full rounded-xl border border-dashed border-cobalt/40 bg-cobalt/5 px-4 py-3 text-sm font-semibold text-cobalt hover:bg-cobalt/10"
            >
              + Enroll in HIV care / update ART
            </button>
            {hiv.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No active HIV enrollments.</p>
            ) : (
              hiv.map((row) => (
                <Link
                  key={row.id}
                  href={`/dashboard/hiv-tb/hiv/${row.id}`}
                  className="block rounded-xl border border-border bg-card p-4 hover:border-cobalt/30"
                >
                  <div className="flex justify-between gap-2">
                    <div>
                      <p className="font-semibold text-heading">{row.patient_name ?? 'Patient'}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {CARE_STATUS_LABEL[row.care_status] ?? row.care_status}
                        {row.art_regimen && <span> · {row.art_regimen}</span>}
                        {row.who_stage != null && <span> · Stage {row.who_stage}</span>}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">Since {formatDate(row.enrolled_at)}</p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {row.cpt_at_last_visit && (
                      <span className="rounded-full bg-background px-2 py-0.5 text-xs">CPT</span>
                    )}
                    {row.tb_assessed_last_visit && (
                      <span className="rounded-full bg-background px-2 py-0.5 text-xs">TB screened</span>
                    )}
                  </div>
                </Link>
              ))
            )}
          </TabsContent>

          <TabsContent value="tb" className="mt-4 space-y-3">
            <button
              type="button"
              onClick={() => setTbOpen(true)}
              className="w-full rounded-xl border border-dashed border-cobalt/40 bg-cobalt/5 px-4 py-3 text-sm font-semibold text-cobalt hover:bg-cobalt/10"
            >
              + Register TB case
            </button>
            {tb.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No active TB episodes.</p>
            ) : (
              tb.map((row) => (
                <Link
                  key={row.id}
                  href={`/dashboard/hiv-tb/tb/${row.id}`}
                  className="block rounded-xl border border-border bg-card p-4 hover:border-cobalt/30"
                >
                  <div className="flex justify-between gap-2">
                    <div>
                      <p className="font-semibold text-heading">{row.patient_name ?? 'Patient'}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {TB_CASE_LABEL[row.case_type] ?? row.case_type} ·{' '}
                        {TB_CLASS_LABEL[row.disease_class] ?? row.disease_class}
                        {row.unit_tb_number && <span> · #{row.unit_tb_number}</span>}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">{formatDate(row.registered_at)}</p>
                  </div>
                  {row.hiv_status === 'positive' && (
                    <span className={cn('mt-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900')}>
                      HIV+
                    </span>
                  )}
                </Link>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>

      <RecordHtsSheet open={htsOpen} onOpenChange={setHtsOpen} />
      <RecordHivCareSheet open={hivOpen} onOpenChange={setHivOpen} />
      <RecordTbSheet open={tbOpen} onOpenChange={setTbOpen} />
    </div>
  )
}
