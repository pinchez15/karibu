// Karibu Health — landing brand tokens + marks.
// Cobalt anchors the umbrella + Karibu EHR. Coral is Karibu Learn.
// Amber stays reserved (AI). Inter + Geist Mono per the design system.

const KH = {
  cobalt: '#1F36C7', cobaltDeep: '#15259A', cobaltSoft: '#E8ECFB', cobaltInk: '#0B1452',
  slate: '#28617A', slateDeep: '#1B4659', slateSoft: '#E5EEF2',
  amber: '#F5A524', amberSoft: '#FDF1D8', amberInk: '#7A4A00',
  green: '#0E8A5F', greenSoft: '#DCF1E7',
  red: '#C8362B', redSoft: '#FBE5E2',
  // Karibu Learn coral (from the apps)
  coral: '#FB4D5B', coralDeep: '#E12E4E', coralBright: '#FF7E54', coralSoft: '#FFE7EA', coralWash: '#FFF5F4',
  coralGrad: 'linear-gradient(135deg, #FF8253 0%, #FB4D5B 48%, #E5305F 100%)',
  // neutrals
  ink: '#0E1530', body: '#3A4256', muted: '#6B7385',
  line: '#E5E7EE', lineSoft: '#EFF1F6', bg: '#F7F8FB', surface: '#FFFFFF',
  // a near-white page that reads a touch cooler/more premium than #fff
  page: '#FBFCFE',
  font: "'Inter', system-ui, -apple-system, sans-serif",
  mono: "'Geist Mono', ui-monospace, 'SF Mono', Menlo, monospace",
};

// The k+ mark — exact geometry from the design system, recolourable.
function KMark({ size = 40, color = KH.cobalt, fg = '#FFFFFF', radius, style }) {
  const r = radius ?? Math.round(size * 0.22);
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={style} aria-hidden="true">
      <rect x="0" y="0" width="100" height="100" rx={r} fill={color} />
      <rect x="22" y="22" width="11" height="56" rx="2" fill={fg} />
      <path d="M33 50 L55 28 L68 28 L46 50 L68 78 L55 78 L33 56 Z" fill={fg} />
      <rect x="68" y="18" width="8" height="22" rx="1.5" fill={fg} />
      <rect x="61" y="25" width="22" height="8" rx="1.5" fill={fg} />
    </svg>
  );
}

// Wordmark: "Karibu" + light suffix.
function KWordmark({ height = 22, color = KH.ink, suffix = '.health', suffixColor, weight = 700 }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'baseline', fontFamily: KH.font, fontWeight: weight,
      fontSize: height, letterSpacing: '-0.03em', color, lineHeight: 1, whiteSpace: 'nowrap',
    }}>
      <span>Karibu</span>
      <span style={{ fontWeight: 500, color: suffixColor || 'currentColor', opacity: suffixColor ? 1 : 0.6 }}>{suffix}</span>
    </span>
  );
}

function KLockup({ size = 32, markColor = KH.cobalt, markFg, textColor = KH.ink, suffix = '.health', suffixColor, gap = 10 }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap }}>
      <KMark size={size} color={markColor} fg={markFg || '#FFFFFF'} />
      <KWordmark height={Math.round(size * 0.62)} color={textColor} suffix={suffix} suffixColor={suffixColor} />
    </span>
  );
}

Object.assign(window, { KH, KMark, KWordmark, KLockup });
