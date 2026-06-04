// KaribuLearn web icons — inline SVG, 24×24, currentColor, ~1.8px stroke.
// Mirrors the design system's kl-icons.jsx. `sparkle` is filled (AI marker).
import React from 'react';

export type IconName =
  | 'home' | 'cases' | 'award' | 'info' | 'bulb' | 'play' | 'check' | 'checkCircle'
  | 'target' | 'clock' | 'lock' | 'arrowRight' | 'arrowLeft' | 'calc' | 'pill' | 'flask'
  | 'chart' | 'flag' | 'minus' | 'plus' | 'sparkle' | 'stethoscope' | 'download' | 'share' | 'x';

const S = 1.8;

export function Icon({
  name, size = 18, color = 'currentColor', strokeWidth = S,
}: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  const common = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'home': return <svg {...common}><path d="M3 12l9-9 9 9M5 10v10h14V10" /></svg>;
    case 'cases': return <svg {...common}><path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" /><path d="M15 4v4h4" /><path d="M8 13h8M8 17h5" /></svg>;
    case 'award': return <svg {...common}><circle cx="12" cy="9" r="6" /><path d="M9 14.5L8 22l4-2.2L16 22l-1-7.5" /></svg>;
    case 'info': return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.5h.01" /></svg>;
    case 'bulb': return <svg {...common}><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-4 10.5c.7.8 1 1.3 1 2.5h6c0-1.2.3-1.7 1-2.5A6 6 0 0 0 12 3z" /></svg>;
    case 'play': return <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M7 4.5v15a1 1 0 0 0 1.5.87l13-7.5a1 1 0 0 0 0-1.74l-13-7.5A1 1 0 0 0 7 4.5z" /></svg>;
    case 'check': return <svg {...common} strokeWidth={2.2}><path d="M20 6L9 17l-5-5" /></svg>;
    case 'checkCircle': return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></svg>;
    case 'target': return <svg {...common}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.4" fill={color} stroke="none" /></svg>;
    case 'clock': return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
    case 'lock': return <svg {...common}><rect x="4.5" y="11" width="15" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;
    case 'arrowRight': return <svg {...common} strokeWidth={2}><path d="M5 12h14M13 5l7 7-7 7" /></svg>;
    case 'arrowLeft': return <svg {...common} strokeWidth={2}><path d="M19 12H5M11 5l-7 7 7 7" /></svg>;
    case 'calc': return <svg {...common}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 7h8" /><path d="M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15v3M8 18h4" /></svg>;
    case 'pill': return <svg {...common}><rect x="3" y="9" width="18" height="6" rx="3" transform="rotate(-30 12 12)" /><path d="M9.5 7.5l4 7" /></svg>;
    case 'flask': return <svg {...common}><path d="M9 3h6M10 3v7L4 20a1 1 0 0 0 .9 1.5h14.2A1 1 0 0 0 20 20l-6-10V3" /><path d="M7 15h10" /></svg>;
    case 'chart': return <svg {...common}><path d="M4 20V8M10 20V4M16 20v-7M22 20H2" /></svg>;
    case 'flag': return <svg {...common}><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></svg>;
    case 'minus': return <svg {...common} strokeWidth={2.4}><path d="M5 12h14" /></svg>;
    case 'plus': return <svg {...common} strokeWidth={2.4}><path d="M12 5v14M5 12h14" /></svg>;
    case 'sparkle': return <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M12 2l1.7 5.3L19 9l-5.3 1.7L12 16l-1.7-5.3L5 9l5.3-1.7zM19 14l.9 2.6L22 18l-2.1.9-.9 2.1-1-2.1L16 18l1.9-1.4z" /></svg>;
    case 'stethoscope': return <svg {...common}><path d="M5 3v5a4 4 0 0 0 8 0V3" /><path d="M9 16v0a5 5 0 0 0 10 0v-2" /><circle cx="19" cy="11" r="2.2" /></svg>;
    case 'download': return <svg {...common}><path d="M12 3v12M7 11l5 5 5-5" /><path d="M4 21h16" /></svg>;
    case 'share': return <svg {...common}><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6" /></svg>;
    case 'x': return <svg {...common} strokeWidth={2}><path d="M6 6l12 12M18 6L6 18" /></svg>;
    default: return null;
  }
}

/** The recolourable k+ mark — same geometry as KaribuEHR, only the fill changes. */
export function KMark({ size = 40, color = '#FB4D5B', fg = '#FFFFFF' }: { size?: number; color?: string; fg?: string }) {
  const r = Math.round(size * 0.22);
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <rect x="0" y="0" width="100" height="100" rx={r * (100 / size)} fill={color} />
      <rect x="22" y="22" width="11" height="56" rx="2" fill={fg} />
      <path d="M33 50 L55 28 L68 28 L46 50 L68 78 L55 78 L33 56 Z" fill={fg} />
      <rect x="68" y="18" width="8" height="22" rx="1.5" fill={fg} />
      <rect x="61" y="25" width="22" height="8" rx="1.5" fill={fg} />
    </svg>
  );
}
