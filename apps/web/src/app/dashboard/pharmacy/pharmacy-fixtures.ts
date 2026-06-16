import type { DispensingRow } from './pharmacy-shared'

/** Shared queue fixture for Vitest + Playwright station-demo. */
export const PHARMACY_STATION_FIXTURE_ROWS: DispensingRow[] = [
  {
    id: 'visit-e2e-001',
    visit_date: '2026-06-16',
    diagnosis: 'Uncomplicated malaria',
    chief_complaint: 'Fever',
    medications: 'Artemether/Lumefantrine 20/120mg — 24 tabs',
    dispensing_status: 'not_started',
    dispense_notes: null,
    pharmacy_order_submitted_at: '2026-06-16T08:00:00.000Z',
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
  },
]

export async function mockE2eDispensingStatus(
  _visitId: string,
  _status: 'dispensed' | 'partial' | 'out_of_stock' | 'not_started' | 'in_progress',
  _notes?: string,
) {
  return { success: true as const }
}
