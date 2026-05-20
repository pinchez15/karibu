import { redirect } from 'next/navigation'
import { AlertTriangle, FlaskConical, Pill } from 'lucide-react'
import { getStaff } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { WebTopBar } from '@/components/web-shell'
import { cn } from '@/lib/utils'

// Clinician-facing stock view. Read-only — purpose is "before I prescribe AL,
// do we have AL?". Splits low/out-of-stock into a highlighted top section so
// the clinician can scan it quickly between patients.

interface PharmacyRow {
  id: string
  drug_name: string
  strength: string | null
  formulation: string
  unit: string
  quantity_on_hand: number
  low_stock_threshold: number | null
}

interface LabRow {
  id: string
  test_name: string
  category: string
  unit: string
  quantity_on_hand: number
  low_stock_threshold: number | null
}

async function loadStock(clinicId: string) {
  const supabase = createServiceClient()
  const [{ data: pharmacy }, { data: lab }] = await Promise.all([
    supabase
      .from('pharmacy_stock_items')
      .select('id, drug_name, strength, formulation, unit, quantity_on_hand, low_stock_threshold')
      .eq('clinic_id', clinicId)
      .eq('active', true)
      .order('drug_name', { ascending: true }),
    supabase
      .from('lab_stock_items')
      .select('id, test_name, category, unit, quantity_on_hand, low_stock_threshold')
      .eq('clinic_id', clinicId)
      .eq('active', true)
      .order('test_name', { ascending: true }),
  ])
  return {
    pharmacy: (pharmacy ?? []) as PharmacyRow[],
    lab: (lab ?? []) as LabRow[],
  }
}

function isLow<T extends { quantity_on_hand: number; low_stock_threshold: number | null }>(
  row: T,
): boolean {
  return row.low_stock_threshold != null && row.quantity_on_hand <= row.low_stock_threshold
}

function isOut<T extends { quantity_on_hand: number }>(row: T): boolean {
  return row.quantity_on_hand <= 0
}

export default async function StockOverviewPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')

  const { pharmacy, lab } = await loadStock(staff.clinic_id)

  const lowPharmacy = pharmacy.filter(isLow)
  const lowLab = lab.filter(isLow)

  return (
    <>
      <WebTopBar
        title="Clinic stock"
        subtitle="CLINICIAN · READ-ONLY"
      />
      <div className="p-6 overflow-auto flex-1 space-y-6">
        {(lowPharmacy.length > 0 || lowLab.length > 0) && (
          <section className="bg-amber-soft border border-amber/40 rounded-xl p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-ink mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Low / out of stock
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              {lowPharmacy.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Pharmacy</h3>
                  <ul className="space-y-1.5 text-sm">
                    {lowPharmacy.map(r => (
                      <li key={r.id} className="flex items-center justify-between">
                        <span className="font-medium">
                          {r.drug_name}
                          {r.strength ? ` · ${r.strength}` : ''}
                        </span>
                        <span className={cn('text-xs font-semibold', isOut(r) ? 'text-destructive' : 'text-amber-ink')}>
                          {isOut(r) ? 'OUT' : `${r.quantity_on_hand} ${r.unit}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {lowLab.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Lab</h3>
                  <ul className="space-y-1.5 text-sm">
                    {lowLab.map(r => (
                      <li key={r.id} className="flex items-center justify-between">
                        <span className="font-medium">{r.test_name}</span>
                        <span className={cn('text-xs font-semibold', isOut(r) ? 'text-destructive' : 'text-amber-ink')}>
                          {isOut(r) ? 'OUT' : `${r.quantity_on_hand} ${r.unit}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>
        )}

        <section className="grid md:grid-cols-2 gap-6">
          <StockColumn
            title="Pharmacy"
            icon={<Pill className="h-5 w-5 text-cobalt" />}
            rows={pharmacy.map(r => ({
              id: r.id,
              primary: r.drug_name,
              secondary: [r.strength, r.formulation].filter(Boolean).join(' · '),
              qty: r.quantity_on_hand,
              unit: r.unit,
              low: isLow(r),
              out: isOut(r),
            }))}
          />
          <StockColumn
            title="Lab"
            icon={<FlaskConical className="h-5 w-5 text-cobalt" />}
            rows={lab.map(r => ({
              id: r.id,
              primary: r.test_name,
              secondary: r.category.replace('_', ' '),
              qty: r.quantity_on_hand,
              unit: r.unit,
              low: isLow(r),
              out: isOut(r),
            }))}
          />
        </section>
      </div>
    </>
  )
}

function StockColumn({
  title,
  icon,
  rows,
}: {
  title: string
  icon: React.ReactNode
  rows: Array<{
    id: string
    primary: string
    secondary: string | null
    qty: number
    unit: string
    low: boolean
    out: boolean
  }>
}) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        {icon}
        <h2 className="text-base font-semibold">{title}</h2>
        <span className="ml-auto text-xs text-muted-foreground">{rows.length} items</span>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          No stock recorded yet.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map(r => (
            <li
              key={r.id}
              className={cn(
                'px-4 py-2.5 flex items-center justify-between',
                r.out && 'bg-destructive/5',
                !r.out && r.low && 'bg-amber-soft/30',
              )}
            >
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{r.primary}</div>
                {r.secondary && (
                  <div className="text-xs text-muted-foreground truncate">{r.secondary}</div>
                )}
              </div>
              <div
                className={cn(
                  'text-sm font-semibold whitespace-nowrap',
                  r.out ? 'text-destructive' : r.low ? 'text-amber-ink' : '',
                )}
              >
                {r.out ? 'OUT' : `${r.qty} ${r.unit}`}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
