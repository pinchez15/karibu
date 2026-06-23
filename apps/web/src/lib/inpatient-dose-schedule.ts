/**
 * Compute today's dose slots from free-text frequency labels (BD/TDS/…).
 * Ward-standard times for Ugandan HC III (08:00 / 14:00 / 20:00 anchors).
 */

import type { MedicationAdmin, MedicationOrder } from '@/app/dashboard/inpatient/types'

export type DoseSlot = {
  orderId: string
  drugName: string
  dose: string | null
  route: string | null
  frequency: string | null
  scheduledFor: Date
  label: string
  status: 'due' | 'due_soon' | 'overdue' | 'given' | 'not_given' | 'upcoming'
  adminId?: string
  notGivenReason?: string | null
}

const SLOT_TIMES: Record<string, number[]> = {
  stat: [],
  od: [8],
  daily: [8],
  mane: [8],
  bd: [8, 20],
  tds: [8, 14, 20],
  qds: [6, 12, 18, 22],
  q6h: [6, 12, 18, 0],
  q8h: [6, 14, 22],
  nocte: [20],
}

const GRACE_MINUTES = 30
const DUE_SOON_MINUTES = 60
const MATCH_WINDOW_MS = 90 * 60 * 1000

function normalizeFreq(freq: string | null): string {
  if (!freq) return 'stat'
  const f = freq.trim().toLowerCase().replace(/\s+/g, '')
  if (f.includes('stat') || f.includes('once')) return 'stat'
  if (f.includes('prn') || f.includes('sos')) return 'prn'
  if (f.includes('qds') || f.includes('4x') || f.includes('four')) return 'qds'
  if (f.includes('tds') || f.includes('3x') || f.includes('three')) return 'tds'
  if (f.includes('bd') || f.includes('2x') || f.includes('twice')) return 'bd'
  if (f.includes('q6')) return 'q6h'
  if (f.includes('q8')) return 'q8h'
  if (f.includes('nocte') || f.includes('night')) return 'nocte'
  if (f.includes('od') || f.includes('daily') || f.includes('mane')) return 'od'
  return f
}

function atHourToday(hour: number, now: Date): Date {
  const d = new Date(now)
  d.setHours(hour, 0, 0, 0)
  return d
}

function formatSlotTime(d: Date): string {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function findAdminForSlot(
  orderId: string,
  slotTime: Date,
  admins: MedicationAdmin[],
): MedicationAdmin | undefined {
  const slotMs = slotTime.getTime()
  return admins.find((a) => {
    if (a.order_id !== orderId) return false
    const sched = a.scheduled_for ? new Date(a.scheduled_for).getTime() : null
    if (sched != null && Math.abs(sched - slotMs) < MATCH_WINDOW_MS) return true
    const adminMs = new Date(a.administered_at).getTime()
    return Math.abs(adminMs - slotMs) < MATCH_WINDOW_MS
  })
}

function slotStatus(
  slotTime: Date,
  admin: MedicationAdmin | undefined,
  now: Date,
): DoseSlot['status'] {
  if (admin) return admin.status === 'given' ? 'given' : 'not_given'
  const diffMin = (slotTime.getTime() - now.getTime()) / 60_000
  if (diffMin > DUE_SOON_MINUTES) return 'upcoming'
  if (diffMin > -GRACE_MINUTES) return 'due_soon'
  if (diffMin > -GRACE_MINUTES - 120) return 'due'
  return 'overdue'
}

export function isPrnOrder(order: MedicationOrder): boolean {
  return normalizeFreq(order.frequency) === 'prn'
}

export function buildDoseSchedule(
  orders: MedicationOrder[],
  admins: MedicationAdmin[],
  now = new Date(),
): { dueNow: DoseSlot[]; upcoming: DoseSlot[]; prn: MedicationOrder[] } {
  const active = orders.filter((o) => o.active)
  const prn = active.filter(isPrnOrder)
  const scheduled = active.filter((o) => !isPrnOrder(o))

  const slots: DoseSlot[] = []

  for (const order of scheduled) {
    const key = normalizeFreq(order.frequency)
    let hours = SLOT_TIMES[key]

    if (key === 'stat') {
      const start = new Date(order.created_at)
      hours = [start.getHours()]
    }

    if (!hours?.length) {
      hours = [8, 20]
    }

    for (const h of hours) {
      const slotTime = atHourToday(h, now)
      const admin = findAdminForSlot(order.id, slotTime, admins)
      const status = slotStatus(slotTime, admin, now)
      slots.push({
        orderId: order.id,
        drugName: order.drug_name,
        dose: order.dose,
        route: order.route,
        frequency: order.frequency,
        scheduledFor: slotTime,
        label: formatSlotTime(slotTime),
        status,
        adminId: admin?.id,
        notGivenReason: admin?.not_given_reason,
      })
    }
  }

  slots.sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime())

  const dueNow = slots.filter((s) =>
    ['due', 'due_soon', 'overdue'].includes(s.status),
  )
  const upcoming = slots.filter((s) => s.status === 'upcoming')

  return { dueNow, upcoming, prn }
}
