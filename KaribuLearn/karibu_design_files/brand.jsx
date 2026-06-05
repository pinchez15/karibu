// Karibu Health — brand tokens + brand sheet artboard

const KH = {
  // Cobalt anchor (sampled from app icon)
  cobalt: '#1F36C7',
  cobaltDeep: '#15259A',
  cobaltSoft: '#E8ECFB',
  cobaltInk: '#0B1452',

  // Slate (from wordmark) — secondary chrome / text
  slate: '#28617A',
  slateDeep: '#1B4659',
  slateSoft: '#E5EEF2',

  // Warm signal — amber (urgency, AI moments)
  amber: '#F5A524',
  amberSoft: '#FDF1D8',
  amberInk: '#7A4A00',

  // Functional
  green: '#0E8A5F',
  greenSoft: '#DCF1E7',
  red: '#C8362B',
  redSoft: '#FBE5E2',

  // Neutrals (cool-warm bridge)
  ink: '#0E1530',
  body: '#3A4256',
  muted: '#6B7385',
  line: '#E5E7EE',
  lineSoft: '#EFF1F6',
  bg: '#F7F8FB',
  surface: '#FFFFFF',

  // Android dark (high-contrast outdoor / low-power)
  darkBg: '#0A0F26',
  darkSurface: '#121935',
  darkSurfaceHi: '#1A2347',
  darkLine: '#243066',
  darkInk: '#F5F7FF',
  darkBody: '#B8C0DA',
  darkMuted: '#7A85A8',
  darkAmber: '#FFC257',

  // Type
  font: "'Inter', system-ui, -apple-system, sans-serif",
  mono: "'Geist Mono', ui-monospace, 'SF Mono', Menlo, monospace",
};

// Logo mark: cobalt rounded square with k+ in white (svg recreation, original layout).
function KaribuMark({ size = 40, radius, color = KH.cobalt, fg = '#FFFFFF', style }) {
  const r = radius ?? Math.round(size * 0.22);
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={style} aria-label="Karibu Health">
      <rect x="0" y="0" width="100" height="100" rx={r} fill={color} />
      {/* k */}
      <rect x="22" y="22" width="11" height="56" rx="2" fill={fg} />
      <path d="M33 50 L55 28 L68 28 L46 50 L68 78 L55 78 L33 56 Z" fill={fg} />
      {/* + (small, top-right) */}
      <rect x="68" y="18" width="8" height="22" rx="1.5" fill={fg} />
      <rect x="61" y="25" width="22" height="8" rx="1.5" fill={fg} />
    </svg>
  );
}

function KaribuWordmark({ height = 28, color = KH.slate }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'baseline', gap: 0,
      fontFamily: KH.font, fontWeight: 700, fontSize: height,
      letterSpacing: '-0.025em', color, lineHeight: 1,
    }}>
      <span>Karibu</span>
      <span style={{ fontWeight: 400, opacity: 0.75 }}>.health</span>
    </div>
  );
}

function KaribuLockup({ size = 36, color = KH.cobalt, textColor = KH.slate }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <KaribuMark size={size} color={color} />
      <KaribuWordmark height={Math.round(size * 0.7)} color={textColor} />
    </div>
  );
}

// Brand sheet — type, color, components reference
function BrandSheet() {
  const Swatch = ({ name, hex, fg = '#fff', sub }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{
        height: 76, borderRadius: 10, background: hex,
        display: 'flex', alignItems: 'flex-end', padding: 10,
        color: fg, fontFamily: KH.mono, fontSize: 11, fontWeight: 500,
        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.04)',
      }}>{hex.toUpperCase()}</div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: KH.ink, fontFamily: KH.font }}>{name}</div>
        {sub && <div style={{ fontSize: 11, color: KH.muted, fontFamily: KH.font }}>{sub}</div>}
      </div>
    </div>
  );

  const TypeRow = ({ size, weight, label, sample, mono }) => (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 24, padding: '14px 0',
      borderTop: `1px solid ${KH.lineSoft}`,
    }}>
      <div style={{
        width: 110, fontFamily: KH.mono, fontSize: 11, color: KH.muted,
        flexShrink: 0,
      }}>{label}</div>
      <div style={{
        fontFamily: mono ? KH.mono : KH.font, fontSize: size, fontWeight: weight,
        color: KH.ink, letterSpacing: size > 28 ? '-0.02em' : 0, lineHeight: 1.1,
      }}>{sample}</div>
    </div>
  );

  return (
    <div style={{
      width: 1200, padding: 48, background: KH.surface,
      fontFamily: KH.font, color: KH.ink,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 36 }}>
        <div>
          <div style={{ fontFamily: KH.mono, fontSize: 11, color: KH.muted, letterSpacing: '0.08em', marginBottom: 8 }}>
            BRAND · v1
          </div>
          <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: '-0.025em' }}>
            A clinical system, warmly named.
          </div>
          <div style={{ fontSize: 16, color: KH.body, marginTop: 8, maxWidth: 720 }}>
            Cobalt anchors trust and energy. Slate carries the type. Amber is reserved — it only appears for
            urgency and AI moments. Calm, precise, Stripe-for-healthcare.
          </div>
        </div>
        <KaribuLockup size={56} />
      </div>

      {/* Logo system */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16, marginBottom: 40 }}>
        <div style={{ background: KH.bg, borderRadius: 12, padding: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 140 }}>
          <KaribuMark size={84} />
        </div>
        <div style={{ background: KH.cobalt, borderRadius: 12, padding: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 140 }}>
          <KaribuMark size={84} color="#fff" fg={KH.cobalt} />
        </div>
        <div style={{ background: KH.surface, border: `1px solid ${KH.line}`, borderRadius: 12, padding: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 140 }}>
          <KaribuLockup size={48} />
        </div>
        <div style={{ background: KH.cobaltInk, borderRadius: 12, padding: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 140 }}>
          <KaribuLockup size={48} color="#fff" textColor="#fff" />
        </div>
      </div>

      {/* Color */}
      <div style={{ marginBottom: 14, fontSize: 13, fontWeight: 600, color: KH.muted, fontFamily: KH.mono, letterSpacing: '0.06em' }}>
        01 — COLOR
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 14, marginBottom: 14 }}>
        <Swatch name="Cobalt" hex={KH.cobalt} sub="Primary · brand" />
        <Swatch name="Cobalt Deep" hex={KH.cobaltDeep} sub="Pressed · headers" />
        <Swatch name="Slate" hex={KH.slate} sub="Body · type" />
        <Swatch name="Amber" hex={KH.amber} fg="#3a2400" sub="Signal · AI" />
        <Swatch name="Green" hex={KH.green} sub="Success · dispense" />
        <Swatch name="Red" hex={KH.red} sub="Critical only" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 14, marginBottom: 36 }}>
        <Swatch name="Cobalt Soft" hex={KH.cobaltSoft} fg={KH.cobalt} sub="Backgrounds" />
        <Swatch name="Slate Soft" hex={KH.slateSoft} fg={KH.slate} sub="Backgrounds" />
        <Swatch name="Amber Soft" hex={KH.amberSoft} fg={KH.amberInk} sub="AI banners" />
        <Swatch name="Surface" hex={KH.bg} fg={KH.ink} sub="Page" />
        <Swatch name="Line" hex={KH.line} fg={KH.body} sub="Dividers" />
        <Swatch name="Ink" hex={KH.ink} sub="Headings" />
      </div>

      {/* Type */}
      <div style={{ marginBottom: 14, fontSize: 13, fontWeight: 600, color: KH.muted, fontFamily: KH.mono, letterSpacing: '0.06em' }}>
        02 — TYPE
      </div>
      <div style={{ borderBottom: `1px solid ${KH.lineSoft}`, marginBottom: 36 }}>
        <TypeRow label="Display / 48" size={48} weight={600} sample="40 patients, 6 waiting." />
        <TypeRow label="Title / 28" size={28} weight={600} sample="Today at Susunga HC III" />
        <TypeRow label="Heading / 20" size={20} weight={600} sample="Vitals captured at 09:42" />
        <TypeRow label="Body / 16" size={16} weight={400} sample="The clinician's note saves regardless of AI. Optimistic, never blocking." />
        <TypeRow label="Label / 13" size={13} weight={500} sample="CHIEF COMPLAINT" />
        <TypeRow label="Mono / 13" size={13} weight={500} sample="PT-100015 · 2026-05-07 · 09:42" mono />
      </div>

      {/* Voice */}
      <div style={{ marginBottom: 14, fontSize: 13, fontWeight: 600, color: KH.muted, fontFamily: KH.mono, letterSpacing: '0.06em' }}>
        03 — VOICE
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 36 }}>
        {[
          ['Calm', 'Never alarming. Status, not warnings.', '"3 visits waiting to sync."'],
          ['Precise', 'Numbers, units, timestamps.', '"BP 128/82 · 09:42"'],
          ['Spare', 'No filler copy. No emoji.', '"Save and continue"'],
        ].map(([h, sub, ex]) => (
          <div key={h} style={{ border: `1px solid ${KH.line}`, borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{h}</div>
            <div style={{ fontSize: 13, color: KH.muted, marginTop: 4 }}>{sub}</div>
            <div style={{ fontSize: 14, color: KH.cobalt, marginTop: 12, fontFamily: KH.mono }}>{ex}</div>
          </div>
        ))}
      </div>

      {/* Components preview */}
      <div style={{ marginBottom: 14, fontSize: 13, fontWeight: 600, color: KH.muted, fontFamily: KH.mono, letterSpacing: '0.06em' }}>
        04 — CORE COMPONENTS
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <button style={{ background: KH.cobalt, color: '#fff', border: 0, borderRadius: 10, padding: '12px 18px', fontWeight: 600, fontSize: 14, fontFamily: KH.font, cursor: 'pointer' }}>Save and continue</button>
        <button style={{ background: KH.surface, color: KH.ink, border: `1px solid ${KH.line}`, borderRadius: 10, padding: '12px 18px', fontWeight: 600, fontSize: 14, fontFamily: KH.font, cursor: 'pointer' }}>Skip</button>
        <button style={{ background: KH.amber, color: KH.amberInk, border: 0, borderRadius: 10, padding: '12px 18px', fontWeight: 600, fontSize: 14, fontFamily: KH.font, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: KH.amberInk }}/>
          Structure with AI
        </button>
        <span style={{ background: KH.cobaltSoft, color: KH.cobalt, padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600 }}>Pending</span>
        <span style={{ background: KH.amberSoft, color: KH.amberInk, padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600 }}>AI structuring</span>
        <span style={{ background: KH.greenSoft, color: KH.green, padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600 }}>Sent</span>
        <span style={{ background: KH.slateSoft, color: KH.slate, padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600 }}>3 to sync</span>
      </div>
    </div>
  );
}

Object.assign(window, { KH, KaribuMark, KaribuWordmark, KaribuLockup, BrandSheet });
