import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { WebTopBar } from '@/components/web-shell'
import { cn } from '@/lib/utils'

/**
 * Pharmacy history — visits with a recorded dispensing outcome in the
 * past 30 days. Provides a paper trail for the dispenser without a real
 * dispense_records table (that ships in the post-rollout schema).
 */

interface HistoryRow {
  id: string
  visit_date: string
  dispensing_status: string
  dispense_notes: string | null
  dispensed_at: string | null
  medications: string | null
  patient: {
    id: string
    patient_number: string | null
    first_name: string | null
    last_name: string | null
    display_name: string | null
  }
  dispensed_by_staff: { display_name: string | null } | null
}

async function getHistory(clinicId: string): Promise<HistoryRow[]> {
  const supabase = createServiceClient()
  const since = new Date()
  since.setDate(since.getDate() - 30)

  const { data, error } = await supabase
    .from('visits')
    .select(`
      id,
      visit_date,
      dispensing_status,
      dispense_notes,
      dispensed_at,
      medications,
      patient:patients!inner (
        id,
        patient_number,
        first_name,
        last_name,
        display_name
      ),
      dispensed_by_staff:staff!visits_dispensed_by_fkey (display_name)
    `)
    .eq('clinic_id', clinicId)
    .in('dispensing_status', ['dispensed', 'partial', 'out_of_stock'])
    .gte('dispensed_at', since.toISOString())
    .order('dispensed_at', { ascending: false })
    .limit(200)

  if (error) {
    console.error('Failed to load pharmacy history:', error)
    return []
  }
  return (data ?? []) as unknown as HistoryRow[]
}

export default async function PharmacyHistoryPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')

  if (staff.role !== 'dispenser' && staff.role !== 'admin') {
    redirect('/dashboard')
  }

  const history = await getHistory(staff.clinic_id)

  return (
    <>
      <WebTopBar
        title="History"
        subtitle="PHARMACY · LAST 30 DAYS"
        actions={
          <Link
            href="/dashboard/pharmacy"
            className="bg-card text-body border border-border rounded-md px-3 py-2 font-medium text-[13px] inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to today
          </Link>
        }
      />

      <div className="p-6 overflow-auto flex-1">
        {history.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            No dispensing recorded in the past 30 days.
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl">
            <div className="grid grid-cols-[1.4fr_1.5fr_2fr_1fr_1.2fr] gap-3 px-[18px] py-2 kh-meta border-b border-line-soft">
              <span>PATIENT</span>
              <span>WHEN</span>
              <span>MEDICATIONS</span>
              <span>STATUS</span>
              <span>BY</span>
            </div>

            {history.map((row, i) => {
              const last = i === history.length - 1
              const fullName = [row.patient.first_name, row.patient.last_name]
                .filter(Boolean)
                .join(' ')
                .trim() || row.patient.display_name || 'Unknown'
              return (
                <Link
                  key={row.id}
                  href={`/dashboard/visits/${row.id}`}
                  className={cn(
                    'grid grid-cols-[1.4fr_1.5fr_2fr_1fr_1.2fr] gap-3 px-[18px] py-3 text-[13px] items-start hover:bg-background/60 transition-colors',
                    !last && 'border-b border-line-soft',
                  )}
                >
                  <div>
                    <div className="font-semibold">{fullName}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">
                      {row.patient.patient_number ?? `PT-${row.patient.id.slice(0, 6)}`}
                    </div>
                  </div>
                  <div className="text-body font-mono text-[12px]">
                    {row.dispensed_at ? new Date(row.dispensed_at).toLocaleString() : '—'}
                  </div>
                  <div className="text-body whitespace-pre-wrap">{row.medications ?? '—'}</div>
                  <div>
                    <StatusBadge status={row.dispensing_status} />
                  </div>
                  <div className="text-body">
                    {row.dispensed_by_staff?.display_name ?? '—'}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    dispensed: { label: 'Dispensed', cls: 'bg-green-soft text-green' },
    partial: { label: 'Partial', cls: 'bg-amber-soft text-amber-ink' },
    out_of_stock: { label: 'Out of stock', cls: 'bg-red-soft text-red' },
  }
  const c = map[status] ?? { label: status, cls: 'bg-line-soft text-muted-foreground' }
  return (
    <span className={cn('inline-flex items-center px-2.5 py-[3px] rounded-full text-[11px] font-semibold', c.cls)}>
      {c.label}
    </span>
  )
}
