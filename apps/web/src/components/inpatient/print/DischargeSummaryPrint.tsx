'use client'

import { PrintDocShell } from './PrintDocShell'
import {
  ageDisplay,
  capitalize,
  facilityAddressLine,
  formatDate,
  formatDateTime,
  lengthOfStayDays,
  type PrintFacility,
} from './print-format'
import { patientDisplayName } from '@/lib/referral-summary'
import type { AdmissionDetail, MedicationOrder } from '@/app/dashboard/inpatient/types'

/**
 * B3 — printable discharge summary. A4, not 58mm: this is the document the
 * patient carries to the next facility. Content per
 * docs/workplans/2026-07-09-tester-feedback/inpatient-buildout.md: facility
 * header, patient identifiers, admission+discharge dates, ward diagnosis,
 * outcome/disposition, discharge notes, meds on discharge, follow-up,
 * clinician name + signature line.
 */
export function DischargeSummaryPrint({
  facility,
  admission,
  activeMedications,
  autoPrint = true,
}: {
  facility: PrintFacility
  admission: AdmissionDetail
  activeMedications: MedicationOrder[]
  /** Disabled by the e2e fixture so Playwright doesn't hit a print dialog. */
  autoPrint?: boolean
}) {
  const patientName = patientDisplayName(admission.patient)
  const los = lengthOfStayDays(admission.admitted_at, admission.discharged_at)
  const clinician = admission.discharged_by_staff?.display_name?.trim() || null

  return (
    <PrintDocShell title={`Discharge summary — ${patientName}`} autoPrint={autoPrint}>
      <FacilityHeader facility={facility} />

      <div style={{ textAlign: 'center', margin: '14px 0' }}>
        <h1>DISCHARGE SUMMARY</h1>
      </div>

      <div className="doc-section">
        <h2>Patient</h2>
        <dl className="doc-kv">
          <div><dt>Name</dt><dd>{patientName}</dd></div>
          <div><dt>Patient ID</dt><dd>{admission.patient.patient_number ?? '—'}</dd></div>
          <div><dt>Sex</dt><dd>{admission.patient.sex ?? '—'}</dd></div>
          <div><dt>Age</dt><dd>{ageDisplay(admission.patient.date_of_birth)}</dd></div>
          <div><dt>Date of birth</dt><dd>{formatDate(admission.patient.date_of_birth)}</dd></div>
          <div><dt>Ward / bed</dt><dd>{[admission.ward, admission.bed_label].filter(Boolean).join(' · ') || '—'}</dd></div>
        </dl>
      </div>

      <div className="doc-section">
        <h2>Admission</h2>
        <dl className="doc-kv">
          <div><dt>Admitted</dt><dd>{formatDateTime(admission.admitted_at)}</dd></div>
          <div><dt>Discharged</dt><dd>{formatDateTime(admission.discharged_at)}</dd></div>
          <div><dt>Length of stay</dt><dd>{los != null ? `${los} day${los === 1 ? '' : 's'}` : '—'}</dd></div>
          <div><dt>Status</dt><dd>{admission.status === 'transferred' ? 'Transferred' : 'Discharged'}</dd></div>
        </dl>
      </div>

      <div className="doc-section">
        <h2>Ward diagnosis</h2>
        <p>{admission.provisional_dx?.trim() || admission.chief_complaint?.trim() || 'Not recorded'}</p>
      </div>

      <div className="doc-section">
        <h2>Outcome / disposition</h2>
        <p>
          {capitalize(admission.outcome)}
          {admission.disposition ? ` — discharged to ${admission.disposition}` : ''}
        </p>
      </div>

      <div className="doc-section">
        <h2>Medications on discharge</h2>
        {activeMedications.length === 0 ? (
          <p>No active medications at discharge.</p>
        ) : (
          <table className="doc-table">
            <thead>
              <tr>
                <th>Drug</th>
                <th>Dose</th>
                <th>Route</th>
                <th>Frequency</th>
                <th>Instructions</th>
              </tr>
            </thead>
            <tbody>
              {activeMedications.map((m) => (
                <tr key={m.id}>
                  <td>{m.drug_name}</td>
                  <td>{m.dose ?? '—'}</td>
                  <td>{m.route ?? '—'}</td>
                  <td>{m.frequency ?? '—'}</td>
                  <td>{m.instructions ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="doc-section">
        <h2>Discharge notes &amp; follow-up</h2>
        <p style={{ whiteSpace: 'pre-wrap' }}>
          {admission.discharge_notes?.trim() || 'No additional notes recorded.'}
        </p>
      </div>

      <div className="doc-section" style={{ marginTop: 32 }}>
        <h2>Clinician</h2>
        <p>{clinician ?? 'Not recorded'}</p>
        <div style={{ marginTop: 28, display: 'flex', gap: 40 }}>
          <div style={{ flex: 1 }}>
            <div style={{ borderTop: '1px solid #111827', paddingTop: 4 }}>Signature</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ borderTop: '1px solid #111827', paddingTop: 4 }}>Date</div>
          </div>
        </div>
      </div>
    </PrintDocShell>
  )
}

function FacilityHeader({ facility }: { facility: PrintFacility }) {
  const address = facilityAddressLine(facility)
  return (
    <div style={{ textAlign: 'center', borderBottom: '2px solid #111827', paddingBottom: 10 }}>
      <div style={{ fontSize: 15, fontWeight: 700 }}>{facility.name.toUpperCase()}</div>
      {address && <div>{address}</div>}
      <div>
        {[facility.phone, facility.umdpc_number ? `UMDPC #${facility.umdpc_number}` : null]
          .filter(Boolean)
          .join(' · ')}
      </div>
    </div>
  )
}
