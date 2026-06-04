// KaribuLearn web UI primitives — coral counterpart to the EHR chrome.
// Subtle 1px borders, pill radii, mono uppercased eyebrows, no heavy shadow.
import React from 'react';
import { KH, KL } from './tokens';
import type { LearnCase } from './types';

export function Eyebrow({ children, color, style }: { children: React.ReactNode; color?: string; style?: React.CSSProperties }) {
  return (
    <div style={{ fontFamily: KH.mono, fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: color ?? KL.muted, ...style }}>
      {children}
    </div>
  );
}

export function Meta({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <span style={{ fontFamily: KH.mono, fontSize: 12, letterSpacing: '0.02em', color: KL.muted, ...style }}>{children}</span>;
}

type BtnKind = 'primary' | 'deep' | 'ghost' | 'soft' | 'onDark' | 'ghostDark';
export function Btn({
  children, onClick, kind = 'primary', size = 'md', full, icon, iconRight, disabled, style,
}: {
  children: React.ReactNode; onClick?: () => void; kind?: BtnKind; size?: 'sm' | 'md' | 'lg';
  full?: boolean; icon?: React.ReactNode; iconRight?: React.ReactNode; disabled?: boolean; style?: React.CSSProperties;
}) {
  const pads = { sm: '7px 12px', md: '10px 16px', lg: '13px 22px' }[size];
  const fs = { sm: 13, md: 14, lg: 15 }[size];
  const kinds: Record<BtnKind, React.CSSProperties> = {
    primary: { background: KL.primary, color: '#fff' },
    deep: { background: KL.deep, color: '#fff' },
    ghost: { background: KL.surface, color: KL.ink, border: `1px solid ${KL.line}` },
    soft: { background: KL.soft, color: KL.deep, border: `1px solid ${KL.primary}22` },
    onDark: { background: '#fff', color: KL.deep },
    ghostDark: { background: 'rgba(255,255,255,0.14)', color: '#fff', border: '1px solid rgba(255,255,255,0.30)' },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      fontFamily: KH.font, fontWeight: 600, fontSize: fs, padding: pads, borderRadius: 10,
      cursor: disabled ? 'default' : 'pointer', border: '1px solid transparent', whiteSpace: 'nowrap',
      width: full ? '100%' : undefined, opacity: disabled ? 0.55 : 1, transition: 'filter 130ms ease',
      ...kinds[kind], ...style,
    }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.filter = 'brightness(0.96)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.filter = 'none'; }}>
      {icon}{children}{iconRight}
    </button>
  );
}

export function Card({ children, pad = 20, hover, onClick, style }: {
  children: React.ReactNode; pad?: number; hover?: boolean; onClick?: () => void; style?: React.CSSProperties;
}) {
  return (
    <div onClick={onClick} style={{
      background: KL.surface, border: `1px solid ${KL.line}`, borderRadius: 14, padding: pad,
      cursor: onClick ? 'pointer' : 'default', transition: 'all 140ms ease', ...style,
    }}
      onMouseEnter={hover ? (e) => { e.currentTarget.style.borderColor = `${KL.primary}66`; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 10px 30px ${KL.primary}1f`; } : undefined}
      onMouseLeave={hover ? (e) => { e.currentTarget.style.borderColor = KL.line; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; } : undefined}>
      {children}
    </div>
  );
}

export function Progress({ value, height = 6, track }: { value: number; height?: number; track?: string }) {
  return (
    <div style={{ height, background: track ?? KL.line, borderRadius: 999, overflow: 'hidden', width: '100%' }}>
      <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, value))}%`, background: KL.primary, borderRadius: 999, transition: 'width 350ms cubic-bezier(.4,0,.2,1)' }} />
    </div>
  );
}

export function Tag({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'coral' | 'green' }) {
  const tones = {
    neutral: { color: KL.muted, border: KL.line, bg: 'transparent' },
    coral: { color: KL.deep, border: `${KL.primary}40`, bg: KL.soft },
    green: { color: KH.green, border: `${KH.green}40`, bg: KH.greenSoft },
  }[tone];
  return (
    <span style={{ fontFamily: KH.mono, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 6, color: tones.color, border: `1px solid ${tones.border}`, background: tones.bg }}>
      {children}
    </span>
  );
}

export function KWordmark({ height = 28, color = KL.ink, suffix = '.learn', suffixColor }: { height?: number; color?: string; suffix?: string; suffixColor?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', fontFamily: KH.font, fontWeight: 700, fontSize: height, letterSpacing: '-0.025em', color, lineHeight: 1, whiteSpace: 'nowrap' }}>
      <span>Karibu</span>
      <span style={{ fontWeight: 500, color: suffixColor ?? 'currentColor', opacity: suffixColor ? 1 : 0.62 }}>{suffix}</span>
    </span>
  );
}

import { KMark } from './icons';
export function KLockup({ size = 34, markColor = KL.primary, markFg, textColor = KL.ink, suffix = '.learn', suffixColor, gap = 11 }: {
  size?: number; markColor?: string; markFg?: string; textColor?: string; suffix?: string; suffixColor?: string; gap?: number;
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap }}>
      <KMark size={size} color={markColor} fg={markFg ?? '#fff'} />
      <KWordmark height={Math.round(size * 0.66)} color={textColor} suffix={suffix} suffixColor={suffixColor} />
    </span>
  );
}

/** Short framing label — no "real vs generated" hierarchy (content strategy). */
export function sourceLabel(c: LearnCase): string | null {
  const s = c.source_type ?? '';
  const m = c.mode ?? '';
  if (/Literature/i.test(s)) return 'LITERATURE';
  if (/Conference/i.test(s) || /Conference/i.test(m)) return 'CONFERENCE';
  if (/Challenge/i.test(s) || /Challenge/i.test(m)) return 'CHALLENGE';
  if (/Guideline/i.test(s)) return 'GUIDELINE';
  if (m) return m.split(' ')[0].toUpperCase();
  return null;
}

export function fmtCredit(c: number | undefined): string {
  const v = c ?? 0.25;
  return Number.isInteger(v) ? String(v) : String(v);
}

/** Plain (no-emoji) share text; never includes learner progress. */
export function shareText(c: LearnCase): string {
  const s = c.share;
  return [s?.share_title || c.title, s?.share_prompt, s?.discussion_question, s?.share_url]
    .filter(Boolean).join('\n\n').trim();
}
