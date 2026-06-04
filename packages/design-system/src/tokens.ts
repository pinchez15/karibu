export const karibuColors = {
  cobalt: '#1F36C7',
  cobaltDeep: '#15259A',
  cobaltSoft: '#E8ECFB',
  cobaltInk: '#0B1452',
  slate: '#28617A',
  slateDeep: '#1B4659',
  slateSoft: '#E5EEF2',
  amber: '#F5A524',
  amberSoft: '#FDF1D8',
  amberInk: '#7A4A00',
  green: '#0E8A5F',
  greenSoft: '#DCF1E7',
  red: '#C8362B',
  redSoft: '#FBE5E2',
  ink: '#0E1530',
  body: '#3A4256',
  muted: '#6B7385',
  line: '#E5E7EE',
  lineSoft: '#EFF1F6',
  bg: '#F7F8FB',
  surface: '#FFFFFF',
  darkBg: '#0A0F26',
  darkSurface: '#121935',
  darkSurfaceHi: '#1A2347',
  darkLine: '#243066',
  darkInk: '#F5F7FF',
  darkBody: '#B8C0DA',
  darkMuted: '#7A85A8',
  darkAmber: '#FFC257',
  darkPrimary: '#7E91FF'
} as const;

export const karibuTypography = {
  fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
  monoFamily: 'Geist Mono, ui-monospace, SF Mono, Menlo, monospace',
  display: { size: 48, lineHeight: 56, weight: 600 },
  title: { size: 28, lineHeight: 34, weight: 600 },
  heading: { size: 20, lineHeight: 26, weight: 600 },
  body: { size: 16, lineHeight: 24, weight: 400 },
  label: { size: 13, lineHeight: 18, weight: 500 },
  mono: { size: 13, lineHeight: 18, weight: 500 }
} as const;

export const karibuSpacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32
} as const;

export const karibuRadii = {
  sm: 4,
  md: 8,
  lg: 10,
  pill: 999
} as const;

export const karibuElevation = {
  none: 'none',
  card: '0 1px 2px rgba(14, 21, 48, 0.08)',
  overlay: '0 12px 32px rgba(14, 21, 48, 0.16)'
} as const;

export const karibuComponentTokens = {
  buttonHeight: 44,
  inputHeight: 44,
  iconSize: 20,
  touchTarget: 48,
  cardRadius: karibuRadii.md,
  clinicalRowMinHeight: 56
} as const;

