'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { FlaskConical, Pill, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { patientDisplayName } from '@/lib/referral-summary'

export type LabOrderRow = {
  id: string
  visit_date: string
  tests_ordered: string | null
  lab_status: string
  lab_results: string | null
  lab_abnormal: boolean
  patient: {
    id: string
    patient_number: string | null
    first_name: string | null
    last_name: string | null
    display_name: string | null
  } | null
}

export type PharmacyOrderRow = {
  id: string
  visit_date: string
  medications: string | null
  dispensing_status: string
  patient: {
    id: string
    patient_number: string | null
    first_name: string | null
    last_name: string | null
    display_name: string | null
  } | null
}

export type ReferralRow = {
  id: string
  patient_id: string
  visit_id: string | null
  patient_name: string
  to_facility: string
  urgency: string
  reason: string
  status: string
  created_at: string
}

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'labs', label: 'Labs' },
  { id: 'pharmacy', label: 'Pharmacy' },
  { id: 'referrals', label: 'Referrals' },
] as const

type TabId = (typeof TABS)[number]['id']

const LAB_STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-primary/10 text-primary' },
  running: { label: 'Running', className: 'bg-primary/10 text-primary' },
  done: { label: 'Done', className: 'bg-accent/10 text-accent' },
  abnormal: { label: 'Abnormal', className: 'bg-destructive/10 text-destructive' },
}

const PHARM_STATUS: Record<string, { label: string; className: string }> = {
  not_started: { label: 'Awaiting', className: 'bg-muted text-muted-foreground' },
  in_progress: { label: 'Dispensing', className: 'bg-primary/10 text-primary' },
  dispensed: { label: 'Dispensed', className: 'bg-accent/10 text-accent' },
  partial: { label: 'Partial', className: 'bg-amber-100 text-amber-800' },
  out_of_stock: { label: 'Out of stock', className: 'bg-destructive/10 text-destructive' },
}

const URGENCY_CLASS: Record<string, string> = {
  routine: 'bg-muted text-muted-foreground',
  urgent: 'bg-amber-100 text-amber-800',
  emergency: 'bg-destructive/10 text-destructive',
}

export function OrdersClient({
  labs,
  pharmacy,
  referrals,
  initialTab,
}: {
  labs: LabOrderRow[]
  pharmacy: PharmacyOrderRow[]
  referrals: ReferralRow[]
  initialTab: TabId
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tab = ((searchParams?.get('tab') as TabId) || initialTab)

  const setTab = (next: TabId) => {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    if (next === 'all') params.delete('tab')
    else params.set('tab', next)
    const q = params.toString()
    router.replace(q ? `/dashboard/orders?${q}` : '/dashboard/orders')
  }

  const showLabs = tab === 'all' || tab === 'labs'
  const showPharmacy = tab === 'all' || tab === 'pharmacy'
  const showReferrals = tab === 'all' || tab === 'referrals'
  const isEmpty =
    (showLabs ? labs.length : 0) +
      (showPharmacy ? pharmacy.length : 0) +
      (showReferrals ? referrals.length : 0) ===
    0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium border transition-colors',
              tab === t.id
                ? 'bg-cobalt text-white border-cobalt'
                : 'bg-card border-border text-body hover:bg-background',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isEmpty ? (
        <div className="py-16 text-center text-muted-foreground">
          No orders in this view yet. Lab tests, prescriptions, and referrals you create
          during visits appear here.
        </div>
      ) : (
        <>
          {showLabs && labs.length > 0 && (
            <OrderSection title="Lab orders" icon={FlaskConical}>
              {labs.map((row) => (
                <OrderRow
                  key={`lab-${row.id}`}
                  patientHref={row.patient ? `/dashboard/patients/${row.patient.id}` : undefined}
                  visitHref={`/dashboard/visits/${row.id}`}
                  patientName={row.patient ? patientDisplayName(row.patient) : 'Unknown'}
                  meta={row.tests_ordered ?? '—'}
                  status={LAB_STATUS[row.lab_status]?.label ?? row.lab_status}
                  statusClass={LAB_STATUS[row.lab_status]?.className ?? 'bg-muted'}
                  detail={row.lab_results ?? undefined}
                />
              ))}
            </OrderSection>
          )}

          {showPharmacy && pharmacy.length > 0 && (
            <OrderSection title="Pharmacy orders" icon={Pill}>
              {pharmacy.map((row) => (
                <OrderRow
                  key={`rx-${row.id}`}
                  patientHref={row.patient ? `/dashboard/patients/${row.patient.id}` : undefined}
                  visitHref={`/dashboard/visits/${row.id}`}
                  patientName={row.patient ? patientDisplayName(row.patient) : 'Unknown'}
                  meta={row.medications ?? '—'}
                  status={PHARM_STATUS[row.dispensing_status]?.label ?? row.dispensing_status}
                  statusClass={PHARM_STATUS[row.dispensing_status]?.className ?? 'bg-muted'}
                />
              ))}
            </OrderSection>
          )}

          {showReferrals && referrals.length > 0 && (
            <OrderSection title="Referrals today" icon={Send}>
              {referrals.map((row) => (
                <OrderRow
                  key={`ref-${row.id}`}
                  patientHref={`/dashboard/patients/${row.patient_id}`}
                  visitHref={row.visit_id ? `/dashboard/visits/${row.visit_id}` : undefined}
                  patientName={row.patient_name}
                  meta={`→ ${row.to_facility}`}
                  status={row.urgency}
                  statusClass={URGENCY_CLASS[row.urgency] ?? 'bg-muted'}
                  detail={row.reason}
                />
              ))}
            </OrderSection>
          )}
        </>
      )}
    </div>
  )
}

function OrderSection({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-[18px] py-3.5 flex items-center gap-2 border-b border-line-soft">
        <Icon className="h-4 w-4 text-cobalt" />
        <div className="text-sm font-semibold">{title}</div>
      </div>
      <div className="divide-y divide-line-soft">{children}</div>
    </div>
  )
}

function OrderRow({
  patientHref,
  visitHref,
  patientName,
  meta,
  status,
  statusClass,
  detail,
}: {
  patientHref?: string
  visitHref?: string
  patientName: string
  meta: string
  status: string
  statusClass: string
  detail?: string
}) {
  return (
    <div className="px-[18px] py-3 grid grid-cols-[1.2fr_2fr_auto] gap-3 items-start text-[13px]">
      <div>
        {patientHref ? (
          <Link href={patientHref} className="font-semibold hover:underline">
            {patientName}
          </Link>
        ) : (
          <span className="font-semibold">{patientName}</span>
        )}
        {visitHref && (
          <Link href={visitHref} className="block text-[11px] text-cobalt hover:underline mt-0.5">
            Open visit
          </Link>
        )}
      </div>
      <div className="text-body min-w-0">
        <div className="line-clamp-2">{meta}</div>
        {detail && (
          <div className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{detail}</div>
        )}
      </div>
      <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize shrink-0', statusClass)}>
        {status}
      </span>
    </div>
  )
}
