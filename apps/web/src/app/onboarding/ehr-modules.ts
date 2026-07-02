import type { StaffRole } from '@karibu/shared'
import type { ComponentType } from 'react'
import {
  BillingMock,
  ClinicianNoteMock,
  LabQueueMock,
  PharmacyMock,
  PrinterSetupMock,
  RecordsDeskMock,
  VitalsMock,
} from './mock-screens'

export type EhrOnboardingStep = {
  id: string
  title: string
  body: string
  /** What staff did on paper — bridges from registers to screens. */
  paper?: string
  tip?: string
  /** When set, user must tap the highlighted control on the mock screen. */
  requiresMockAction?: boolean
}

export type EhrModuleDef = {
  id: string
  role: StaffRole
  roleLabel: string
  title: string
  subtitle: string
  intro: string
  steps: EhrOnboardingStep[]
  Mock: ComponentType<{
    activeStepId: string
    onStepAction: (stepId: string) => void
  }>
}

export const EHR_ONBOARDING_MODULES: EhrModuleDef[] = [
  {
    id: 'records-register',
    role: 'records_officer',
    roleLabel: 'Records Officer',
    title: 'Register a patient',
    subtitle: 'Search, register, and start today\'s visit',
    intro:
      'At the front desk you give every patient one identity in Karibu. Search first — most arrivals are returning. Only register when no match exists; saving creates today\'s visit automatically.',
    Mock: RecordsDeskMock,
    steps: [
      {
        id: 'open-patients',
        title: 'Open Patients',
        body: 'In the OPD sidebar, tap **Patients**. This is your register — it replaces the paper OPD book and filing cards.',
        paper: 'On paper you flipped through the register or card file. Here you search by name, phone, patient number, or village.',
        requiresMockAction: true,
      },
      {
        id: 'search-first',
        title: 'Search before you register',
        body: 'Type the patient\'s name, phone, or patient number in the search bar. Karibu shows matches from your clinic only.',
        paper: 'This prevents duplicate cards — a common problem when two clerks register the same person.',
        tip: 'If the patient has no phone, search by name and village.',
        requiresMockAction: true,
      },
      {
        id: 'new-patient',
        title: 'New patient',
        body: 'No match? Tap **New Patient** to open the registration form.',
        requiresMockAction: true,
      },
      {
        id: 'fill-form',
        title: 'Fill required details',
        body: 'Enter first name, last name, and sex (required for HMIS). Add age information — exact date, birth year, or approximate age. Village and phone help next time.',
        tip: 'Karibu warns you if a similar patient already exists — always review before creating a duplicate.',
        requiresMockAction: true,
      },
      {
        id: 'create-visit',
        title: 'Create patient & start visit',
        body: 'Tap **Create Patient & Start Visit**. Karibu assigns a patient number and opens today\'s visit — the nurse can take vitals from the visit screen.',
        paper: 'On paper you wrote the serial number and opened a new OPD card. Karibu does both in one step.',
        requiresMockAction: true,
      },
      {
        id: 'done',
        title: 'Visit is open',
        body: 'The patient appears on worklists for vitals and clinical care. Payment can happen any time — it does not block the note.',
      },
    ],
  },
  {
    id: 'nurse-vitals',
    role: 'nurse',
    roleLabel: 'Registered Nurse',
    title: 'Record vitals',
    subtitle: 'Capture vitals on the visit screen',
    intro:
      'Nurses record vitals on today\'s visit before the clinician documents. Every field is optional — capture only what you measured.',
    Mock: VitalsMock,
    steps: [
      {
        id: 'open-worklist',
        title: 'Find patients needing vitals',
        body: 'Open **Worklists** and look at **Pending vitals**. This list shows everyone checked in today who still needs measurements.',
        requiresMockAction: true,
      },
      {
        id: 'open-visit',
        title: 'Open the visit',
        body: 'Tap the patient row. You land on the visit screen — vitals are recorded here, not on the long-term chart alone.',
        requiresMockAction: true,
      },
      {
        id: 'record-vitals',
        title: 'Open the vitals form',
        body: 'On the **Vitals** card, tap **Record vitals** to expand the form.',
        requiresMockAction: true,
      },
      {
        id: 'enter-values',
        title: 'Enter today\'s measurements',
        body: 'Fill temperature, blood pressure (sys and dia), pulse, resp rate, SpO₂, weight, height, or MUAC when you have them. Leave blank what you did not measure.',
        tip: 'Danger signs (very high temp, low BP, altered consciousness) will flag for the clinician.',
        requiresMockAction: true,
      },
      {
        id: 'save-vitals',
        title: 'Save vitals',
        body: 'Tap **Save vitals**. The visit moves to **Ready for clinician** on the worklist.',
        requiresMockAction: true,
      },
      {
        id: 'done',
        title: 'Hand off to clinician',
        body: 'You do not write the diagnosis — the Medical Clinical Officer does. Your vitals are visible on the visit instantly.',
      },
    ],
  },
  {
    id: 'clinician-note-pharmacy',
    role: 'clinical_officer',
    roleLabel: 'Medical Clinical Officer',
    title: 'Document the visit',
    subtitle: 'Clinical note, lab orders, and pharmacy',
    intro:
      'The Clinical Officer documents in structured sections on the visit screen. Order labs and send prescriptions while the note is still open.',
    Mock: ClinicianNoteMock,
    steps: [
      {
        id: 'open-visit',
        title: 'Open the visit',
        body: 'From **Worklists → Ready for clinician** (or Today), open the patient\'s visit.',
        requiresMockAction: true,
      },
      {
        id: 'chief-complaint',
        title: 'Chief complaint & history',
        body: 'Fill **Chief complaint** and **History of present illness**. You can type or dictate into the focused section.',
        paper: 'This replaces the narrative on the OPD card — but stays searchable and reportable.',
        requiresMockAction: true,
      },
      {
        id: 'diagnosis-plan',
        title: 'Diagnosis and plan',
        body: 'Add **Diagnosis** and **Assessment and plan**. Review suggested HMIS codes before you sign.',
        requiresMockAction: true,
      },
      {
        id: 'order-labs',
        title: 'Order labs (if needed)',
        body: 'In **Order lab tests**, tick tests from the catalog and tap **Send to lab**. The bench sees exact test names immediately.',
        tip: 'Skip this step if no labs today — tap Next to continue.',
      },
      {
        id: 'send-pharmacy',
        title: 'Send to pharmacy',
        body: 'Under **Structured prescriptions**, add each medicine line, then tap **Send to pharmacy**. The dispenser queue opens now — not when you sign.',
        paper: 'On paper the dispenser copied from your prescription slip. Here the order is already in their queue.',
        requiresMockAction: true,
      },
      {
        id: 'done',
        title: 'Sign when ready',
        body: 'Tap **Sign note** when documentation is complete. Lab and pharmacy can continue while you finish.',
      },
    ],
  },
  {
    id: 'lab-result',
    role: 'lab_tech',
    roleLabel: 'Lab Technician',
    title: 'Record a lab result',
    subtitle: 'Lab Today queue',
    intro:
      'Lab staff work the **Lab → Today** board. Start each test, enter the result, and save — clinicians see it on the visit chart.',
    Mock: LabQueueMock,
    steps: [
      {
        id: 'open-lab',
        title: 'Open Lab Today',
        body: 'Tap the **Lab** unit in the top menu, then **Today**. Pending and running tests appear here, oldest first.',
        requiresMockAction: true,
      },
      {
        id: 'start-test',
        title: 'Start the test',
        body: 'Tap **Start** on the ordered test. Status moves to running so clinicians know work is in progress.',
        requiresMockAction: true,
      },
      {
        id: 'enter-result',
        title: 'Enter the result',
        body: 'Type the value in the result field. For RDTs you can tap **Positive** or **Negative** quick buttons.',
        requiresMockAction: true,
      },
      {
        id: 'save-result',
        title: 'Save the result',
        body: 'Tap **Save** (or **Abnormal** if the clinician must act urgently). The result appears on the visit — no slip to carry back.',
        paper: 'No more carrying result slips to the consultation room.',
        requiresMockAction: true,
      },
      {
        id: 'done',
        title: 'Result is on the chart',
        body: 'The clinician reviews and acts. You supply accurate, timely results — you do not diagnose.',
      },
    ],
  },
  {
    id: 'pharmacy-dispense',
    role: 'dispenser',
    roleLabel: 'Dispenser / Pharmacy',
    title: 'Dispense medicines',
    subtitle: 'Pharmacy dispensing queue',
    intro:
      'When the clinician sends structured prescriptions, the visit appears under **Pharmacy → Dispensing → Waiting**.',
    Mock: PharmacyMock,
    steps: [
      {
        id: 'open-pharmacy',
        title: 'Open Pharmacy',
        body: 'Tap **Pharmacy** in the top menu. Use the **Waiting** tab — orders land here when the clinician sends them.',
        requiresMockAction: true,
      },
      {
        id: 'select-order',
        title: 'Select the visit',
        body: 'Tap the patient in the queue. The worksheet shows each prescription line, dose, and quantity.',
        requiresMockAction: true,
      },
      {
        id: 'dispense',
        title: 'Dispense & complete',
        body: 'Confirm quantities given, then tap **Dispense & complete**. Stock counts update automatically.',
        tip: 'If stock is low, tell the in-charge — levels are visible under Pharmacy → Stock.',
        requiresMockAction: true,
      },
      {
        id: 'done',
        title: 'Patient can leave pharmacy',
        body: 'The clinical note may still be open until signed. Dispensing is its own step — like your dispensary register.',
      },
    ],
  },
  {
    id: 'billing-payment',
    role: 'records_officer',
    roleLabel: 'Records / Front desk',
    title: 'Record a payment',
    subtitle: 'Billing without blocking care',
    intro:
      'Karibu separates payment from clinical closure. Open **Billing → Payments**, select a patient with a balance, and record cash or mobile money.',
    Mock: BillingMock,
    steps: [
      {
        id: 'open-billing',
        title: 'Open Payments',
        body: 'Tap **Billing** in the top menu, then **Payments**. Patients with outstanding balances are listed first.',
        requiresMockAction: true,
      },
      {
        id: 'find-patient',
        title: 'Open the patient bill',
        body: 'Tap a patient name to open their bill. Charges appear when labs complete or pharmacy dispenses.',
        requiresMockAction: true,
      },
      {
        id: 'record-payment',
        title: 'Record payment',
        body: 'Choose method (cash, MTN MoMo, Airtel Money, or mixed/barter), enter the amount, and tap **Record payment**.',
        paper: 'This replaces the receipt book — a printable receipt opens after you save.',
        requiresMockAction: true,
      },
      {
        id: 'done',
        title: 'Payment logged',
        body: 'HMIS and monthly reports use this data. The clinician does not need to reopen the note for payment.',
      },
    ],
  },
  {
    id: 'thermal-printer',
    role: 'records_officer',
    roleLabel: 'All staff',
    title: 'Set up the receipt printer',
    subtitle: 'One printer for visits, billing, and pharmacy',
    intro:
      'Karibu prints visit summaries, payment receipts, and medicine slips on a **thermal roll** — no ink, no toner, cheap paper. Connect the clinic printer once so every patient leaves with a paper record.',
    Mock: PrinterSetupMock,
    steps: [
      {
        id: 'open-admin',
        title: 'Open printer setup',
        body: 'Go to **Settings → Printer setup** (from your account menu or the Settings page). Any staff member can run this wizard.',
        paper: 'This replaces the inkjet discharge printout and the paper receipt book with one thermal roll.',
        requiresMockAction: true,
      },
      {
        id: 'connect',
        title: 'Connect the hardware',
        body: 'Plug in the USB thermal printer (or pair Bluetooth), load 58mm paper, and install the driver so it appears in your computer\'s printer list.',
        tip: 'In the print dialog later, set margins to **None** and scale to **100%**.',
        requiresMockAction: true,
      },
      {
        id: 'test-print',
        title: 'Print the test receipt',
        body: 'Tap **Print test receipt**. It includes sample charges, a payment line, and a short visit note — like a real patient slip.',
        paper: 'If the cut slices through text, go back and increase **cut feed**. If text is off-center, check paper width (58mm vs 80mm).',
        requiresMockAction: true,
      },
      {
        id: 'finish',
        title: 'Confirm and finish',
        body: 'Check that text is centered, nothing is cut off, and the cutter fires below the footer. Tap **Finish setup**.',
        requiresMockAction: true,
      },
      {
        id: 'done',
        title: 'Printer ready',
        body: 'Staff can print visit summaries at discharge, billing receipts after payment, and pharmacy slips at dispense — all on the same settings.',
      },
    ],
  },
]

export const EHR_MODULE_BY_ID = Object.fromEntries(
  EHR_ONBOARDING_MODULES.map((m) => [m.id, m]),
) as Record<string, EhrModuleDef>
