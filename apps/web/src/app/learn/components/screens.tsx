// KaribuLearn web screens — Home, Library (+ downloadable packs), Progress,
// About, Case landing, Case complete. Mirrors the Android screens.
'use client';

import React from 'react';
import { KH, KL } from '../lib/tokens';
import { Icon, KMark } from '../lib/icons';
import { Btn, Card, Eyebrow, Meta, Progress, Tag, fmtCredit, shareText, sourceLabel } from '../lib/ui';
import type { LearnCase, PackInfo } from '../lib/types';

function CoverIcon({ ready }: { ready: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, background: ready ? 'rgba(255,255,255,0.22)' : KL.surface, color: ready ? '#fff' : KL.primary }}>
      <Icon name="stethoscope" size={16} color={ready ? '#fff' : KL.primary} />
    </span>
  );
}

export function CaseCard({ c, onOpen }: { c: LearnCase; onOpen: (c: LearnCase) => void }) {
  const label = sourceLabel(c);
  return (
    <Card pad={0} hover onClick={() => onOpen(c)} style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 84, background: c.ready ? KL.grad : KL.soft, position: 'relative', display: 'flex', alignItems: 'flex-end', padding: 14 }}>
        {!c.ready && <div style={{ position: 'absolute', inset: 0, background: `repeating-linear-gradient(135deg, transparent, transparent 11px, ${KL.primary}0e 11px, ${KL.primary}0e 22px)` }} />}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8 }}>
          <CoverIcon ready={!!c.ready} />
          <span style={{ fontFamily: KH.mono, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em', color: c.ready ? 'rgba(255,255,255,0.92)' : KL.muted, textTransform: 'uppercase' }}>{c.topic}</span>
        </div>
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <Tag tone={c.difficulty === 'Core' ? 'coral' : 'neutral'}>{c.difficulty ?? 'Core'}</Tag>
          {label && <Tag>{label}</Tag>}
          <Meta style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="clock" size={12} color={KL.muted} /> {c.mins ?? 12} min</Meta>
        </div>
        <div style={{ fontSize: 16.5, fontWeight: 700, letterSpacing: '-0.01em', color: KL.ink, lineHeight: 1.25 }}>{c.title}</div>
        <div style={{ fontSize: 13, color: KL.muted, marginTop: 5, fontFamily: KH.mono }}>{c.patient.name} · {c.patient.age}</div>
        <p style={{ fontSize: 13.5, color: KL.body, lineHeight: 1.5, margin: '10px 0 14px', flex: 1 }}>{c.blurb}</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {c.ready
            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 600, color: KL.primary }}><Icon name="play" size={13} color={KL.primary} /> Start case</span>
            : <span style={{ fontFamily: KH.mono, fontSize: 11, letterSpacing: '0.04em', color: KL.muted }}>COMING SOON</span>}
          <Meta>CME {fmtCredit(c.credit)}</Meta>
        </div>
      </div>
    </Card>
  );
}

function Hero({ children, radius = 18 }: { children: React.ReactNode; radius?: number }) {
  return (
    <div style={{ borderRadius: radius, overflow: 'hidden', background: KL.grad, color: '#fff', padding: '32px 34px', position: 'relative' }}>
      <div style={{ position: 'absolute', top: '-30%', right: '-6%', width: 360, height: 360, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.2), transparent 62%)' }} />
      <div style={{ position: 'relative' }}>{children}</div>
    </div>
  );
}

export function ScreenHome({ cases, onOpen, onAll }: { cases: LearnCase[]; onOpen: (c: LearnCase) => void; onAll: () => void }) {
  const feature = cases.find((c) => c.ready) ?? cases[0];
  return (
    <div>
      {feature && (
        <div style={{ marginBottom: 26 }}>
          <Hero>
            <div style={{ maxWidth: 560 }}>
              <div style={{ fontFamily: KH.mono, fontSize: 11, letterSpacing: '0.1em', opacity: 0.85, marginBottom: 12 }}>PICK UP WHERE YOU LEFT OFF</div>
              <h2 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.025em', margin: 0, lineHeight: 1.1 }}>{feature.title}</h2>
              <p style={{ fontSize: 15, lineHeight: 1.55, opacity: 0.92, margin: '10px 0 0', maxWidth: 480 }}>{feature.blurb}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 22 }}>
                <Btn kind="onDark" size="lg" onClick={() => onOpen(feature)} icon={<Icon name="play" size={15} color={KL.deep} />}>{feature.ready ? 'Start the case' : 'Preview case'}</Btn>
                <span style={{ fontFamily: KH.mono, fontSize: 12, opacity: 0.85, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="clock" size={13} color="#fff" /> {feature.mins} min · CME {fmtCredit(feature.credit)}</span>
              </div>
            </div>
          </Hero>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 26 }}>
        {([['CASES DONE', '0'], ['CME EARNED', '0.00'], ['PACKS', String(new Set(cases.map((c) => c.packId)).size)], ['CASES', String(cases.length)]] as const).map(([l, v]) => (
          <Card key={l} pad={16}>
            <Eyebrow>{l}</Eyebrow>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 6, color: KL.ink }}>{v}</div>
          </Card>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', margin: 0, color: KL.ink }}>Recommended for you</h3>
        <button onClick={onAll} style={{ background: 'transparent', border: 0, color: KL.primary, fontWeight: 600, fontSize: 13.5, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: KH.font }}>All cases <Icon name="arrowRight" size={14} color={KL.primary} /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {cases.slice(0, 3).map((c) => <CaseCard key={c.id} c={c} onOpen={onOpen} />)}
      </div>
    </div>
  );
}

export function ScreenLibrary({ cases, packs, downloading, onOpen, onDownload }: {
  cases: LearnCase[]; packs: PackInfo[]; downloading: Set<string>;
  onOpen: (c: LearnCase) => void; onDownload: (p: PackInfo) => void;
}) {
  const [topic, setTopic] = React.useState('All topics');
  const topics = ['All topics', ...Array.from(new Set(cases.map((c) => c.topic)))];
  const shown = topic === 'All topics' ? cases : cases.filter((c) => c.topic === topic);
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 22 }}>
        {topics.map((t) => {
          const on = t === topic;
          return (
            <button key={t} onClick={() => setTopic(t)} style={{ fontFamily: KH.font, fontSize: 13, fontWeight: on ? 600 : 500, cursor: 'pointer', padding: '7px 14px', borderRadius: 999, border: `1px solid ${on ? 'transparent' : KL.line}`, background: on ? KL.primary : KL.surface, color: on ? '#fff' : KL.body, transition: 'all 120ms ease' }}>{t}</button>
          );
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {shown.map((c) => <CaseCard key={c.id} c={c} onOpen={onOpen} />)}
      </div>

      {packs.length > 0 && (
        <div style={{ marginTop: 30 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Icon name="download" size={18} color={KL.primary} />
            <h3 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', margin: 0, color: KL.ink }}>More case packs</h3>
          </div>
          <p style={{ fontSize: 13.5, color: KL.muted, margin: '0 0 14px' }}>Free to download — pulled in small packs so you choose how to spend your data.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            {packs.map((p) => <PackCard key={p.id} p={p} busy={downloading.has(p.id)} onDownload={() => onDownload(p)} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function PackCard({ p, busy, onDownload }: { p: PackInfo; busy: boolean; onDownload: () => void }) {
  const size = (p.approx_size_kb ?? 0) >= 1024 ? `${((p.approx_size_kb ?? 0) / 1024).toFixed(1)} MB` : `${p.approx_size_kb ?? 0} KB`;
  return (
    <Card pad={16}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 44, height: 44, borderRadius: 11, background: KL.soft, color: KL.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="cases" size={20} color={KL.primary} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: KL.ink }}>{p.title}</div>
          <Meta>{p.case_count ?? 0} cases · ~{size}</Meta>
        </div>
        {!busy && <Btn kind="soft" size="sm" onClick={onDownload} icon={<Icon name="download" size={14} color={KL.deep} />}>Get</Btn>}
      </div>
      {p.subtitle && <p style={{ fontSize: 13, color: KL.body, lineHeight: 1.5, margin: '10px 0 0' }}>{p.subtitle}</p>}
      {busy && (
        <div style={{ marginTop: 12 }}>
          <Progress value={60} height={5} />
          <Meta style={{ display: 'block', marginTop: 5 }}>DOWNLOADING…</Meta>
        </div>
      )}
    </Card>
  );
}

export function ScreenProgress({ cases }: { cases: LearnCase[] }) {
  const topics = Array.from(new Set(cases.map((c) => c.topic)));
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginBottom: 26 }}>
        <Card pad={24} style={{ background: KL.grad, border: 'none', color: '#fff' }}>
          <Eyebrow color="rgba(255,255,255,0.8)">Continuing medical education</Eyebrow>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 10 }}>
            <div style={{ fontSize: 46, fontWeight: 700, letterSpacing: '-0.03em' }}>0.00</div>
            <div style={{ fontSize: 15, opacity: 0.9 }}>CME credits this year</div>
          </div>
          <p style={{ fontSize: 13.5, opacity: 0.9, lineHeight: 1.5, margin: '8px 0 18px', maxWidth: 360 }}>Each completed case earns logged credit against your name. Download a certificate any time.</p>
          <Btn kind="onDark" size="md" icon={<Icon name="award" size={16} color={KL.deep} />}>Download certificate</Btn>
        </Card>
        <Card pad={24}>
          <Eyebrow>Topics available</Eyebrow>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
            {topics.length === 0 && <Meta>Install a pack to see topics.</Meta>}
            {topics.map((t) => {
              const count = cases.filter((c) => c.topic === t).length;
              return (
                <div key={t} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: KL.body, fontWeight: 500 }}>{t}</span>
                  <Meta>{count} case{count === 1 ? '' : 's'}</Meta>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
      <h3 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', margin: '0 0 14px', color: KL.ink }}>Completed cases</h3>
      <Card pad={28} style={{ textAlign: 'center' }}>
        <Meta>Finish a case and it will appear here, with your score and CME credit.</Meta>
      </Card>
    </div>
  );
}

export function ScreenAbout() {
  const [sent, setSent] = React.useState(false);
  const builds: [import('../lib/icons').IconName, string, string][] = [
    ['flag', 'Danger-sign recognition', 'Spot when a routine fever, cough or headache is actually an emergency — before you commit to a plan.'],
    ['flask', 'Test-before-treat discipline', 'Order and read the right investigation first, so treatment follows evidence, not assumption.'],
    ['calc', 'Weight-based dosing', 'Get the milligram-per-kilogram maths right every time, with the same dose calculator the clinic uses.'],
    ['chart', 'Accurate HMIS coding', "Code the confirmed diagnosis correctly — the number that makes your facility's reports true."],
  ];
  const facts: [string, string][] = [
    ['Free, forever', 'Every clinician, no clinic account, no cost.'],
    ['Generated cases only', 'Every patient and result is invented for teaching. Never real PHI.'],
    ['CME on completion', 'Each case earns logged, downloadable credit.'],
  ];
  return (
    <div style={{ maxWidth: 920, margin: '0 auto' }}>
      <Eyebrow color={KL.primary} style={{ marginBottom: 12 }}>About KaribuLearn</Eyebrow>
      <Hero>
        <div style={{ maxWidth: 620 }}>
          <h1 style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.07, margin: 0 }}>Sharper clinical judgment, one case at a time.</h1>
          <p style={{ fontSize: 16, lineHeight: 1.55, opacity: 0.93, margin: '14px 0 0', maxWidth: 540 }}>KaribuLearn is a free continuing-education tool for clinicians in Uganda&apos;s health centres. You work realistic cases the way you work a live clinic — and build the judgment that protects patients.</p>
        </div>
      </Hero>

      <h3 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', margin: '26px 0 14px', color: KL.ink }}>What you build here</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 28 }}>
        {builds.map(([icon, t, d]) => (
          <Card key={t} pad={20}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 10, background: KL.soft, color: KL.primary }}><Icon name={icon} size={18} color={KL.primary} /></span>
            <h4 style={{ fontSize: 15.5, fontWeight: 700, margin: '13px 0 5px', color: KL.ink, letterSpacing: '-0.01em' }}>{t}</h4>
            <p style={{ fontSize: 13.5, color: KL.body, lineHeight: 1.55, margin: 0 }}>{d}</p>
          </Card>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 30 }}>
        {facts.map(([t, d]) => (
          <Card key={t} pad={18}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: KL.ink, marginBottom: 4 }}>{t}</div>
            <p style={{ fontSize: 13, color: KL.body, lineHeight: 1.5, margin: 0 }}>{d}</p>
          </Card>
        ))}
      </div>

      <div style={{ borderRadius: 16, border: `1px solid ${KH.cobalt}2e`, overflow: 'hidden', display: 'grid', gridTemplateColumns: '1.25fr 1fr' }}>
        <div style={{ padding: '24px 26px', borderRight: `1px solid ${KL.lineSoft}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <KMark size={26} color={KH.cobalt} />
            <span style={{ fontFamily: KH.mono, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em', color: KH.cobalt }}>POWERED BY KARIBUEHR</span>
          </div>
          <h4 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.015em', margin: '0 0 8px', color: KL.ink }}>These cases run on a real EHR.</h4>
          <p style={{ fontSize: 14, color: KL.body, lineHeight: 1.55, margin: 0 }}>The chart you work inside each case is KaribuEHR — the record system used in health centres for everyday documentation, dosing and reporting. If your facility wants it, you can apply here. It&apos;s provisioned per-clinic; KaribuLearn stays free regardless.</p>
        </div>
        <div style={{ padding: '24px 26px', background: KL.wash }}>
          {!sent ? (
            <>
              <div style={{ fontFamily: KH.mono, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em', color: KH.cobalt, marginBottom: 12 }}>APPLY FOR YOUR CLINIC</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {[['Facility', 'Susunga HC III'], ['District', 'Mityana'], ['Phone', '+256 7…']].map(([l, ph]) => (
                  <input key={l} placeholder={`${l} · ${ph}`} style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: `1px solid ${KL.line}`, background: KL.surface, color: KL.ink, fontFamily: KH.font, fontSize: 13.5, outline: 'none', boxSizing: 'border-box' }} />
                ))}
              </div>
              <Btn size="md" full style={{ marginTop: 12, background: KH.cobalt, color: '#fff' }} onClick={() => setSent(true)}>Send application</Btn>
              <p style={{ fontSize: 11.5, color: KL.muted, lineHeight: 1.5, margin: '10px 0 0' }}>The Karibu team replies within two working days.</p>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '18px 4px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: 999, background: KH.greenSoft, color: KH.green, marginBottom: 12 }}><Icon name="checkCircle" size={24} color={KH.green} /></span>
              <h4 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 5px', color: KL.ink }}>Application sent</h4>
              <p style={{ fontSize: 13, color: KL.body, lineHeight: 1.5, margin: 0 }}>We&apos;ll be in touch within two working days.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function CaseLanding({ c, onBegin, onBack }: { c: LearnCase; onBegin: (c: LearnCase) => void; onBack: () => void }) {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 0, color: KL.muted, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: KH.font, marginBottom: 16 }}>
        <Icon name="arrowLeft" size={15} color={KL.muted} /> Back to library
      </button>
      <div style={{ borderRadius: 18, overflow: 'hidden', background: c.ready ? KL.grad : KL.deep, color: '#fff', padding: '28px 30px', position: 'relative', marginBottom: 22 }}>
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            {[c.topic, c.difficulty ?? 'Core', c.source_type].filter(Boolean).map((t) => (
              <span key={t} style={{ fontFamily: KH.mono, fontSize: 9.5, fontWeight: 600, letterSpacing: '0.06em', padding: '3px 9px', borderRadius: 5, background: 'rgba(255,255,255,0.18)', textTransform: 'uppercase' }}>{t}</span>
            ))}
          </div>
          <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.025em', margin: 0, lineHeight: 1.1 }}>{c.title}</h1>
          <div style={{ display: 'flex', gap: 16, marginTop: 14, fontFamily: KH.mono, fontSize: 12, opacity: 0.92 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="clock" size={13} color="#fff" /> {c.mins} min</span>
            <span>· CME {fmtCredit(c.credit)}</span>
          </div>
        </div>
      </div>

      {c.blurb && <p style={{ fontSize: 15, color: KL.body, lineHeight: 1.6, margin: '0 0 22px' }}>{c.blurb}</p>}

      <Card pad={18} style={{ marginBottom: 22 }}>
        <Eyebrow style={{ marginBottom: 10 }}>Your patient</Eyebrow>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 11, background: KH.cobaltSoft, color: KH.cobalt, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>{c.patient.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}</div>
          <div><div style={{ fontSize: 15.5, fontWeight: 700, color: KL.ink }}>{c.patient.name}</div><Meta>{c.patient.id ? `${c.patient.id} · ` : ''}{c.patient.age}</Meta></div>
        </div>
        <div style={{ fontSize: 12.5, color: KL.muted, lineHeight: 1.5, marginTop: 12, padding: '10px 12px', background: KL.wash, borderRadius: 9 }}>Generated patient — invented for teaching, never a real record.</div>
      </Card>

      {(c.objectives?.length ?? 0) > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Icon name="target" size={18} color={KL.primary} />
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: KL.ink }}>You&apos;ll be able to…</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 26 }}>
            {c.objectives!.map((o, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 999, background: KL.soft, color: KL.deep, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: KH.mono, fontSize: 11, fontWeight: 700 }}>{i + 1}</span>
                <span style={{ fontSize: 14, color: KL.body, lineHeight: 1.5 }}>{o}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {c.ready
        ? <Btn kind="primary" size="lg" full onClick={() => onBegin(c)} icon={<Icon name="play" size={15} color="#fff" />}>Begin case</Btn>
        : <div style={{ textAlign: 'center', padding: 16, borderRadius: 12, border: `1px dashed ${KL.line}`, color: KL.muted, fontFamily: KH.mono, fontSize: 12, letterSpacing: '0.04em' }}>COMING SOON</div>}
    </div>
  );
}

export function CaseComplete({ c, score, total, onLibrary }: { c: LearnCase; score: number; total: number; onLibrary: () => void }) {
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  const onShare = async () => {
    const text = shareText(c);
    try {
      if (navigator.share) await navigator.share({ title: c.share?.share_title ?? c.title, text });
      else { await navigator.clipboard.writeText(text); alert('Case link copied — paste it into your group.'); }
    } catch { /* user cancelled */ }
  };
  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{ borderRadius: 18, overflow: 'hidden', background: KL.grad, color: '#fff', padding: '32px', textAlign: 'center', position: 'relative', marginBottom: 24 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 50, height: 50, borderRadius: 999, background: 'rgba(255,255,255,0.22)', marginBottom: 12 }}><Icon name="award" size={26} color="#fff" /></span>
        <div style={{ fontFamily: KH.mono, fontSize: 10, letterSpacing: '0.1em', opacity: 0.85 }}>CASE COMPLETE</div>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', margin: '6px 0 0' }}>{c.title}</h1>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 30, marginTop: 18 }}>
          {([[`${score}/${total}`, 'RIGHT'], [`${pct}%`, 'ACCURACY'], [`+${fmtCredit(c.credit)}`, 'CME']] as const).map(([v, l]) => (
            <div key={l}><div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em' }}>{v}</div><div style={{ fontFamily: KH.mono, fontSize: 9, letterSpacing: '0.06em', opacity: 0.82, marginTop: 1 }}>{l}</div></div>
          ))}
        </div>
      </div>

      {(c.takeaways?.length ?? 0) > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Icon name="bulb" size={16} color={KL.primary} />
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: KL.ink }}>Key takeaways</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
            {c.takeaways!.map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, background: KL.surface, border: `1px solid ${KL.line}`, borderRadius: 12, padding: 14 }}>
                <span style={{ flexShrink: 0, marginTop: 1 }}><Icon name="check" size={16} color={KH.green} /></span>
                <span style={{ fontSize: 13.5, color: KL.body, lineHeight: 1.5 }}>{t}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {(c.citations?.length ?? 0) > 0 && (
        <>
          <Eyebrow style={{ marginBottom: 8 }}>Based on</Eyebrow>
          <div style={{ fontSize: 12.5, color: KL.muted, fontFamily: KH.mono, lineHeight: 1.7, marginBottom: 22 }}>
            {c.citations!.map((s) => <div key={s}>· {s}</div>)}
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        <Btn kind="primary" size="lg" full onClick={onLibrary} iconRight={<Icon name="arrowRight" size={16} color="#fff" />}>Back to library</Btn>
        {c.share && <Btn kind="ghost" size="lg" onClick={onShare} icon={<Icon name="share" size={16} color={KL.ink} />}>Share with a group</Btn>}
      </div>
    </div>
  );
}
