'use client'

import { PrintDocShell } from './PrintDocShell'
import {
  ageDisplay,
  facilityAddressLine,
  formatDate,
  formatDateTime,
  type PrintFacility,
} from './print-format'
import { patientDisplayName } from '@/lib/referral-summary'
import type {
  AdmissionDetail,
  AdmissionNote,
  AdmissionObservation,
  DeliveryDetail,
  IvInfusion,
  IvInfusionCheck,
  MedicationAdmin,
  MedicationOrder,
  PostnatalObservationRow,
} from '@/app/dashboard/inpatient/types'

function dangerFlags(o: AdmissionObservation): string {
  const flags = [
    o.imci_not_feeding && 'Not feeding',
    o.imci_vomiting_everything && 'Vomiting all',
    o.imci_convulsions && 'Convulsions',
    o.imci_lethargic_unconscious && 'Lethargic/unconscious',
  ].filter(Boolean)
  return flags.length > 0 ? flags.join(', ') : '—'
}

/**
 * B4 — printable full admission chart. Paginated A4 tables (no interactive
 * components) for the physical file or a referral: observations, treatment
 * grid, IV record, progress notes, maternity when present. Works for both
 * active and closed admissions.
 */
export function AdmissionChartPrint({
  facility,
  admission,
  observations,
  medicationOrders,
  medicationAdmins,
  notes,
  ivInfusions,
  ivInfusionChecks,
  delivery,
  postnatalObs,
  autoPrint = true,
}: {
  facility: PrintFacility
  admission: AdmissionDetail
  observations: AdmissionObservation[]
  medicationOrders: MedicationOrder[]
  medicationAdmins: MedicationAdmin[]
  notes: AdmissionNote[]
  ivInfusions: IvInfusion[]
  ivInfusionChecks: IvInfusionCheck[]
  delivery: DeliveryDetail | null
  postnatalObs: PostnatalObservationRow[]
  /** Disabled by the e2e fixture so Playwright doesn't hit a print dialog. */
  autoPrint?: boolean
}) {
  const patientName = patientDisplayName(admission.patient)
  const isMaternity = admission.ward === 'maternity'
  const address = facilityAddressLine(facility)

  return (
    <PrintDocShell title={`Admission chart — ${patientName}`} landscape autoPrint={autoPrint}>
      <div style={{ textAlign: 'center', borderBottom: '2px solid #111827', paddingBottom: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{facility.name.toUpperCase()}</div>
        {address && <div>{address}</div>}
        {facility.phone && <div>{facility.phone}</div>}
      </div>

      <div style={{ textAlign: 'center', margin: '14px 0' }}>
        <h1>ADMISSION CHART</h1>
      </div>

      <div className="doc-section doc-page-break">
        <h2>Patient &amp; admission</h2>
        <dl className="doc-kv">
          <div><dt>Name</dt><dd>{patientName}</dd></div>
          <div><dt>Patient ID</dt><dd>{admission.patient.patient_number ?? '—'}</dd></div>
          <div><dt>Sex</dt><dd>{admission.patient.sex ?? '—'}</dd></div>
          <div><dt>Age</dt><dd>{ageDisplay(admission.patient.date_of_birth)}</dd></div>
          <div><dt>Ward / bed</dt><dd>{[admission.ward, admission.bed_label].filter(Boolean).join(' · ') || '—'}</dd></div>
          <div><dt>Admitted</dt><dd>{formatDateTime(admission.admitted_at)}</dd></div>
          <div><dt>Status</dt><dd style={{ textTransform: 'capitalize' }}>{admission.status}</dd></div>
          {admission.discharged_at && <div><dt>Discharged</dt><dd>{formatDateTime(admission.discharged_at)}</dd></div>}
        </dl>
        {admission.chief_complaint?.trim() && (
          <p style={{ marginTop: 8 }}><strong>Reason for admission:</strong> {admission.chief_complaint}</p>
        )}
        {admission.provisional_dx?.trim() && (
          <p style={{ marginTop: 4 }}><strong>Provisional diagnosis:</strong> {admission.provisional_dx}</p>
        )}

        <h2 style={{ marginTop: 16 }}>Observations</h2>
        {observations.length === 0 ? (
          <p>No observations recorded.</p>
        ) : (
          <table className="doc-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>T °C</th>
                <th>Pulse</th>
                <th>RR</th>
                <th>BP</th>
                <th>SpO2</th>
                <th>AVPU</th>
                <th>Danger signs</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {[...observations].reverse().map((o) => (
                <tr key={o.id}>
                  <td>{formatDateTime(o.observed_at)}</td>
                  <td>{o.temp_c ?? '—'}</td>
                  <td>{o.pulse_bpm ?? '—'}</td>
                  <td>{o.resp_rate ?? '—'}</td>
                  <td>{o.bp_systolic != null ? `${o.bp_systolic}/${o.bp_diastolic ?? '—'}` : '—'}</td>
                  <td>{o.spo2_pct ?? '—'}</td>
                  <td>{o.avpu ?? '—'}</td>
                  <td>{dangerFlags(o)}</td>
                  <td>{o.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="doc-section doc-page-break">
        <h2>Treatment chart — orders</h2>
        {medicationOrders.length === 0 ? (
          <p>No medication orders.</p>
        ) : (
          <table className="doc-table">
            <thead>
              <tr>
                <th>Drug</th>
                <th>Dose</th>
                <th>Route</th>
                <th>Frequency</th>
                <th>Instructions</th>
                <th>Status</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {medicationOrders.map((o) => (
                <tr key={o.id}>
                  <td>{o.drug_name}</td>
                  <td>{o.dose ?? '—'}</td>
                  <td>{o.route ?? '—'}</td>
                  <td>{o.frequency ?? '—'}</td>
                  <td>{o.instructions ?? '—'}</td>
                  <td>{o.active ? 'Active' : 'Stopped'}</td>
                  <td>{formatDate(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h2 style={{ marginTop: 16 }}>Treatment chart — administration record</h2>
        {medicationAdmins.length === 0 ? (
          <p>No administration entries.</p>
        ) : (
          <table className="doc-table">
            <thead>
              <tr>
                <th>Drug</th>
                <th>Time</th>
                <th>Status</th>
                <th>Reason (if not given)</th>
              </tr>
            </thead>
            <tbody>
              {[...medicationAdmins].reverse().map((a) => {
                const order = medicationOrders.find((o) => o.id === a.order_id)
                return (
                  <tr key={a.id}>
                    <td>{order?.drug_name ?? 'Unknown'}</td>
                    <td>{formatDateTime(a.administered_at)}</td>
                    <td style={{ textTransform: 'capitalize' }}>{a.status.replace('_', ' ')}</td>
                    <td>{a.not_given_reason ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="doc-section doc-page-break">
        <h2>IV infusion record</h2>
        {ivInfusions.length === 0 ? (
          <p>No IV infusions.</p>
        ) : (
          <table className="doc-table">
            <thead>
              <tr>
                <th>Fluid</th>
                <th>Additive</th>
                <th>Volume (ml)</th>
                <th>Rate</th>
                <th>Site</th>
                <th>Started</th>
                <th>Stopped</th>
              </tr>
            </thead>
            <tbody>
              {ivInfusions.map((iv) => (
                <tr key={iv.id}>
                  <td>{iv.fluid_type}</td>
                  <td>{iv.additive ?? '—'}</td>
                  <td>{iv.volume_ml}</td>
                  <td>{iv.rate_ml_hr != null ? `${iv.rate_ml_hr} ml/hr` : iv.drops_per_min != null ? `${iv.drops_per_min} drops/min` : '—'}</td>
                  <td>{iv.site_location ?? '—'}</td>
                  <td>{formatDateTime(iv.started_at)}</td>
                  <td>{formatDateTime(iv.stopped_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {ivInfusionChecks.length > 0 && (
          <>
            <h2 style={{ marginTop: 16 }}>IV drip checks</h2>
            <table className="doc-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Drip running</th>
                  <th>Site OK</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {[...ivInfusionChecks].reverse().map((c) => (
                  <tr key={c.id}>
                    <td>{formatDateTime(c.checked_at)}</td>
                    <td>{c.drip_running ? 'Yes' : 'No'}</td>
                    <td>{c.site_ok ? 'Yes' : 'No'}</td>
                    <td>{c.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      <div className={`doc-section${isMaternity ? ' doc-page-break' : ''}`}>
        <h2>Progress notes</h2>
        {notes.length === 0 ? (
          <p>No progress notes.</p>
        ) : (
          <table className="doc-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Author</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {[...notes].reverse().map((n) => (
                <tr key={n.id}>
                  <td>{formatDateTime(n.created_at)}</td>
                  <td>{n.author_name ?? '—'}</td>
                  <td style={{ whiteSpace: 'pre-wrap' }}>{n.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {isMaternity && (
        <div className="doc-section">
          <h2>Maternity — delivery record</h2>
          {!delivery ? (
            <p>No delivery recorded.</p>
          ) : (
            <dl className="doc-kv">
              <div><dt>Delivered</dt><dd>{formatDateTime(delivery.delivered_at)}</dd></div>
              <div><dt>Mode</dt><dd>{delivery.mode ?? '—'}</dd></div>
              <div><dt>Outcome</dt><dd>{delivery.outcome ?? '—'}</dd></div>
              <div><dt>Baby sex</dt><dd>{delivery.baby_sex ?? '—'}</dd></div>
              <div><dt>Birth weight</dt><dd>{delivery.birth_weight_g != null ? `${delivery.birth_weight_g} g` : '—'}</dd></div>
              <div><dt>Apgar 1 / 5</dt><dd>{delivery.apgar_1 ?? '—'} / {delivery.apgar_5 ?? '—'}</dd></div>
              <div><dt>Blood loss</dt><dd>{delivery.blood_loss_ml != null ? `${delivery.blood_loss_ml} ml` : '—'}</dd></div>
              <div><dt>Oxytocin given</dt><dd>{delivery.oxytocin_given ? 'Yes' : 'No'}</dd></div>
              <div><dt>Placenta complete</dt><dd>{delivery.placenta_complete == null ? '—' : delivery.placenta_complete ? 'Yes' : 'No'}</dd></div>
              <div><dt>Resuscitation</dt><dd>{delivery.resuscitation_done ? 'Yes' : 'No'}</dd></div>
              <div><dt>Vitamin K given</dt><dd>{delivery.vitamin_k_given ? 'Yes' : 'No'}</dd></div>
              <div><dt>Early breastfeeding</dt><dd>{delivery.early_breastfeeding ? 'Yes' : 'No'}</dd></div>
            </dl>
          )}

          <h2 style={{ marginTop: 16 }}>Maternity — postnatal observations</h2>
          {postnatalObs.length === 0 ? (
            <p>No postnatal observations recorded.</p>
          ) : (
            <table className="doc-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Subject</th>
                  <th>T °C</th>
                  <th>Pulse</th>
                  <th>BP</th>
                  <th>Bleeding</th>
                  <th>Findings</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {[...postnatalObs].reverse().map((o) => (
                  <tr key={o.id}>
                    <td>{formatDateTime(o.observed_at)}</td>
                    <td style={{ textTransform: 'capitalize' }}>{o.subject}</td>
                    <td>{o.temp_c ?? '—'}</td>
                    <td>{o.pulse_bpm ?? '—'}</td>
                    <td>{o.bp_systolic != null ? `${o.bp_systolic}/${o.bp_diastolic ?? '—'}` : '—'}</td>
                    <td>{o.bleeding ?? '—'}</td>
                    <td>
                      {[
                        o.fundus_firm != null && (o.fundus_firm ? 'Fundus firm' : 'Fundus not firm'),
                        o.feeding_well != null && (o.feeding_well ? 'Feeding well' : 'Not feeding well'),
                        o.not_feeding && 'Not feeding',
                        o.convulsions && 'Convulsions',
                        o.jaundice && 'Jaundice',
                      ].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td>{o.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </PrintDocShell>
  )
}
