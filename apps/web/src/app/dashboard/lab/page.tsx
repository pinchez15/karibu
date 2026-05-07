import { redirect } from 'next/navigation'
import { getStaff } from '@/lib/auth'
import { WebTopBar } from '@/components/web-shell'
import { cn } from '@/lib/utils'

/**
 * Lab board — designed inline result-entry surface.
 *
 * UI scaffolding only. Hardcoded placeholder data until the lab_orders /
 * lab_results schema lands (Phase 3b in docs/offline-first-refactor.md).
 *
 * Designed for one lab tech handling ~40 patients/day across ~12 test types.
 * Result entry happens INLINE in the row — no row-click, no modal. One tap
 * marks status forward.
 */

type LabStatus = 'New' | 'Running' | 'Result' | 'Sent'

interface LabOrder {
  id: string
  t: string
  test: string
  pt: string
  ptId: string
  age: string
  from: string
  s: LabStatus
  result?: string
  flag?: 'low' | 'high'
  urgent?: boolean
}

const ORDERS: LabOrder[] = [
  { id: 'LAB-2271', t: '09:51', test: 'Malaria RDT', pt: 'Nakato Sarah', ptId: 'PT-100015', age: '34F', from: 'Akello', s: 'New' },
  { id: 'LAB-2270', t: '09:46', test: 'CBC', pt: 'Mukasa David', ptId: 'PT-100021', age: '52M', from: 'Akello', s: 'Running', urgent: true },
  { id: 'LAB-2269', t: '09:33', test: 'RBS', pt: 'Wasswa Peter', ptId: 'PT-100023', age: '63M', from: 'Lwanga', s: 'Running' },
  { id: 'LAB-2268', t: '09:21', test: 'Urinalysis', pt: 'Achieng Mary', ptId: 'PT-100022', age: '41F', from: 'Akello', s: 'Result', result: 'Leuk +' },
  { id: 'LAB-2267', t: '08:54', test: 'HIV Rapid', pt: 'Tumusiime Paul', ptId: 'PT-100009', age: '38M', from: 'Lwanga', s: 'Sent', result: 'Non-reactive' },
  { id: 'LAB-2266', t: '08:31', test: 'HB', pt: 'Auma Beatrice', ptId: 'PT-100024', age: '29F', from: 'Akello', s: 'Result', result: '9.4 g/dL', flag: 'low' },
  { id: 'LAB-2265', t: '08:18', test: 'Malaria RDT', pt: 'Lubega John', ptId: 'PT-100025', age: '4M', from: 'Lwanga', s: 'New' },
  { id: 'LAB-2264', t: '08:02', test: 'Stool', pt: 'Apio Sandra', ptId: 'PT-100026', age: '52F', from: 'Akello', s: 'Running' },
  { id: 'LAB-2263', t: '07:48', test: 'Pregnancy', pt: 'Namusoke G.', ptId: 'PT-100018', age: '28F', from: 'Akello', s: 'Sent', result: 'Positive' },
  { id: 'LAB-2262', t: '07:34', test: 'Malaria RDT', pt: 'Sekitto Henry', ptId: 'PT-100027', age: '47M', from: 'Lwanga', s: 'Sent', result: 'Negative' },
]

const QUICK_RESULTS: Record<string, string[]> = {
  'Malaria RDT': ['Negative', 'P. falciparum +', 'P. vivax +', 'Invalid'],
  'HIV Rapid': ['Non-reactive', 'Reactive', 'Indeterminate'],
  Pregnancy: ['Negative', 'Positive'],
  Urinalysis: ['Normal', 'Leuk +', 'Nitr +', 'Both'],
  RBS: ['mg/dL'],
  CBC: ['Open panel'],
  HB: ['g/dL'],
  Syphilis: ['Non-reactive', 'Reactive'],
  Stool: ['Normal', 'Ova/parasite', 'Occult blood'],
  Typhoid: ['Negative', 'Positive'],
}

export default async function LabPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')

  if (staff.role !== 'lab_tech' && staff.role !== 'admin') {
    redirect('/dashboard')
  }

  const counts = {
    new: ORDERS.filter((o) => o.s === 'New').length,
    running: ORDERS.filter((o) => o.s === 'Running').length,
    result: ORDERS.filter((o) => o.s === 'Result').length,
    sent: ORDERS.filter((o) => o.s === 'Sent').length,
  }
  const abnormal = ORDERS.filter((o) => o.flag === 'low' || o.flag === 'high').length

  return (
    <>
      <WebTopBar
        title="Lab board"
        subtitle="LABORATORY · 40 PATIENTS TODAY"
        actions={
          <>
            <div className="flex gap-2 mr-1">
              {[
                ['NEW', counts.new, 'text-cobalt'],
                ['RUNNING', counts.running, 'text-amber'],
                ['RESULT', counts.result, 'text-green'],
                ['SENT', counts.sent, 'text-muted-foreground'],
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
            {abnormal > 0 && (
              <div className="px-2.5 py-1 bg-amber-soft border border-amber/60 rounded-md flex items-baseline gap-1.5">
                <span className="kh-meta text-amber font-bold">ABNORMAL</span>
                <span className="text-sm font-bold font-mono text-amber">{abnormal}</span>
              </div>
            )}
            <button className="bg-cobalt text-white rounded-md px-3.5 py-2 font-semibold text-[13px]">
              + Walk-in
            </button>
          </>
        }
      />

      <div className="p-5 overflow-auto flex-1 bg-background">
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-[18px] py-3 border-b border-line-soft flex justify-between items-center">
            <div>
              <div className="text-sm font-semibold">Today's queue</div>
              <div className="text-xs text-muted-foreground">
                Tap a result chip to record. Status auto-advances.
              </div>
            </div>
            <div className="flex gap-1">
              {['Active', 'New', 'Running', 'Result', 'All'].map((tab, i) => (
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

          {/* Header */}
          <div className="grid grid-cols-[90px_1fr_130px_1.4fr_100px_80px] kh-meta px-[18px] py-2 border-b border-border bg-background">
            <span>LAB ID</span>
            <span>PATIENT · TEST</span>
            <span>STATUS</span>
            <span>RESULT · TAP TO RECORD</span>
            <span>TIME</span>
            <span className="text-right">SEND</span>
          </div>

          {ORDERS.map((o, i) => {
            const isSent = o.s === 'Sent'
            const choices = QUICK_RESULTS[o.test] || []
            const last = i === ORDERS.length - 1
            const isAbnormal = o.flag === 'low' || o.flag === 'high'

            return (
              <div
                key={o.id}
                className={cn(
                  'grid grid-cols-[90px_1fr_130px_1.4fr_100px_80px] items-center px-[18px] py-2.5 text-[13px]',
                  !last && 'border-b border-line-soft',
                  o.urgent && 'bg-amber-soft/40',
                  isSent && 'opacity-60',
                )}
              >
                <span className="font-mono text-cobalt text-[11px] font-bold">{o.id.replace('LAB-', '')}</span>
                <div>
                  <div>
                    <span className="font-semibold">{o.pt}</span>
                    <span className="font-mono text-muted-foreground text-[11px] ml-2">
                      {o.ptId} · {o.age}
                    </span>
                  </div>
                  <div className="text-xs text-body mt-px">
                    {o.test}{' '}
                    <span className="text-muted-foreground text-[11px]">· {o.from}</span>
                  </div>
                </div>
                <div>
                  <StatusPill kind={o.s} />
                </div>
                <div className="flex gap-1 flex-wrap">
                  {o.result ? (
                    <span
                      className={cn(
                        'text-[13px] font-bold px-2.5 py-1 rounded-md border border-border bg-background',
                        isAbnormal && 'text-amber',
                        o.result.match(/\d/) && 'font-mono',
                      )}
                    >
                      {o.result}
                      {o.flag === 'low' && <span className="ml-1 text-amber text-[11px]">↓</span>}
                      {o.flag === 'high' && <span className="ml-1 text-amber text-[11px]">↑</span>}
                    </span>
                  ) : (
                    choices.slice(0, 4).map((opt) => (
                      <button
                        key={opt}
                        className="text-xs font-semibold px-2.5 py-1 rounded-md border border-border bg-card text-body hover:bg-cobalt-soft hover:text-cobalt hover:border-cobalt/40 transition-colors"
                      >
                        {opt}
                      </button>
                    ))
                  )}
                </div>
                <span className="font-mono text-[11px] text-muted-foreground">{o.t}</span>
                <div className="text-right">
                  {o.s === 'Result' && (
                    <button className="bg-green text-white rounded-md px-2.5 py-1 text-xs font-bold">
                      Send
                    </button>
                  )}
                  {o.s === 'Sent' && <span className="text-[10px] text-green font-mono">✓</span>}
                  {(o.s === 'New' || o.s === 'Running') && (
                    <span className="text-[10px] text-muted-foreground font-mono">—</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Abnormal callout */}
        {abnormal > 0 && (
          <div className="mt-4 bg-card border border-amber/40 rounded-xl px-4 py-3 flex items-center gap-4">
            <div className="kh-meta text-amber font-bold shrink-0">
              {abnormal} ABNORMAL · CLINICIAN NOTIFIED
            </div>
            <div className="flex gap-4 flex-1 text-[13px]">
              {ORDERS.filter((o) => o.flag).map((o) => (
                <span key={o.id}>
                  <b>{o.pt}</b> · {o.test}{' '}
                  <span className="text-amber font-bold font-mono">
                    {o.result}
                    {o.flag === 'low' && ' ↓'}
                    {o.flag === 'high' && ' ↑'}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 px-1 text-xs text-muted-foreground">
          Placeholder data — lab schema (lab_orders, lab_results) ships in a follow-up.
        </div>
      </div>
    </>
  )
}

function StatusPill({ kind }: { kind: LabStatus }) {
  const palette: Record<LabStatus, string> = {
    New: 'bg-cobalt-soft text-cobalt',
    Running: 'bg-amber-soft text-amber-ink',
    Result: 'bg-green-soft text-green',
    Sent: 'bg-line-soft text-muted-foreground',
  }
  return (
    <span className={cn('inline-flex items-center px-2.5 py-[3px] rounded-full text-[11px] font-semibold', palette[kind])}>
      {kind}
    </span>
  )
}
