import { redirect } from 'next/navigation'
import { getStaff } from '@/lib/auth'
import { WebTopBar } from '@/components/web-shell'
import { cn } from '@/lib/utils'

/**
 * Pharmacy dispensing board — designed dispensing surface.
 *
 * UI scaffolding only. Hardcoded placeholder data until the prescriptions /
 * dispense_records / formulary / stock schema lands (Phase 3c in
 * docs/offline-first-refactor.md).
 *
 * Designed for one pharmacist handling ~40 patients/day across ~12 formulary
 * items. The drug-load matrix lets the pharmacist pre-pull a column at a time
 * (e.g. all paracetamol orders) rather than working order-by-order.
 */

interface FormularyItem {
  sku: string
  short: string
  stock: number
  low?: boolean
  crit?: boolean
}

const FORMULARY: FormularyItem[] = [
  { sku: 'ALU-20', short: 'AL', stock: 142 },
  { sku: 'AMX-500', short: 'AMX', stock: 38, low: true },
  { sku: 'PCM-500', short: 'PCM', stock: 1240 },
  { sku: 'ORS-1', short: 'ORS', stock: 12, crit: true },
  { sku: 'AML-5', short: 'AML', stock: 88 },
  { sku: 'LOS-50', short: 'LOS', stock: 64 },
  { sku: 'MET-500', short: 'MET', stock: 230 },
  { sku: 'ZIN-20', short: 'ZN', stock: 86 },
  { sku: 'CTX-960', short: 'CTX', stock: 156 },
  { sku: 'IBU-200', short: 'IBU', stock: 90 },
]

type RxStatus = 'New' | 'Counting' | 'Ready' | 'Dispensed'

interface OrderRow {
  id: string
  t: string
  pt: string
  ptId: string
  age: string
  from: string
  s: RxStatus
  urgent?: boolean
  counts: Partial<Record<string, number>>
}

const ORDERS: OrderRow[] = [
  { id: 'RX-4421', t: '09:54', pt: 'Nakato Sarah', ptId: 'PT-100015', age: '34F', from: 'Akello', s: 'New', counts: { 'ALU-20': 24 } },
  { id: 'RX-4420', t: '09:48', pt: 'Mukasa David', ptId: 'PT-100021', age: '52M', from: 'Akello', s: 'New', urgent: true, counts: { 'AML-5': 30, 'LOS-50': 30 } },
  { id: 'RX-4419', t: '09:31', pt: 'Aciro Joy', ptId: 'PT-100012', age: '6F', from: 'Lwanga', s: 'Counting', counts: { 'PCM-500': 8, 'ORS-1': 6 } },
  { id: 'RX-4418', t: '09:14', pt: 'Tumusiime Paul', ptId: 'PT-100009', age: '38M', from: 'Akello', s: 'Ready', counts: { 'AMX-500': 21 } },
  { id: 'RX-4417', t: '08:52', pt: 'Kato Daniel', ptId: 'PT-100007', age: '63M', from: 'Lwanga', s: 'Dispensed', counts: { 'MET-500': 60 } },
  { id: 'RX-4416', t: '08:31', pt: 'Namusoke Grace', ptId: 'PT-100018', age: '28F', from: 'Akello', s: 'New', counts: { 'PCM-500': 10 } },
  { id: 'RX-4415', t: '08:18', pt: 'Achieng Mary', ptId: 'PT-100022', age: '41F', from: 'Akello', s: 'New', counts: { 'IBU-200': 12 } },
  { id: 'RX-4414', t: '08:02', pt: 'Wasswa Peter', ptId: 'PT-100023', age: '63M', from: 'Lwanga', s: 'Ready', counts: { 'MET-500': 60, 'AML-5': 30 } },
  { id: 'RX-4413', t: '07:48', pt: 'Auma Beatrice', ptId: 'PT-100024', age: '29F', from: 'Akello', s: 'Counting', counts: { 'CTX-960': 14 } },
  { id: 'RX-4412', t: '07:34', pt: 'Lubega John', ptId: 'PT-100025', age: '4M', from: 'Lwanga', s: 'New', counts: { 'ORS-1': 6, 'ZIN-20': 10 } },
  { id: 'RX-4411', t: '07:22', pt: 'Apio Sandra', ptId: 'PT-100026', age: '52F', from: 'Akello', s: 'New', counts: { 'PCM-500': 8 } },
  { id: 'RX-4410', t: '07:08', pt: 'Sekitto Henry', ptId: 'PT-100027', age: '47M', from: 'Lwanga', s: 'Ready', counts: { 'ALU-20': 24 } },
]

export default async function PharmacyPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')

  // Role-gate: only dispensers + admins see the pharmacy board.
  if (staff.role !== 'dispenser' && staff.role !== 'admin') {
    redirect('/dashboard')
  }

  const counts = {
    new: ORDERS.filter((o) => o.s === 'New').length,
    counting: ORDERS.filter((o) => o.s === 'Counting').length,
    ready: ORDERS.filter((o) => o.s === 'Ready').length,
    dispensed: ORDERS.filter((o) => o.s === 'Dispensed').length,
  }

  // Per-column total demand — feeds the bottom row "NEED TODAY".
  const todayDemand: Record<string, number> = {}
  for (const order of ORDERS) {
    for (const [sku, qty] of Object.entries(order.counts)) {
      if (!qty) continue
      todayDemand[sku] = (todayDemand[sku] ?? 0) + qty
    }
  }

  const gridCols = `220px 70px ${FORMULARY.map(() => '1fr').join(' ')} 90px 90px`

  return (
    <>
      <WebTopBar
        title="Dispensing board"
        subtitle="PHARMACY · 40 PATIENTS TODAY"
        actions={
          <>
            <div className="flex gap-2 mr-1">
              {[
                ['NEW', counts.new, 'text-cobalt'],
                ['COUNTING', counts.counting, 'text-amber'],
                ['READY', counts.ready, 'text-green'],
                ['DISPENSED', counts.dispensed, 'text-muted-foreground'],
              ].map(([l, v, c]) => (
                <div
                  key={l as string}
                  className="px-2.5 py-1 bg-card border border-border rounded-md flex items-baseline gap-1.5"
                >
                  <span className="kh-meta">{l}</span>
                  <span className={cn('text-sm font-bold font-mono', c as string)}>{v as number}</span>
                </div>
              ))}
            </div>
            <button className="bg-card text-body border border-border rounded-md px-3 py-2 font-medium text-[13px]">
              Stock count
            </button>
            <button className="bg-cobalt text-white rounded-md px-3.5 py-2 font-semibold text-[13px]">
              + Receive
            </button>
          </>
        }
      />

      <div className="p-5 overflow-auto flex-1 bg-background">
        <div className="bg-card border border-border rounded-xl overflow-hidden mb-4">
          <div className="px-[18px] py-3 border-b border-line-soft flex justify-between items-center">
            <div>
              <div className="text-sm font-semibold">Today's drug load</div>
              <div className="text-xs text-muted-foreground">
                Pre-pull by column. Tap a cell to mark as counted.
              </div>
            </div>
            <div className="flex gap-1">
              {['Active', 'Ready', 'All'].map((tab, i) => (
                <span
                  key={tab}
                  className={cn(
                    'text-xs font-medium px-2.5 py-1 rounded-md',
                    i === 0 ? 'bg-cobalt-soft text-cobalt' : 'text-muted-foreground',
                  )}
                >
                  {tab}
                </span>
              ))}
            </div>
          </div>

          {/* Column header */}
          <div
            className="grid kh-meta border-b border-border bg-background"
            style={{ gridTemplateColumns: gridCols }}
          >
            <div className="py-2 px-3.5">PATIENT</div>
            <div className="py-2 text-center">RX</div>
            {FORMULARY.map((d) => (
              <div
                key={d.sku}
                className={cn(
                  'py-2 text-center flex flex-col items-center gap-px border-l border-line-soft',
                  d.crit ? 'text-red' : d.low ? 'text-amber' : 'text-muted-foreground',
                )}
              >
                <span className="font-bold">{d.short}</span>
                <span className="font-mono text-[9px] opacity-80">{d.stock}</span>
              </div>
            ))}
            <div className="py-2 text-center">STATUS</div>
            <div className="py-2 text-center">ACTION</div>
          </div>

          {/* Order rows */}
          {ORDERS.map((o, ri) => {
            const dimmed = o.s === 'Dispensed'
            const last = ri === ORDERS.length - 1
            return (
              <div
                key={o.id}
                className={cn(
                  'grid text-[13px] items-center',
                  !last && 'border-b border-line-soft',
                  o.urgent && 'bg-amber-soft/40',
                  dimmed && 'opacity-55',
                )}
                style={{ gridTemplateColumns: gridCols }}
              >
                <div className="py-2.5 px-3.5">
                  <div className="font-semibold text-[13px]">{o.pt}</div>
                  <div className="text-[11px] text-muted-foreground font-mono">
                    {o.ptId} · {o.age} · {o.from}
                  </div>
                </div>
                <div className="py-2.5 font-mono text-[11px] text-cobalt font-bold text-center">
                  {o.id.replace('RX-', '')}
                </div>
                {FORMULARY.map((d) => {
                  const qty = o.counts[d.sku]
                  const picked = o.s === 'Ready' || o.s === 'Dispensed'
                  return (
                    <div
                      key={d.sku}
                      className={cn(
                        'py-2.5 text-center border-l border-line-soft',
                        qty && (picked ? 'bg-green-soft' : 'bg-cobalt-soft/70'),
                      )}
                    >
                      {qty ? (
                        <span
                          className={cn(
                            'font-mono text-[13px] font-bold',
                            picked ? 'text-green' : 'text-cobalt',
                          )}
                        >
                          {qty}
                          {picked && <span className="ml-0.5 text-[9px]">✓</span>}
                        </span>
                      ) : (
                        <span className="text-line">·</span>
                      )}
                    </div>
                  )
                })}
                <div className="py-2.5 text-center">
                  <StatusPill kind={o.s} />
                </div>
                <div className="py-2.5 text-center">
                  <ActionButton status={o.s} />
                </div>
              </div>
            )
          })}

          {/* Column totals */}
          <div
            className="grid text-xs items-center bg-background border-t border-border"
            style={{ gridTemplateColumns: gridCols }}
          >
            <div className="py-2.5 px-3.5 kh-meta font-bold">NEED TODAY</div>
            <div />
            {FORMULARY.map((d) => {
              const total = todayDemand[d.sku] || 0
              const willDeplete = total >= d.stock * 0.5
              return (
                <div key={d.sku} className="py-2.5 text-center border-l border-line-soft">
                  {total ? (
                    <span
                      className={cn(
                        'font-mono text-[13px] font-bold',
                        willDeplete ? 'text-amber' : 'text-ink',
                      )}
                    >
                      {total}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">·</span>
                  )}
                </div>
              )
            })}
            <div />
            <div />
          </div>
        </div>

        {/* Stock alerts row */}
        <div className="bg-card border border-amber/40 rounded-xl px-4 py-3 flex items-center gap-4">
          <div className="kh-meta text-amber font-bold shrink-0">
            STOCK · 2 ITEMS NEED ATTENTION
          </div>
          <div className="flex gap-3 flex-1 flex-wrap text-[13px]">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red" />
              <span className="font-semibold">ORS sachets</span>
              <span className="font-mono text-muted-foreground">12 left · 6 needed today</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber" />
              <span className="font-semibold">Amoxicillin 500</span>
              <span className="font-mono text-muted-foreground">38 left · reorder at 80</span>
            </span>
          </div>
          <button className="bg-amber text-amber-ink rounded-md px-3 py-1.5 text-xs font-bold">
            Reorder
          </button>
        </div>

        <div className="mt-6 px-1 text-xs text-muted-foreground">
          Placeholder data — pharmacy schema (prescriptions, dispense records, formulary, stock) ships in a
          follow-up.
        </div>
      </div>
    </>
  )
}

function StatusPill({ kind }: { kind: RxStatus }) {
  const palette: Record<RxStatus, string> = {
    New: 'bg-cobalt-soft text-cobalt',
    Counting: 'bg-amber-soft text-amber-ink',
    Ready: 'bg-green-soft text-green',
    Dispensed: 'bg-line-soft text-muted-foreground',
  }
  return (
    <span className={cn('inline-flex items-center px-2.5 py-[3px] rounded-full text-[11px] font-semibold', palette[kind])}>
      {kind}
    </span>
  )
}

function ActionButton({ status }: { status: RxStatus }) {
  if (status === 'Counting') {
    return (
      <button className="bg-cobalt text-white rounded-md px-2.5 py-1 text-xs font-semibold">
        Mark ready
      </button>
    )
  }
  if (status === 'New') {
    return (
      <button className="bg-transparent text-cobalt border border-cobalt/40 rounded-md px-2.5 py-1 text-xs font-semibold">
        Start
      </button>
    )
  }
  if (status === 'Ready') {
    return (
      <button className="bg-green text-white rounded-md px-2.5 py-1 text-xs font-semibold">
        Dispense
      </button>
    )
  }
  return <span className="text-[10px] text-muted-foreground font-mono">—</span>
}
