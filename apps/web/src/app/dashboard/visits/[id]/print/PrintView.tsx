'use client'

import { ReceiptShell, useReceiptPrint, WrappedLines } from '@/components/receipt/ReceiptShell'
import type { ClinicPrintSettings } from '@/lib/clinic-print-settings'

interface PrintVisit {
  id: string
  visit_date: string
  queue_position: number | null
  diagnosis: string | null
  medications: string | null
  follow_up_instructions: string | null
  tests_ordered: string | null
  patient: {
    display_name: string | null
    first_name: string | null
    last_name: string | null
    patient_id: number | null
  } | null
  patient_notes: { content: string | null } | null
  doctor: { display_name: string } | null
  clinic: {
    name: string
    phone: string | null
    umdpc_number: string | null
    timezone: string
  } | null
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|[\s(])\*([^*\n]+?)\*(?=[\s).,!?]|$)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .trim()
}

function formatPatientName(p: PrintVisit['patient']): string {
  if (!p) return 'Patient'
  const first = p.first_name?.trim()
  const last = p.last_name?.trim()
  if (first && last) return `${first} ${last.charAt(0)}.`
  if (first) return first
  if (last) return last
  if (p.display_name) return p.display_name
  return 'Patient'
}

function formatDoctorName(d: PrintVisit['doctor']): string {
  if (!d?.display_name) return 'Not recorded'
  const parts = d.display_name.trim().split(/\s+/)
  if (parts.length === 1) return `Dr. ${parts[0]}`
  return `Dr. ${parts[0]} ${parts[parts.length - 1].charAt(0)}.`
}

function PrintVisitBody({ visit }: { visit: PrintVisit }) {
  const { hrHeavy, hrLight, sectionRule, centerLine } = useReceiptPrint()

  const patientName = formatPatientName(visit.patient)
  const doctorName = formatDoctorName(visit.doctor)

  const visitDate = new Date(visit.visit_date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  const printedAt = new Date().toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const clinicName = visit.clinic?.name || 'Karibu Health'
  const clinicPhone = visit.clinic?.phone
  const clinicUmdpc = visit.clinic?.umdpc_number
  const noteContent = stripMarkdown(visit.patient_notes?.content || '')

  const visitDateForId = visit.visit_date.slice(0, 10).replace(/-/g, '')
  const docId = visit.patient?.patient_id != null
    ? `KH-${visit.patient.patient_id}-${visitDateForId}`
    : `KH-${visit.id.slice(0, 8)}-${visitDateForId}`

  return (
    <>
      <section>
        <div className="bold">{centerLine(clinicName.toUpperCase())}</div>
        {clinicPhone && <div>{centerLine(clinicPhone)}</div>}
        {clinicUmdpc && <div>{centerLine(`UMDPC #${clinicUmdpc}`)}</div>}
      </section>

      <div>{hrHeavy}</div>
      <div className="bold">{centerLine('VISIT SUMMARY')}</div>
      <div>{centerLine(visitDate)}</div>
      {visit.queue_position != null && (
        <div className="bold">{centerLine(`TODAY'S NUMBER: ${visit.queue_position}`)}</div>
      )}
      <div>{hrHeavy}</div>

      <section>
        <div>Patient: {patientName}</div>
        {visit.patient?.patient_id != null && (
          <div>ID:      #{visit.patient.patient_id}</div>
        )}
        <div>Doctor:  {doctorName}</div>
      </section>

      {visit.diagnosis?.trim() && (
        <>
          <div>{'\n' + sectionRule('DIAGNOSIS')}</div>
          <section>
            <WrappedLines text={visit.diagnosis.trim()} />
          </section>
        </>
      )}

      {visit.medications?.trim() && (
        <>
          <div>{'\n' + sectionRule('MEDICATIONS')}</div>
          <section>
            <WrappedLines text={visit.medications.trim()} />
          </section>
        </>
      )}

      {visit.tests_ordered?.trim() && (
        <>
          <div>{'\n' + sectionRule('TESTS')}</div>
          <section>
            <WrappedLines text={visit.tests_ordered.trim()} />
          </section>
        </>
      )}

      {visit.follow_up_instructions?.trim() && (
        <>
          <div>{'\n' + sectionRule('FOLLOW UP')}</div>
          <section>
            <WrappedLines text={visit.follow_up_instructions.trim()} />
          </section>
        </>
      )}

      {noteContent && (
        <>
          <div>{'\n' + hrLight}</div>
          <section>
            <WrappedLines text={noteContent} />
          </section>
          <div>{hrLight}</div>
        </>
      )}

      {clinicPhone && (
        <section>
          <div>{'\n' + sectionRule('WORSE?')}</div>
          <WrappedLines text="If your symptoms get worse, call us right away:" />
          <div className="bold">{centerLine(clinicPhone)}</div>
        </section>
      )}

      <div>{'\n' + hrHeavy}</div>
      <section>
        <div>{centerLine(docId)}</div>
        <div>{centerLine(`Printed ${printedAt}`)}</div>
      </section>
    </>
  )
}

export function PrintView({
  visit,
  printSettings,
}: {
  visit: PrintVisit
  printSettings: ClinicPrintSettings
}) {
  return (
    <ReceiptShell lang="en" layout={printSettings} autoPrint={printSettings.autoPrint}>
      <PrintVisitBody visit={visit} />
    </ReceiptShell>
  )
}
