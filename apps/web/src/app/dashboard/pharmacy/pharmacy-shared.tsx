import { cn } from '@/lib/utils'

export type DispensingRow = {
  id: string
  visit_date: string
  diagnosis: string | null
  chief_complaint: string | null
  medications: string | null
  dispensing_status: 'not_started' | 'in_progress' | 'dispensed' | 'partial' | 'out_of_stock'
  dispense_notes: string | null
  pharmacy_order_submitted_at?: string | null
  documentation_completed_at?: string | null
  // WP2 C6: today's number + arrival time, so the dispenser can call "#23"
  // and both staff and patient reason in the same number.
  queue_position?: number | null
  checked_in_at?: string | null
  patient: {
    id: string
    patient_number: string | null
    first_name: string | null
    last_name: string | null
    display_name: string | null
    date_of_birth: string | null
    sex: string | null
    whatsapp_number: string | null
  }
}

export function patientDisplayName(row: DispensingRow): string {
  const fullName = [row.patient.first_name, row.patient.last_name]
    .filter(Boolean)
    .join(' ')
    .trim()
  return fullName || row.patient.display_name || 'Unknown'
}

export function patientMeta(row: DispensingRow): string {
  const ageBand = formatAge(row.patient.date_of_birth)
  const sexBand = row.patient.sex?.[0]?.toUpperCase() ?? ''
  return [
    row.patient.patient_number ?? `PT-${row.patient.id.slice(0, 6)}`,
    [ageBand, sexBand].filter(Boolean).join(''),
  ]
    .filter(Boolean)
    .join(' · ')
}

export function formatAge(dob: string | null): string {
  if (!dob) return ''
  try {
    const birth = new Date(dob)
    const now = new Date()
    let years = now.getFullYear() - birth.getFullYear()
    const m = now.getMonth() - birth.getMonth()
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) years -= 1
    if (years > 0) return `${years}y`
    const months =
      (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth())
    if (months > 0) return `${months}m`
    const days = Math.floor((now.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24))
    return `${days}d`
  } catch {
    return ''
  }
}

export function formatOldestWait(iso: string | null | undefined): string | null {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0) return '<1m'
  const mins = Math.floor(ms / 60_000)
  if (mins < 1) return '<1m'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  const rem = mins % 60
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`
}

export function StatusPill({ status }: { status: DispensingRow['dispensing_status'] }) {
  const config: Record<DispensingRow['dispensing_status'], { label: string; cls: string }> = {
    not_started: { label: 'Waiting', cls: 'bg-line-soft text-muted-foreground' },
    in_progress: { label: 'In progress', cls: 'bg-cobalt-soft text-cobalt' },
    dispensed: { label: 'Dispensed', cls: 'bg-green-soft text-green' },
    partial: { label: 'Partial', cls: 'bg-amber-soft text-amber-ink' },
    out_of_stock: { label: 'Out of stock', cls: 'bg-red-soft text-red' },
  }
  const c = config[status]
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-[3px] rounded-full text-[11px] font-semibold',
        c.cls,
      )}
    >
      {c.label}
    </span>
  )
}
