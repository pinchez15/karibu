import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Pill } from 'lucide-react'
import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { WebTopBar } from '@/components/web-shell'

// Clinician-facing read-only view of pharmacy orders they wrote. Mirrors the
// dispenser queue at /dashboard/pharmacy but scoped to `doctor_id = me` so the
// clinician can confirm a patient picked up their meds without bothering the
// dispenser.

interface MyPharmacyRow {
  id: string
  visit_date: string
  medications: string | null
  dispensing_status: string
  dispense_notes: string | null
  patient: {
    id: string
    patient_number: string | null
    first_name: string | null
    last_name: string | null
    display_name: string | null
  } | null
}

const DISPENSING_DISPLAY: Record<string, { label: string; color: string; bg: string }> = {
  not_started: { label: 'Awaiting', color: 'text-muted-foreground', bg: 'bg-muted' },
  in_progress: { label: 'Dispensing', color: 'text-primary', bg: 'bg-primary/10' },
  dispensed: { label: 'Dispensed', color: 'text-accent', bg: 'bg-accent/10' },
  partial: { label: 'Partial', color: 'text-amber-700', bg: 'bg-amber-100' },
  out_of_stock: { label: 'Out of stock', color: 'text-destructive', bg: 'bg-destructive/10' },
}

async function getMyPharmacyOrders(clinicId: string, staffId: string): Promise<MyPharmacyRow[]> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('visits')
    .select(`
      id,
      visit_date,
      medications,
      dispensing_status,
      dispense_notes,
      patient:patients!inner (
        id,
        patient_number,
        first_name,
        last_name,
        display_name
      )
    `)
    .eq('clinic_id', clinicId)
    .eq('doctor_id', staffId)
    .not('medications', 'is', null)
    .neq('medications', '')
    .order('visit_date', { ascending: false })
    .limit(100)

  if (error) {
    console.error('Failed to load my pharmacy orders:', error)
    return []
  }
  return (data ?? []) as unknown as MyPharmacyRow[]
}

function patientName(p: MyPharmacyRow['patient']): string {
  if (!p) return 'Unknown patient'
  return [p.first_name, p.last_name].filter(Boolean).join(' ') || p.display_name || 'Unknown patient'
}

export default async function MyPharmacyPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')

  const orders = await getMyPharmacyOrders(staff.clinic_id, staff.id)
  const open = orders.filter(o => ['not_started', 'in_progress'].includes(o.dispensing_status))
  const closed = orders.filter(o => ['dispensed', 'partial', 'out_of_stock'].includes(o.dispensing_status))

  return (
    <>
      <WebTopBar
        title="Pharmacy status"
        subtitle="CLINICIAN · YOUR PRESCRIPTIONS"
      />

      <div className="p-6 overflow-auto flex-1 space-y-6">
        {orders.length === 0 ? (
          <div className="py-20 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-cobalt-soft text-cobalt mb-5">
              <Pill className="h-7 w-7" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight mb-2">No prescriptions yet</h2>
            <p className="text-base text-body leading-relaxed max-w-lg mx-auto">
              Prescriptions you write during a visit appear here so you can confirm
              dispense status without leaving your queue.
            </p>
          </div>
        ) : (
          <>
            <PharmacySection
              title="Awaiting dispense"
              rows={open}
              emptyHint="Nothing waiting."
            />
            <PharmacySection
              title="Closed"
              rows={closed}
              emptyHint="No dispenses recorded yet."
            />
          </>
        )}
      </div>
    </>
  )
}

function PharmacySection({
  title,
  rows,
  emptyHint,
}: {
  title: string
  rows: MyPharmacyRow[]
  emptyHint: string
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title} ({rows.length})
      </h2>
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="hidden md:grid md:grid-cols-[minmax(220px,2fr)_120px_minmax(260px,3fr)_minmax(180px,1.5fr)_140px] gap-4 px-4 py-2.5 bg-muted/40 border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <div>Patient</div>
          <div>Visit date</div>
          <div>Medications</div>
          <div>Dispenser note</div>
          <div>Status</div>
        </div>
        {rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">{emptyHint}</div>
        ) : (
          rows.map((row) => {
            const display =
              DISPENSING_DISPLAY[row.dispensing_status] ?? DISPENSING_DISPLAY.not_started
            return (
              <div
                key={row.id}
                className="grid grid-cols-1 md:grid-cols-[minmax(220px,2fr)_120px_minmax(260px,3fr)_minmax(180px,1.5fr)_140px] gap-y-1 md:gap-4 px-4 py-3 border-b border-border last:border-b-0 hover:bg-secondary/40 transition-colors"
              >
                <div className="min-w-0">
                  <Link
                    href={`/dashboard/patients/${row.patient?.id}`}
                    className="font-medium hover:underline truncate block"
                  >
                    {patientName(row.patient)}
                  </Link>
                  {row.patient?.patient_number && (
                    <div className="text-xs text-muted-foreground truncate">
                      #{row.patient.patient_number}
                    </div>
                  )}
                </div>
                <div className="text-sm text-muted-foreground md:text-foreground">
                  {new Date(row.visit_date).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                  })}
                </div>
                <div className="text-sm whitespace-pre-wrap break-words">
                  {row.medications}
                </div>
                <div className="text-sm whitespace-pre-wrap break-words text-muted-foreground">
                  {row.dispense_notes || '—'}
                </div>
                <div>
                  <Link
                    href={`/dashboard/visits/${row.id}`}
                    className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full hover:opacity-80 ${display.bg} ${display.color}`}
                  >
                    {display.label}
                  </Link>
                </div>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}
