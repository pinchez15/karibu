// KaribuLearn web shell — coral left-rail (structurally like the EHR so it
// "feels like Karibu", but coral so it's never mistaken for the cobalt EHR).
'use client';

import React from 'react';
import { KH, KL } from '../lib/tokens';
import { Icon, type IconName } from '../lib/icons';
import { Eyebrow, KLockup } from '../lib/ui';

export type Tab = 'home' | 'library' | 'progress' | 'about';

const NAV: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'library', label: 'Cases', icon: 'cases' },
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'progress', label: 'My progress', icon: 'award' },
];

export function Shell({ active, onNav, title, subtitle, actions, children }: {
  active: Tab; onNav: (t: Tab) => void; title?: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode;
}) {
  const item = (id: Tab | 'about', label: string, icon: IconName) => {
    const on = id === active;
    return (
      <div key={id} onClick={() => onNav(id as Tab)} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 10px', borderRadius: 9, background: on ? KL.soft : 'transparent', color: on ? KL.deep : KL.body, fontSize: 13.5, fontWeight: on ? 600 : 500, marginBottom: 2, cursor: 'pointer', transition: 'background 120ms ease' }}
        onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = KL.wash; }}
        onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent'; }}>
        <span style={{ display: 'flex', color: on ? KL.primary : KL.muted }}><Icon name={icon} size={18} color={on ? KL.primary : KL.muted} /></span>
        <span>{label}</span>
      </div>
    );
  };
  return (
    <div style={{ display: 'flex', height: '100%', background: KL.bg, color: KL.ink, fontFamily: KH.font }}>
      <aside style={{ width: 236, background: KL.surface, borderRight: `1px solid ${KL.line}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '20px 18px 16px' }}>
          <div onClick={() => onNav('home')} style={{ cursor: 'pointer' }}>
            <KLockup size={30} markColor={KL.primary} textColor={KL.ink} suffix=".learn" suffixColor={KL.primary} />
          </div>
          <div style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: KL.soft, borderRadius: 999 }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: KH.green }} />
            <span style={{ fontFamily: KH.mono, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.05em', color: KL.deep }}>FREE · NO LOGIN NEEDED</span>
          </div>
        </div>
        <nav style={{ padding: '6px 12px', flex: 1 }}>
          <div style={{ padding: '0 8px 8px' }}><Eyebrow>Learn</Eyebrow></div>
          {NAV.map((n) => item(n.id, n.label, n.icon))}
          <div style={{ padding: '16px 8px 8px' }}><Eyebrow>About</Eyebrow></div>
          {item('about', 'About KaribuLearn', 'info')}
        </nav>
        <div style={{ padding: 14, borderTop: `1px solid ${KL.lineSoft}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 999, background: KL.soft, color: KL.deep, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>AO</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Aïsha Okot</div>
              <div style={{ fontSize: 11, color: KL.muted }}>Clinical officer · HC III</div>
            </div>
          </div>
        </div>
      </aside>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {(title || actions) && (
          <header style={{ padding: '18px 28px', borderBottom: `1px solid ${KL.line}`, background: KL.surface, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexShrink: 0 }}>
            <div style={{ minWidth: 0 }}>
              {subtitle && <Eyebrow style={{ marginBottom: 4 }}>{subtitle}</Eyebrow>}
              <div style={{ fontSize: 23, fontWeight: 600, letterSpacing: '-0.02em', color: KL.ink }}>{title}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>{actions}</div>
          </header>
        )}
        <div style={{ flex: 1, overflow: 'auto' }}>
          <div style={{ maxWidth: 1180, margin: '0 auto', padding: 28 }}>{children}</div>
        </div>
      </main>
    </div>
  );
}

export function Welcome({ caseCount, topicCount, onEnter }: { caseCount: number; topicCount: number; onEnter: () => void }) {
  const stat = (v: string, l: string) => (
    <div><div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em' }}>{v}</div><div style={{ fontFamily: KH.mono, fontSize: 10.5, letterSpacing: '0.05em', opacity: 0.8, textTransform: 'uppercase', marginTop: 2 }}>{l}</div></div>
  );
  return (
    <div style={{ height: '100%', background: KL.grad, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: KH.font, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: '-10%', right: '-6%', width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.22), transparent 62%)' }} />
      <div style={{ position: 'relative', maxWidth: 680, padding: 40 }}>
        <KLockup size={34} markColor="#fff" markFg={KL.primary} textColor="#fff" suffix=".learn" suffixColor="rgba(255,255,255,0.72)" />
        <div style={{ fontFamily: KH.mono, fontSize: 11, letterSpacing: '0.1em', fontWeight: 600, opacity: 0.85, margin: '34px 0 16px' }}>CME · UGANDA · FREE</div>
        <h1 style={{ fontSize: 52, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.04, margin: 0 }}>See the patient before the patient sees you.</h1>
        <p style={{ fontSize: 17, lineHeight: 1.55, marginTop: 18, color: 'rgba(255,255,255,0.92)', maxWidth: 520 }}>Real HC III cases, written by Ugandan clinicians. Work each one like a live visit — no real patient data.</p>
        <div style={{ display: 'flex', gap: 36, marginTop: 30 }}>
          {stat(caseCount > 0 ? String(caseCount) : '—', 'cases')}
          {stat(topicCount > 0 ? String(topicCount) : '—', 'topics')}
          {stat('CME', 'credit')}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 34 }}>
          <button onClick={onEnter} style={{ background: '#fff', color: KL.deep, border: 0, borderRadius: 13, padding: '15px 26px', fontWeight: 700, fontSize: 15.5, fontFamily: KH.font, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>Browse cases <Icon name="arrowRight" size={16} color={KL.deep} /></button>
          <button onClick={onEnter} style={{ background: 'rgba(255,255,255,0.14)', color: '#fff', border: '1px solid rgba(255,255,255,0.32)', borderRadius: 13, padding: '15px 22px', fontWeight: 600, fontSize: 14.5, fontFamily: KH.font, cursor: 'pointer' }}>Continue with phone number</button>
        </div>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.78)', marginTop: 14 }}>No account needed. Make one later for a CME certificate.</p>
      </div>
    </div>
  );
}
