import type { PharmacyStationRow } from './pharmacy-data'

function mockLine(
  visitId: string,
  idx: number,
  name: string,
  overrides: Partial<PharmacyStationRow['prescription_lines'][number]> = {},
): PharmacyStationRow['prescription_lines'][number] {
  return {
    id: `rx-${visitId}-${idx}`,
    visit_id: visitId,
    clinic_id: 'clinic-fixture',
    patient_id: `patient-00${idx}`,
    sort_order: idx,
    medication_code: null,
    free_text_name: name,
    dose_text: null,
    route_text: null,
    frequency_text: null,
    duration_text: null,
    quantity_prescribed: 15,
    quantity_unit: 'tabs',
    status: 'ordered',
    source: 'legacy_text',
    ordered_by: null,
    ordered_at: '2026-06-16T08:00:00.000Z',
    notes: null,
    ...overrides,
  }
}

/** Shared queue fixture for Vitest + Playwright station-demo. */
export const PHARMACY_STATION_FIXTURE_ROWS: PharmacyStationRow[] = [
  {
    id: 'visit-e2e-001',
    visit_date: '2026-06-16',
    diagnosis: 'Uncomplicated malaria',
    chief_complaint: 'Fever',
    medications: 'Artemether/Lumefantrine 20/120mg — 24 tabs',
    dispensing_status: 'not_started',
    dispense_notes: null,
    pharmacy_order_submitted_at: '2026-06-16T08:00:00.000Z',
    dispensed_at: null,
    patient: {
      id: 'patient-001',
      patient_number: 'KH-1001',
      first_name: 'Amina',
      last_name: 'Okello',
      display_name: null,
      date_of_birth: '1990-03-15',
      sex: 'female',
      whatsapp_number: null,
    },
    prescription_lines: [
      mockLine('visit-e2e-001', 0, 'Artemether/Lumefantrine (AL)', {
        medication_code: 'AL',
        quantity_prescribed: 24,
        quantity_unit: 'tabs',
      }),
    ],
  },
  {
    id: 'visit-e2e-002',
    visit_date: '2026-06-16',
    diagnosis: 'UTI',
    chief_complaint: 'Dysuria',
    medications: 'Nitrofurantoin 100mg — 14 caps',
    dispensing_status: 'not_started',
    dispense_notes: null,
    pharmacy_order_submitted_at: '2026-06-16T08:15:00.000Z',
    dispensed_at: null,
    patient: {
      id: 'patient-002',
      patient_number: 'KH-1002',
      first_name: 'James',
      last_name: 'Mukasa',
      display_name: null,
      date_of_birth: '1985-11-02',
      sex: 'male',
      whatsapp_number: null,
    },
    prescription_lines: [
      mockLine('visit-e2e-002', 0, 'Nitrofurantoin 100mg', {
        quantity_prescribed: 14,
        quantity_unit: 'caps',
      }),
    ],
  },
  {
    id: 'visit-e2e-003',
    visit_date: '2026-06-16',
    diagnosis: 'Hypertension follow-up',
    chief_complaint: null,
    medications: 'Amlodipine 5mg — 30 tabs',
    dispensing_status: 'partial',
    dispense_notes: 'Only 2 weeks supplied',
    pharmacy_order_submitted_at: '2026-06-16T08:30:00.000Z',
    dispensed_at: '2026-06-16T09:00:00.000Z',
    patient: {
      id: 'patient-003',
      patient_number: 'KH-1003',
      first_name: 'Grace',
      last_name: 'Nabwire',
      display_name: null,
      date_of_birth: '1978-07-20',
      sex: 'female',
      whatsapp_number: null,
    },
    prescription_lines: [
      mockLine('visit-e2e-003', 0, 'Amlodipine 5mg', {
        status: 'partially_dispensed',
        quantity_prescribed: 30,
      }),
    ],
  },
  {
    // WP1 D1/D2: a two-line script used to exercise the anti-disappearance
    // flow — dispensing line 1 must NOT drop the visit off "To dispense".
    id: 'visit-e2e-004',
    visit_date: '2026-06-16',
    diagnosis: 'Pneumonia',
    chief_complaint: 'Cough, fever',
    medications: 'Amoxicillin 500mg — 21 caps\nParacetamol 500mg — 20 tabs',
    dispensing_status: 'not_started',
    dispense_notes: null,
    pharmacy_order_submitted_at: '2026-06-16T08:45:00.000Z',
    dispensed_at: null,
    patient: {
      id: 'patient-004',
      patient_number: 'KH-1004',
      first_name: 'Peter',
      last_name: 'Ochen',
      display_name: null,
      date_of_birth: '2001-01-10',
      sex: 'male',
      whatsapp_number: null,
    },
    prescription_lines: [
      mockLine('visit-e2e-004', 0, 'Amoxicillin 500mg', {
        quantity_prescribed: 21,
        quantity_unit: 'caps',
      }),
      mockLine('visit-e2e-004', 1, 'Paracetamol 500mg', {
        quantity_prescribed: 20,
        quantity_unit: 'tabs',
      }),
    ],
  },
]

export async function mockE2eCompleteDispense() {
  return { success: true as const }
}
