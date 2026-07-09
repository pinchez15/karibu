'use client'

import { DischargeSummaryPrint } from '@/components/inpatient/print/DischargeSummaryPrint'
import { AdmissionChartPrint } from '@/components/inpatient/print/AdmissionChartPrint'
import { PrintBlocker } from '@/app/dashboard/inpatient/[id]/print/PrintBlocker'
import type { PrintFacility } from '@/components/inpatient/print/print-format'
import type {
  AdmissionDetail,
  AdmissionNote,
  AdmissionObservation,
  MedicationAdmin,
  MedicationOrder,
} from '@/app/dashboard/inpatient/types'

const FACILITY: PrintFacility = {
  name: 'Ssunga HC III',
  phone: '+256 700 123 456',
  umdpc_number: '12345',
  district: 'Kalungu',
  subcounty: 'Ssunga',
}

function baseAdmission(status: 'active' | 'discharged'): AdmissionDetail {
  return {
    id: 'fixture-admission-1',
    patient_id: 'fixture-patient-1',
    clinic_id: 'fixture-clinic-1',
    ward: 'general',
    bed_label: 'B4',
    chief_complaint: 'Fever and cough for 3 days',
    admission_type: 'general',
    weight_kg: 62,
    provisional_dx: 'Community-acquired pneumonia',
    gravida: null,
    para: null,
    edd: null,
    gestation_weeks: null,
    hiv_status: null,
    presenting_status: 'Stable',
    admitted_at: '2026-07-01T08:30:00.000Z',
    status,
    discharged_at: status === 'discharged' ? '2026-07-05T14:00:00.000Z' : null,
    outcome: status === 'discharged' ? 'recovered' : null,
    disposition: status === 'discharged' ? 'home' : null,
    discharge_notes: status === 'discharged' ? 'Completed 5-day course of amoxicillin. Advised to return if fever recurs.' : null,
    discharged_by_staff: status === 'discharged' ? { display_name: 'Dr. Grace Nakato' } : null,
    patient: {
      id: 'fixture-patient-1',
      first_name: 'Amina',
      last_name: 'Okello',
      display_name: 'Amina Okello',
      date_of_birth: '1990-03-14',
      sex: 'F',
      patient_number: 4821,
    },
  }
}

function fixtureMedicationOrders(dense: boolean): MedicationOrder[] {
  const count = dense ? 14 : 2
  return Array.from({ length: count }, (_, i) => ({
    id: `order-${i}`,
    drug_name: `Medicine ${i + 1}`,
    dose: '500mg',
    route: 'PO',
    frequency: 'BD',
    instructions: i % 3 === 0 ? 'Take with food' : null,
    // Keep the first order active in every variant (the discharge summary
    // filters to active-only meds and asserts on it); vary a later one when
    // dense so the chart print shows both active and stopped statuses.
    active: dense ? i % 5 !== 4 : true,
    created_at: '2026-07-01T09:00:00.000Z',
  }))
}

function fixtureMedicationAdmins(orders: MedicationOrder[], dense: boolean): MedicationAdmin[] {
  const perOrder = dense ? 6 : 2
  const admins: MedicationAdmin[] = []
  for (const order of orders) {
    for (let i = 0; i < perOrder; i++) {
      admins.push({
        id: `admin-${order.id}-${i}`,
        order_id: order.id,
        status: i % 4 === 0 ? 'not_given' : 'given',
        not_given_reason: i % 4 === 0 ? 'Patient asleep' : null,
        administered_at: `2026-07-0${1 + (i % 4)}T${10 + i}:00:00.000Z`,
        scheduled_for: null,
      })
    }
  }
  return admins
}

function fixtureObservations(dense: boolean): AdmissionObservation[] {
  const count = dense ? 24 : 3
  return Array.from({ length: count }, (_, i) => ({
    id: `obs-${i}`,
    observed_at: `2026-07-0${1 + Math.floor(i / 6)}T${(8 + (i % 6) * 2).toString().padStart(2, '0')}:00:00.000Z`,
    temp_c: 37 + (i % 3) * 0.4,
    pulse_bpm: 80 + (i % 5) * 2,
    resp_rate: 18 + (i % 3),
    bp_systolic: 110 + (i % 4) * 2,
    bp_diastolic: 70 + (i % 3),
    spo2_pct: 96 + (i % 3),
    avpu: 'A',
    imci_not_feeding: false,
    imci_vomiting_everything: false,
    imci_convulsions: false,
    imci_lethargic_unconscious: false,
    note: i % 6 === 0 ? 'Round note: patient comfortable' : null,
  }))
}

function fixtureNotes(dense: boolean): AdmissionNote[] {
  const count = dense ? 8 : 2
  return Array.from({ length: count }, (_, i) => ({
    id: `note-${i}`,
    note: `Progress note ${i + 1}: patient responding well to treatment.`,
    author_name: 'Nurse Betty',
    created_at: `2026-07-0${1 + (i % 4)}T12:00:00.000Z`,
  }))
}

export function InpatientPrintFixtureClient({
  variant,
  dense,
}: {
  variant: 'discharge' | 'chart' | 'not-discharged'
  dense: boolean
}) {
  if (variant === 'not-discharged') {
    return (
      <PrintBlocker
        title="Not discharged yet"
        message="This patient is still admitted, so there's no discharge summary to print."
        ctaHref="/dashboard/inpatient"
        ctaLabel="Open admission chart"
      />
    )
  }

  if (variant === 'chart') {
    const admission = baseAdmission('discharged')
    const orders = fixtureMedicationOrders(dense)
    return (
      <AdmissionChartPrint
        facility={FACILITY}
        admission={admission}
        observations={fixtureObservations(dense)}
        medicationOrders={orders}
        medicationAdmins={fixtureMedicationAdmins(orders, dense)}
        notes={fixtureNotes(dense)}
        ivInfusions={[]}
        ivInfusionChecks={[]}
        delivery={null}
        postnatalObs={[]}
        autoPrint={false}
      />
    )
  }

  const admission = baseAdmission('discharged')
  const orders = fixtureMedicationOrders(false)
  return (
    <DischargeSummaryPrint
      facility={FACILITY}
      admission={admission}
      activeMedications={orders.filter((o) => o.active)}
      autoPrint={false}
    />
  )
}
