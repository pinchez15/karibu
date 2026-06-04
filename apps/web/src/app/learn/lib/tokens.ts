// KaribuLearn web tokens — mirrors apps/android .../ui/learn/KaribuLearnTokens.kt
// and the design system's kl-tokens.jsx.
//
//   coral  = "KaribuLearn is teaching you"  (brand + coaching layer)
//   cobalt = "this is the EHR"              (the simulated KaribuEHR chart)
//   amber  = "AI is working"               (reserved, inside the EHR)
//   red    = "clinical critical finding"   (reserved, inside the EHR)

export const KH = {
  cobalt: '#1F36C7', cobaltDeep: '#15259A', cobaltSoft: '#E8ECFB', cobaltInk: '#0B1452',
  slate: '#28617A', slateDeep: '#1B4659', slateSoft: '#E5EEF2',
  amber: '#F5A524', amberSoft: '#FDF1D8', amberInk: '#7A4A00',
  green: '#0E8A5F', greenSoft: '#DCF1E7',
  red: '#C8362B', redSoft: '#FBE5E2',
  ink: '#0E1530', body: '#3A4256', muted: '#6B7385',
  line: '#E5E7EE', lineSoft: '#EFF1F6', bg: '#F7F8FB', surface: '#FFFFFF',
  font: "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif",
  mono: "var(--font-geist-mono), 'Geist Mono', ui-monospace, 'SF Mono', Menlo, monospace",
} as const;

// Coral learning shell — brighter/pinker than the EHR's brick caution-red so
// the two products never read as the same app.
export const KL = {
  primary: '#FB4D5B', bright: '#FF7E54', deep: '#E12E4E', soft: '#FFE7EA', wash: '#FFF5F4',
  grad: 'linear-gradient(135deg, #FF8253 0%, #FB4D5B 48%, #E5305F 100%)',
  // warm neutrals — a hair warmer than the EHR's cool greys
  ink: '#241018', body: '#52454B', muted: '#8A7B82',
  line: '#EFE6E8', lineSoft: '#F6EEF0', bg: '#FBF7F8', surface: '#FFFFFF',
  green: KH.green, greenSoft: KH.greenSoft,
  font: KH.font, mono: KH.mono,
} as const;

export type KlTokens = typeof KL;
