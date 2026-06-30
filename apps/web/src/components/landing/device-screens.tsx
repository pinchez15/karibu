import { KMark } from './brand'

/** Drop PNG/WebP screenshots in `public/landing/` to replace HTML replicas. */
export const LANDING_SCREENSHOTS = {
  android: '/landing/ehr-android.png',
  web: '/landing/ehr-web-dashboard.png',
} as const

/** Android patient chart (matches ChartFragment / visit detail patterns). */
export function AndroidPatientScreen({ scale = 1 }: { scale?: number }) {
  const s = scale
  return (
    <div className="flex h-full flex-col bg-[rgb(var(--kh-bg))] text-left" style={{ fontSize: 11 * s }}>
      <div
        className="flex items-center gap-1.5 bg-cobalt-ink px-2 py-1.5 text-white"
        style={{ padding: `${6 * s}px ${8 * s}px` }}
      >
        <KMark size={12 * s} color="#fff" fg="rgb(var(--kh-cobalt))" />
        <span className="font-bold" style={{ fontSize: 10 * s }}>
          Karibu<span className="font-medium opacity-70">.health</span>
        </span>
      </div>
      <div
        className="flex items-center gap-1.5 border-b border-line bg-white"
        style={{ padding: `${5 * s}px ${8 * s}px` }}
      >
        <div
          className="flex items-center justify-center rounded-md bg-cobalt-soft font-bold text-cobalt"
          style={{ width: 22 * s, height: 22 * s, fontSize: 8 * s }}
        >
          NS
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-ink" style={{ fontSize: 10 * s }}>
            Nakato Sarah <span className="font-normal text-slate">34F</span>
          </div>
          <div className="font-mono text-slate" style={{ fontSize: 7 * s }}>
            PT-100015
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-hidden" style={{ padding: `${6 * s}px ${8 * s}px` }}>
        <div className="font-mono font-semibold uppercase tracking-wide text-slate" style={{ fontSize: 7 * s, marginBottom: 4 * s }}>
          Vitals
        </div>
        <div className="grid grid-cols-3 gap-1" style={{ marginBottom: 6 * s }}>
          {[
            ['T', '38.4°C'],
            ['BP', '128/82'],
            ['SpO₂', '98%'],
          ].map(([k, v]) => (
            <div key={k} className="rounded border border-line bg-white text-center" style={{ padding: `${3 * s}px` }}>
              <div className="font-mono text-slate" style={{ fontSize: 6 * s }}>{k}</div>
              <div className="font-semibold text-ink" style={{ fontSize: 8 * s }}>{v}</div>
            </div>
          ))}
        </div>
        <div className="font-mono font-semibold uppercase tracking-wide text-slate" style={{ fontSize: 7 * s, marginBottom: 4 * s }}>
          Timeline
        </div>
        {[
          ['Today', 'OPD · Fever ×3d'],
          ['07 May', 'Malaria · B54'],
        ].map(([d, t]) => (
          <div key={d} className="flex gap-1 border-b border-line-soft" style={{ padding: `${3 * s}px 0` }}>
            <span className="shrink-0 font-mono font-semibold text-slate" style={{ fontSize: 7 * s, width: 28 * s }}>{d}</span>
            <span className="truncate text-ink" style={{ fontSize: 8 * s }}>{t}</span>
          </div>
        ))}
        <div
          className="mt-2 rounded bg-cobalt text-center font-semibold text-white"
          style={{ padding: `${4 * s}px`, fontSize: 8 * s }}
        >
          Dictate note
        </div>
      </div>
    </div>
  )
}

/** Web dashboard (sidebar + review queue — matches apps/web dashboard shell). */
export function WebDashboardScreen({ scale = 1 }: { scale?: number }) {
  const s = scale
  return (
    <div className="flex h-full bg-[rgb(var(--kh-bg))] text-left">
      <div className="shrink-0 bg-cobalt-ink" style={{ width: 36 * s }}>
        <div style={{ padding: `${8 * s}px ${6 * s}px` }}>
          <KMark size={14 * s} color="#fff" fg="rgb(var(--kh-cobalt))" />
        </div>
        {['Patients', 'Review', 'Pharmacy', 'Reports'].map((item, i) => (
          <div
            key={item}
            className={i === 1 ? 'bg-white/15 text-white' : 'text-white/55'}
            style={{ padding: `${4 * s}px ${8 * s}px`, fontSize: 7 * s, fontWeight: i === 1 ? 600 : 500 }}
          >
            {item}
          </div>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className="border-b border-line bg-white font-semibold text-ink"
          style={{ padding: `${6 * s}px ${8 * s}px`, fontSize: 9 * s }}
        >
          Review notes
        </div>
        <div style={{ padding: `${6 * s}px` }}>
          {[
            ['Nakato Sarah', 'Draft · malaria', 'amber'],
            ['Okello James', 'Ready to sign', 'green'],
            ['Auma Beatrice', 'Needs vitals', 'slate'],
          ].map(([name, status, tone]) => (
            <div
              key={name as string}
              className="mb-1 rounded border border-line bg-white"
              style={{ padding: `${4 * s}px ${6 * s}px` }}
            >
              <div className="font-semibold text-ink" style={{ fontSize: 8 * s }}>{name as string}</div>
              <div
                className={
                  tone === 'amber'
                    ? 'text-amber-ink'
                    : tone === 'green'
                      ? 'text-green'
                      : 'text-muted'
                }
                style={{ fontSize: 7 * s }}
              >
                {status as string}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Tablet queue / check-in view. */
export function WebQueueScreen({ scale = 1 }: { scale?: number }) {
  const s = scale
  return (
    <div className="flex h-full flex-col bg-[rgb(var(--kh-bg))] text-left">
      <div
        className="flex items-center gap-1.5 bg-cobalt-ink text-white"
        style={{ padding: `${6 * s}px ${8 * s}px` }}
      >
        <KMark size={12 * s} color="#fff" fg="rgb(var(--kh-cobalt))" />
        <span className="font-bold" style={{ fontSize: 9 * s }}>Karibu.health</span>
        <span className="ml-auto font-mono text-white/60" style={{ fontSize: 7 * s }}>QUEUE</span>
      </div>
      <div className="grid flex-1 grid-cols-2 gap-1" style={{ padding: `${6 * s}px` }}>
        {['Waiting', 'In consult'].map((col, ci) => (
          <div key={col} className="rounded border border-line bg-white" style={{ padding: `${4 * s}px` }}>
            <div className="font-mono font-semibold uppercase text-muted" style={{ fontSize: 6 * s, marginBottom: 4 * s }}>
              {col}
            </div>
            {(ci === 0 ? ['Nakato S.', 'Mukasa P.'] : ['Okello J.']).map((p) => (
              <div
                key={p}
                className="mb-0.5 rounded bg-cobalt-soft/60"
                style={{ padding: `${3 * s}px ${4 * s}px`, fontSize: 7 * s }}
              >
                {p}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
