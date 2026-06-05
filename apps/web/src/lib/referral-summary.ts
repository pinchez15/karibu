export type ReferralUrgency = 'routine' | 'urgent' | 'emergency'

export interface ReferralSummaryInput {
  clinicName?: string | null
  referringClinician?: string | null
  patientName: string
  patientNumber: string
  patientSex?: string | null
  patientDob?: string | null
  patientPhone?: string | null
  toFacility: string
  urgency: ReferralUrgency
  reason: string
  clinicalSummary?: string | null
  transportMode?: string | null
  createdAt: string
  chiefComplaint?: string | null
  diagnosis?: string | null
  testsOrdered?: string | null
  labResults?: string | null
  medications?: string | null
  vitalsLine?: string | null
}

const URGENCY_LABEL: Record<ReferralUrgency, string> = {
  routine: 'ROUTINE',
  urgent: 'URGENT',
  emergency: 'EMERGENCY',
}

export function buildPrintableReferralSummary(input: ReferralSummaryInput): string {
  const whenReferred = formatReferralDate(input.createdAt)
  const lines: string[] = []

  lines.push('KARIBU HEALTH — REFERRAL / TRANSFER SUMMARY')
  lines.push('='.repeat(48))
  lines.push('')
  lines.push(`Referring facility: ${input.clinicName ?? 'Health Centre III'}`)
  if (input.referringClinician) lines.push(`Referring clinician: ${input.referringClinician}`)
  lines.push(`Date: ${whenReferred}`)
  lines.push(`Urgency: ${URGENCY_LABEL[input.urgency]}`)
  lines.push('')
  lines.push('PATIENT')
  lines.push('-'.repeat(48))
  lines.push(`Name: ${input.patientName}`)
  lines.push(`Patient ID: ${input.patientNumber}`)
  if (input.patientSex) lines.push(`Sex: ${input.patientSex}`)
  if (input.patientDob) lines.push(`Date of birth: ${input.patientDob}`)
  if (input.patientPhone) lines.push(`Phone: ${input.patientPhone}`)
  lines.push('')
  lines.push('RECEIVING FACILITY')
  lines.push('-'.repeat(48))
  lines.push(input.toFacility)
  if (input.transportMode?.trim()) lines.push(`Transport: ${input.transportMode.trim()}`)
  lines.push('')
  lines.push('REASON FOR REFERRAL')
  lines.push('-'.repeat(48))
  lines.push(input.reason)
  lines.push('')
  if (input.chiefComplaint?.trim()) {
    lines.push(`Chief complaint: ${input.chiefComplaint.trim()}`)
    lines.push('')
  }
  if (input.vitalsLine?.trim()) {
    lines.push('VITALS (latest)')
    lines.push('-'.repeat(48))
    lines.push(input.vitalsLine.trim())
    lines.push('')
  }
  if (input.testsOrdered?.trim()) lines.push(`Labs ordered: ${input.testsOrdered.trim()}`)
  if (input.labResults?.trim()) lines.push(`Lab results: ${input.labResults.trim()}`)
  if (input.diagnosis?.trim()) lines.push(`Working diagnosis: ${input.diagnosis.trim()}`)
  if (input.medications?.trim()) lines.push(`Medications given/ordered: ${input.medications.trim()}`)
  if (input.clinicalSummary?.trim()) {
    lines.push('')
    lines.push('CLINICAL SUMMARY')
    lines.push('-'.repeat(48))
    lines.push(input.clinicalSummary.trim())
  }
  lines.push('')
  lines.push('—')
  lines.push('This summary accompanies the patient to the receiving facility.')
  lines.push('Digital transfer may be available in future releases.')

  return lines.join('\n')
}

export function defaultClinicalSummary(args: {
  chiefComplaint?: string | null
  transcript?: string | null
  diagnosis?: string | null
  testsOrdered?: string | null
  labResults?: string | null
  medications?: string | null
  vitalsLine?: string | null
}): string {
  const blocks: string[] = []
  if (args.chiefComplaint?.trim()) blocks.push(`Chief complaint: ${args.chiefComplaint.trim()}`)
  if (args.transcript?.trim()) blocks.push(args.transcript.trim().slice(0, 1200))
  if (args.diagnosis?.trim()) blocks.push(`Diagnosis: ${args.diagnosis.trim()}`)
  if (args.testsOrdered?.trim()) blocks.push(`Labs: ${args.testsOrdered.trim()}`)
  if (args.labResults?.trim()) blocks.push(`Results: ${args.labResults.trim()}`)
  if (args.medications?.trim()) blocks.push(`Medications: ${args.medications.trim()}`)
  if (args.vitalsLine?.trim()) blocks.push(`Vitals: ${args.vitalsLine.trim()}`)
  return blocks.join('\n\n').trim()
}

function formatReferralDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function patientDisplayName(patient: {
  first_name?: string | null
  last_name?: string | null
  display_name?: string | null
}): string {
  const fromParts = [patient.first_name, patient.last_name].filter(Boolean).join(' ').trim()
  return fromParts || patient.display_name || 'Unknown'
}
