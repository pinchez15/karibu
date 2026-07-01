import type { StaffRole } from '@karibu/shared'
import type { ComponentType } from 'react'
import {
  BillingMock,
  ClinicianNoteMock,
  LabQueueMock,
  PharmacyMock,
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
    subtitle: 'Search, register, and check in to OPD',
    intro:
      'At the front desk you give every patient one identity in Karibu. Search first — most arrivals are returning. Only register when no match exists, then check them into the right department.',
    Mock: RecordsDeskMock,
    steps: [
      {
        id: 'open-patients',
        title: 'Start at Patients',
        body: 'Tap **Patients** in the left menu. This is your register — it replaces the paper OPD book and filing cards.',
        paper: 'On paper you flipped through the register or card file. Here you search by name, phone, or patient number.',
        requiresMockAction: true,
      },
      {
        id: 'search-first',
        title: 'Search before you register',
        body: 'Type the patient\'s name or phone in the search bar. Karibu will show matches from your clinic only.',
        paper: 'This prevents duplicate cards — a common problem when two clerks register the same person.',
        tip: 'If the patient has no phone, search by name and village.',
        requiresMockAction: true,
      },
      {
        id: 'new-patient',
        title: 'Register a new patient',
        body: 'No match? Tap **+ New patient**. Enter first name, last name, and sex (required for HMIS reports). Phone and village help next time.',
        requiresMockAction: true,
      },
      {
        id: 'save-patient',
        title: 'Save the chart',
        body: 'Tap **Save patient**. Karibu assigns a patient number automatically — you do not need to write one by hand.',
        paper: 'On paper you wrote the next serial number in the register. Karibu tracks that for you.',
        requiresMockAction: true,
      },
      {
        id: 'check-in',
        title: 'Check in to OPD',
        body: 'Choose **OPD** (or ANC / Maternity if that is why they came). Check-in puts them on today\'s queue for nurses and the clinician.',
        tip: 'Payment can happen before or after care — it does not block the clinical note.',
        requiresMockAction: true,
      },
      {
        id: 'done',
        title: 'Patient is on the queue',
        body: 'You will see them under today\'s check-ins. The nurse can now take vitals. You have finished the records desk part of this visit.',
      },
    ],
  },
  {
    id: 'nurse-vitals',
    role: 'nurse',
    roleLabel: 'Registered Nurse',
    title: 'Record vitals',
    subtitle: 'Capture vitals on the patient timeline',
    intro:
      'Nurses and enrolled nurses record vitals before the clinician sees the patient. Vitals stay on the chart forever — the clinician sees trends on the next visit.',
    Mock: VitalsMock,
    steps: [
      {
        id: 'open-chart',
        title: 'Open the patient chart',
        body: 'From **Today** or **Worklists → Needs vitals**, tap the patient who is waiting. You land on their timeline.',
        paper: 'On paper you wrote vitals on the OPD card or ward sheet. Here they live on the digital chart.',
        requiresMockAction: true,
      },
      {
        id: 'vitals-section',
        title: 'Find Vitals',
        body: 'Scroll to the **Vitals** section on the timeline. Tap **Record vitals** to open the form.',
        requiresMockAction: true,
      },
      {
        id: 'enter-values',
        title: 'Enter today\'s measurements',
        body: 'Fill temperature, pulse, blood pressure, weight, and respiratory rate when you have them. Leave blank what you did not measure — do not guess.',
        tip: 'Danger signs (very high temp, low BP, altered consciousness) will flag for the clinician.',
        requiresMockAction: true,
      },
      {
        id: 'save-vitals',
        title: 'Save vitals',
        body: 'Tap **Save**. The patient moves to **Ready for clinician** on the queue. Your work is visible to the whole team instantly.',
        requiresMockAction: true,
      },
      {
        id: 'done',
        title: 'Hand off to clinician',
        body: 'You do not write the diagnosis — the Medical Clinical Officer does. Your vitals are the clinical picture they start with.',
      },
    ],
  },
  {
    id: 'clinician-note-pharmacy',
    role: 'clinical_officer',
    roleLabel: 'Medical Clinical Officer',
    title: 'Document the visit',
    subtitle: 'Clinical note, orders, and pharmacy',
    intro:
      'The Clinical Officer owns the diagnosis, plan, and prescriptions. In Karibu you document in structured sections, order labs, and send to pharmacy while the note is still open.',
    Mock: ClinicianNoteMock,
    steps: [
      {
        id: 'claim-patient',
        title: 'Claim from the queue',
        body: 'On **Today**, tap a patient in **Ready for clinician**. That assigns the visit to you so others know you are seeing them.',
        requiresMockAction: true,
      },
      {
        id: 'chief-complaint',
        title: 'Chief complaint & history',
        body: 'Enter why they came today and key exam findings. You can type or use voice dictation on your phone.',
        paper: 'This replaces the narrative on the OPD card — but stays searchable and reportable.',
        requiresMockAction: true,
      },
      {
        id: 'diagnosis-plan',
        title: 'Diagnosis and plan',
        body: 'Add your working diagnosis and plan. HMIS codes can be suggested from your note — review before signing.',
        requiresMockAction: true,
      },
      {
        id: 'order-labs',
        title: 'Order labs (if needed)',
        body: 'Tap **Order labs** and select tests. The lab tech sees them immediately — you do not wait for the note to be signed.',
        tip: 'Skip this step in practice if no labs today — tap Next here to continue.',
      },
      {
        id: 'send-pharmacy',
        title: 'Send to pharmacy',
        body: 'Add medicines and tap **Send to pharmacy**. Pharmacy opens the order now — not when you finally sign the note.',
        paper: 'On paper the dispenser copied from your prescription slip. Here the order is already in their queue.',
        requiresMockAction: true,
      },
      {
        id: 'done',
        title: 'Sign when ready',
        body: 'You can sign the note when documentation is complete. Care can continue at lab and pharmacy while you finish.',
      },
    ],
  },
  {
    id: 'lab-result',
    role: 'lab_tech',
    roleLabel: 'Lab Technician',
    title: 'Record a lab result',
    subtitle: 'Work the lab queue and release results',
    intro:
      'Lab staff collect specimens, run tests, and enter results. Clinicians see results on the chart as soon as you save — no walking the slip back to OPD.',
    Mock: LabQueueMock,
    steps: [
      {
        id: 'open-lab',
        title: 'Open the Lab desk',
        body: 'Tap **Lab** in the top menu. You see all pending orders for today, newest first.',
        requiresMockAction: true,
      },
      {
        id: 'collect-specimen',
        title: 'Mark specimen collected',
        body: 'When you draw blood or receive the sample, tap **Collected** on that order. Clinicians know the test is in progress.',
        requiresMockAction: true,
      },
      {
        id: 'enter-result',
        title: 'Enter the result',
        body: 'Tap the test, type the value, and flag abnormal results. Double-check units — wrong entries affect treatment.',
        requiresMockAction: true,
      },
      {
        id: 'release',
        title: 'Release to clinician',
        body: 'Tap **Release result**. It appears on the patient chart and worklist for the ordering clinician.',
        paper: 'No more carrying result slips to the consultation room.',
        requiresMockAction: true,
      },
      {
        id: 'done',
        title: 'Result is on the chart',
        body: 'The clinician reviews and acts. You do not diagnose — you supply accurate, timely results.',
      },
    ],
  },
  {
    id: 'pharmacy-dispense',
    role: 'dispenser',
    roleLabel: 'Dispenser / Pharmacy',
    title: 'Dispense medicines',
    subtitle: 'Pharmacy queue and stock',
    intro:
      'When the clinician sends an order, it appears in your pharmacy queue. Dispense, record what you gave, and stock counts update automatically.',
    Mock: PharmacyMock,
    steps: [
      {
        id: 'open-pharmacy',
        title: 'Open Pharmacy',
        body: 'Tap **Pharmacy** in the top menu. Orders appear when the clinician sends them — not when the note is signed.',
        requiresMockAction: true,
      },
      {
        id: 'select-order',
        title: 'Select the order',
        body: 'Tap the patient\'s order. You see each medicine line, dose, and quantity ordered.',
        requiresMockAction: true,
      },
      {
        id: 'dispense',
        title: 'Dispense and confirm',
        body: 'Give the medicines, then tap **Dispense** (or **Partial** if out of stock). Add a note if you substituted.',
        tip: 'If stock is low, tell the in-charge — stock levels are visible in Inventory.',
        requiresMockAction: true,
      },
      {
        id: 'done',
        title: 'Patient can leave pharmacy',
        body: 'The visit may still be open clinically until the note is signed. Dispensing is its own step — like your dispensary register.',
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
      'Karibu separates payment from clinical closure. Collect fees when the clinic policy says to — care is not held hostage waiting for cash.',
    Mock: BillingMock,
    steps: [
      {
        id: 'open-billing',
        title: 'Open Billing',
        body: 'Tap **Billing** in the top menu, or open billing from the patient chart.',
        requiresMockAction: true,
      },
      {
        id: 'find-patient',
        title: 'Find the patient',
        body: 'Search the patient. You see consultation charges, lab fees, and medicines that were dispensed.',
        requiresMockAction: true,
      },
      {
        id: 'record-payment',
        title: 'Record payment',
        body: 'Enter amount received and method (cash, mobile money). Tap **Record payment**.',
        paper: 'This replaces the receipt book — but you can still print a receipt for the patient.',
        requiresMockAction: true,
      },
      {
        id: 'done',
        title: 'Payment logged',
        body: 'HMIS and monthly reports use this data. The clinician does not need to reopen the note for payment.',
      },
    ],
  },
]

export const EHR_MODULE_BY_ID = Object.fromEntries(
  EHR_ONBOARDING_MODULES.map((m) => [m.id, m]),
) as Record<string, EhrModuleDef>
