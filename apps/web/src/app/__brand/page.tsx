import { notFound } from 'next/navigation'
import { KaribuLockup, KaribuMark } from '@/components/karibu-mark'

/**
 * Karibu brand sheet — design reference for the team.
 * Mirrors the BrandSheet artboard in karibu_design_files/brand.jsx.
 * Dev-only: 404s in production builds.
 */
export default function BrandSheetPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound()
  }

  const swatches: Array<{ name: string; hex: string; cls: string; sub: string; ink?: boolean }> = [
    { name: 'Cobalt', hex: '#1F36C7', cls: 'bg-cobalt', sub: 'Primary · brand' },
    { name: 'Cobalt Deep', hex: '#15259A', cls: 'bg-cobalt-deep', sub: 'Pressed · headers' },
    { name: 'Slate', hex: '#28617A', cls: 'bg-slate', sub: 'Body · type' },
    { name: 'Amber', hex: '#F5A524', cls: 'bg-amber', sub: 'Signal · AI', ink: true },
    { name: 'Green', hex: '#0E8A5F', cls: 'bg-green', sub: 'Success · dispense' },
    { name: 'Red', hex: '#C8362B', cls: 'bg-red', sub: 'Critical only' },
  ]
  const softs: Array<{ name: string; hex: string; cls: string; sub: string; textCls: string }> = [
    { name: 'Cobalt Soft', hex: '#E8ECFB', cls: 'bg-cobalt-soft', sub: 'Backgrounds', textCls: 'text-cobalt' },
    { name: 'Slate Soft', hex: '#E5EEF2', cls: 'bg-slate-soft', sub: 'Backgrounds', textCls: 'text-slate' },
    { name: 'Amber Soft', hex: '#FDF1D8', cls: 'bg-amber-soft', sub: 'AI banners', textCls: 'text-amber-ink' },
    { name: 'Surface', hex: '#F7F8FB', cls: 'bg-background', sub: 'Page', textCls: 'text-ink' },
    { name: 'Line', hex: '#E5E7EE', cls: 'bg-line', sub: 'Dividers', textCls: 'text-body' },
    { name: 'Ink', hex: '#0E1530', cls: 'bg-ink', sub: 'Headings', textCls: 'text-white' },
  ]

  const typeRows: Array<{ label: string; cls: string; sample: string; mono?: boolean }> = [
    { label: 'Display / 48', cls: 'text-5xl font-semibold tracking-tightest text-ink leading-[1.1]', sample: '40 patients, 6 waiting.' },
    { label: 'Title / 28', cls: 'text-[28px] font-semibold tracking-tightest text-ink leading-[1.2]', sample: 'Today at Susunga HC III' },
    { label: 'Heading / 20', cls: 'text-xl font-semibold text-ink leading-[1.3]', sample: 'Vitals captured at 09:42' },
    { label: 'Body / 16', cls: 'text-base font-normal text-body leading-relaxed', sample: "The clinician's note saves regardless of AI. Optimistic, never blocking." },
    { label: 'Label / 13', cls: 'text-[13px] font-medium kh-meta', sample: 'CHIEF COMPLAINT' },
    { label: 'Mono / 13', cls: 'text-[13px] font-medium font-mono text-ink', sample: 'PT-100015 · 2026-05-07 · 09:42', mono: true },
  ]

  return (
    <div className="min-h-screen bg-white px-12 py-12 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between mb-9">
        <div>
          <div className="kh-meta mb-2">BRAND · v1</div>
          <h1 className="text-[40px] font-semibold tracking-tightest leading-tight">
            A clinical system, warmly named.
          </h1>
          <p className="text-base text-body mt-2 max-w-[720px]">
            Cobalt anchors trust and energy. Slate carries the type. Amber is reserved — it only appears for
            urgency and AI moments. Calm, precise, Stripe-for-healthcare.
          </p>
        </div>
        <KaribuLockup size={56} />
      </div>

      {/* Logo system */}
      <div className="grid grid-cols-4 gap-4 mb-10">
        <div className="bg-background rounded-xl flex items-center justify-center h-[140px]">
          <KaribuMark size={84} />
        </div>
        <div className="bg-cobalt rounded-xl flex items-center justify-center h-[140px]">
          <KaribuMark size={84} color="#fff" fg="rgb(31 54 199)" />
        </div>
        <div className="bg-white border border-line rounded-xl flex items-center justify-center h-[140px]">
          <KaribuLockup size={48} />
        </div>
        <div className="bg-cobalt-ink rounded-xl flex items-center justify-center h-[140px]">
          <KaribuLockup size={48} variant="onDark" />
        </div>
      </div>

      {/* Color */}
      <div className="kh-meta mb-3">01 — COLOR</div>
      <div className="grid grid-cols-6 gap-3.5 mb-3.5">
        {swatches.map((s) => (
          <div key={s.name} className="flex flex-col gap-1.5">
            <div className={`${s.cls} h-[76px] rounded-[10px] flex items-end p-2.5 ${s.ink ? 'text-amber-ink' : 'text-white'} font-mono text-[11px] font-medium`}>
              {s.hex.toUpperCase()}
            </div>
            <div>
              <div className="text-xs font-semibold text-ink">{s.name}</div>
              <div className="text-[11px] text-muted-foreground">{s.sub}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-6 gap-3.5 mb-9">
        {softs.map((s) => (
          <div key={s.name} className="flex flex-col gap-1.5">
            <div className={`${s.cls} ${s.textCls} h-[76px] rounded-[10px] flex items-end p-2.5 font-mono text-[11px] font-medium`}>
              {s.hex.toUpperCase()}
            </div>
            <div>
              <div className="text-xs font-semibold text-ink">{s.name}</div>
              <div className="text-[11px] text-muted-foreground">{s.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Type */}
      <div className="kh-meta mb-3">02 — TYPE</div>
      <div className="border-b border-line-soft mb-9">
        {typeRows.map((row) => (
          <div key={row.label} className="flex items-baseline gap-6 py-3.5 border-t border-line-soft">
            <div className="w-[110px] kh-meta shrink-0">{row.label}</div>
            <div className={row.cls}>{row.sample}</div>
          </div>
        ))}
      </div>

      {/* Voice */}
      <div className="kh-meta mb-3">03 — VOICE</div>
      <div className="grid grid-cols-3 gap-4 mb-9">
        {[
          ['Calm', 'Never alarming. Status, not warnings.', '"3 visits waiting to sync."'],
          ['Precise', 'Numbers, units, timestamps.', '"BP 128/82 · 09:42"'],
          ['Spare', 'No filler copy. No emoji.', '"Save and continue"'],
        ].map(([h, sub, ex]) => (
          <div key={h} className="border border-line rounded-xl p-5">
            <div className="text-lg font-semibold">{h}</div>
            <div className="text-[13px] text-muted-foreground mt-1">{sub}</div>
            <div className="text-sm text-cobalt mt-3 font-mono">{ex}</div>
          </div>
        ))}
      </div>

      {/* Components preview */}
      <div className="kh-meta mb-3">04 — CORE COMPONENTS</div>
      <div className="flex gap-3 flex-wrap mb-4">
        <button className="bg-cobalt text-white border-0 rounded-[10px] px-[18px] py-3 font-semibold text-sm">Save and continue</button>
        <button className="bg-white text-ink border border-line rounded-[10px] px-[18px] py-3 font-semibold text-sm">Skip</button>
        <button className="bg-amber text-amber-ink border-0 rounded-[10px] px-[18px] py-3 font-semibold text-sm inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-ink" />
          Structure with AI
        </button>
        <span className="chip chip-info">Pending</span>
        <span className="chip chip-warning">AI structuring</span>
        <span className="chip chip-success">Sent</span>
        <span className="chip" style={{ background: 'rgb(var(--kh-slate-soft))', color: 'rgb(var(--kh-slate))' }}>3 to sync</span>
      </div>
    </div>
  )
}
