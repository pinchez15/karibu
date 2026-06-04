// The cobalt KaribuEHR "chart" shown inside a case — data-driven from
// ChartSpec.sections. Deliberately cobalt (the learner sees the real product);
// amber = AI and brick-red = clinical critical stay reserved. Web mirror of
// the Android walkthrough/ChartFragment.kt.
'use client';

import React from 'react';
import { KH } from '../lib/tokens';
import { KMark, Icon } from '../lib/icons';
import type { CasePatient, ChartSection, ChartSpec, Critical, Vital } from '../lib/types';

export function ChartFragment({
  spec, patient, revealed, onCalc,
}: { spec: ChartSpec; patient: CasePatient; revealed: boolean; onCalc?: () => void }) {
  const initials = patient.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${KH.line}`, background: KH.surface, maxWidth: 560 }}>
      {/* cobalt chrome */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px', background: KH.cobaltInk, color: '#fff' }}>
        <KMark size={16} color="#fff" fg={KH.cobalt} />
        <span style={{ fontWeight: 700, fontSize: 12.5 }}>Karibu<span style={{ fontWeight: 500, opacity: 0.7 }}>.health</span></span>
        <span style={{ fontFamily: KH.mono, fontSize: 9, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.5)' }}>SIMULATION</span>
        {spec.tag && <span style={{ marginLeft: 'auto', fontFamily: KH.mono, fontSize: 9.5, letterSpacing: '0.06em', background: 'rgba(255,255,255,0.12)', padding: '2px 8px', borderRadius: 5 }}>{spec.tag}</span>}
      </div>
      {/* patient strip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: `1px solid ${KH.lineSoft}`, background: KH.bg }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: KH.cobaltSoft, color: KH.cobalt, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>{initials}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: KH.ink }}>{patient.name} <span style={{ fontFamily: KH.mono, fontSize: 10.5, color: KH.muted, fontWeight: 400 }}>{patient.age}</span></div>
          <div style={{ fontFamily: KH.mono, fontSize: 9.5, color: KH.muted, letterSpacing: '0.03em' }}>{patient.id ?? '—'} · SIMULATION</div>
        </div>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: KH.mono, fontSize: 9.5, color: KH.green }}>
          <span style={{ width: 5, height: 5, borderRadius: 999, background: KH.green }} />SAVED
        </span>
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {spec.sections.map((s, i) => <Section key={i} s={s} revealed={revealed} onCalc={onCalc} />)}
      </div>
    </div>
  );
}

function Label({ title, right }: { title?: string; right?: React.ReactNode }) {
  if (!title && !right) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
      <span style={{ fontFamily: KH.mono, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', color: KH.muted, textTransform: 'uppercase' }}>{title}</span>
      {right}
    </div>
  );
}

function Section({ s, revealed, onCalc }: { s: ChartSection; revealed: boolean; onCalc?: () => void }) {
  switch (s.type) {
    case 'chiefComplaint':
      return (
        <div>
          <Label title={s.title ?? 'Chief complaint'} />
          <div style={{ fontSize: 14, color: KH.ink, fontWeight: 500, lineHeight: 1.4 }}>{s.text}</div>
          {s.chips && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {s.chips.map((c) => <span key={c} style={{ fontSize: 10.5, color: KH.body, background: KH.bg, border: `1px solid ${KH.line}`, padding: '2px 8px', borderRadius: 999 }}>{c}</span>)}
            </div>
          )}
        </div>
      );
    case 'keyValues':
      return (
        <div>
          <Label title={s.title} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 14px', fontSize: 12 }}>
            {(s.rows ?? []).map((kv) => (
              <div key={kv.label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${KH.lineSoft}`, paddingBottom: 4 }}>
                <span style={{ color: KH.muted }}>{kv.label}</span><span style={{ fontFamily: KH.mono, color: KH.body }}>{kv.value}</span>
              </div>
            ))}
          </div>
        </div>
      );
    case 'vitals':
      return (
        <div>
          <Label title={s.title ?? 'Vitals'} right={s.right_label ? <span style={{ fontFamily: KH.mono, fontSize: 8.5, color: KH.muted }}>{s.right_label}</span> : undefined} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
            {(s.vitals ?? []).map((v) => <VitalChip key={v.label} v={v} />)}
          </div>
          {s.critical && <div style={{ marginTop: 8 }}><CriticalRow c={s.critical} /></div>}
        </div>
      );
    case 'subjective':
      return (
        <div>
          <Label title={s.title ?? 'Subjective'} />
          <div style={{ fontSize: 13, lineHeight: 1.5, color: KH.body }}>
            {s.text}{revealed && s.reveal_text ? <span style={{ color: KH.ink }}> {s.reveal_text}</span> : null}
          </div>
        </div>
      );
    case 'dangerScreen':
      return (
        <div>
          <Label title={s.title ?? 'Danger-sign screen'} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 12px' }}>
            {(s.danger_signs ?? []).map((d) => (
              <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: KH.body }}>
                <span style={{ width: 15, height: 15, borderRadius: 4, border: `1.5px solid ${revealed ? KH.green : KH.line}`, background: revealed ? KH.greenSoft : KH.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', color: KH.green, fontSize: 11, flexShrink: 0 }}>{revealed ? '−' : ''}</span>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d}</span>
              </div>
            ))}
          </div>
          {revealed && s.reveal_note && <div style={{ fontFamily: KH.mono, fontSize: 9.5, color: KH.green, marginTop: 7, textTransform: 'uppercase' }}>{s.reveal_note}</div>}
        </div>
      );
    case 'assessment':
      return (
        <div>
          <Label title={s.title ?? 'Assessment'} />
          <div style={{ fontSize: 13, lineHeight: 1.45, color: KH.body }}>{s.text} {s.emphasis && <span style={{ color: KH.ink, fontWeight: 500 }}>{s.emphasis}</span>}</div>
        </div>
      );
    case 'investigations':
      return (
        <div>
          <Label title={s.title ?? 'Investigations'} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(s.orders ?? []).map((o, i) => {
              const status = revealed ? (o.reveal_status ?? o.status) : o.status;
              const sub = revealed ? (o.reveal_sub ?? o.sub) : o.sub;
              const active = revealed && !!o.reveal_status;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 11px', borderRadius: 8, border: `1px solid ${active ? KH.cobalt : KH.line}`, background: active ? `${KH.cobaltSoft}70` : KH.surface }}>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: KH.ink }}>{o.name}</div>
                    {sub && <div style={{ fontFamily: KH.mono, fontSize: 9.5, color: KH.muted }}>{sub}</div>}
                  </div>
                  {status === 'pending' ? <Pill text="Pending" fg={KH.amber} bg={KH.amberSoft} />
                    : status === 'done' ? <Pill text="Done" fg={KH.green} bg={KH.greenSoft} />
                      : <span style={{ fontSize: 11, fontWeight: 600, color: KH.muted, border: `1px solid ${KH.line}`, padding: '3px 10px', borderRadius: 6 }}>Order</span>}
                </div>
              );
            })}
          </div>
        </div>
      );
    case 'result':
      return (
        <div>
          <Label title={s.title ?? 'Result'} right={s.right_label ? <span style={{ fontFamily: KH.mono, fontSize: 8.5, color: KH.green }}>{s.right_label}</span> : undefined} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 12, color: KH.muted }}>{s.result_label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: KH.ink, marginTop: 1 }}>{s.result_value}</div>
            </div>
            {s.badge && <span style={{ fontSize: 11, fontWeight: 700, color: KH.red, background: KH.redSoft, padding: '4px 10px', borderRadius: 999 }}>{s.badge}</span>}
          </div>
          {s.ai && (
            <div style={{ marginTop: 10, borderRadius: 10, border: `1.5px solid ${KH.amber}`, overflow: 'hidden' }}>
              <div style={{ height: 2, background: `linear-gradient(90deg, transparent, ${KH.amber}, transparent)`, backgroundSize: '200% 100%', animation: 'klshim 1.6s linear infinite' }} />
              <div style={{ padding: '11px 12px', background: `${KH.amberSoft}70` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: KH.amber, marginBottom: 4 }}>
                  <Icon name="sparkle" size={14} color={KH.amber} />
                  <span style={{ fontFamily: KH.mono, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.05em' }}>AI ASSISTANT</span>
                </div>
                <div style={{ fontSize: 12.5, color: KH.ink, fontWeight: 600, lineHeight: 1.35 }}>{s.ai.headline}</div>
                {s.ai.sub && <div style={{ fontSize: 11, color: KH.amberInk, marginTop: 2, lineHeight: 1.4 }}>{s.ai.sub}</div>}
              </div>
            </div>
          )}
        </div>
      );
    case 'prescription': {
      const detail = revealed ? (s.reveal_detail ?? s.detail) : s.detail;
      const confirmed = revealed && s.confirmed_on_reveal;
      return (
        <div>
          <Label title={s.title ?? 'Prescription'} right={s.calculator && onCalc ? (
            <button onClick={onCalc} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: KH.cobaltSoft, color: KH.cobalt, border: `1px solid ${KH.cobalt}33`, borderRadius: 6, padding: '3px 8px', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: KH.font }}>
              <Icon name="calc" size={12} color={KH.cobalt} /> Calculator
            </button>) : undefined} />
          <div style={{ border: `1px solid ${revealed ? KH.cobalt : KH.line}`, borderRadius: 9, padding: 11, background: revealed ? `${KH.cobaltSoft}55` : KH.surface }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: KH.ink }}>{s.drug}</div>
                {detail && <div style={{ fontSize: 12, color: KH.body, marginTop: 3, lineHeight: 1.4 }}>{detail}</div>}
              </div>
              <Pill text={confirmed ? 'Confirmed' : 'Draft'} fg={confirmed ? KH.green : KH.muted} bg={confirmed ? KH.greenSoft : KH.bg} />
            </div>
          </div>
          {s.counselling && (
            <div style={{ marginTop: 10 }}>
              <Label title="Counselling" />
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: KH.body, lineHeight: 1.6 }}>
                {s.counselling.map((c) => <li key={c}>{c}</li>)}
              </ul>
            </div>
          )}
        </div>
      );
    }
    case 'diagnosis':
      return (
        <div>
          <Label title={s.title ?? 'HMIS codes'} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(s.codes ?? []).map((c) => {
              const on = revealed && c.primary;
              return (
                <div key={c.code} style={{ border: `1px solid ${on ? KH.cobalt : KH.line}`, borderRadius: 8, padding: 10, background: on ? `${KH.cobaltSoft}66` : KH.surface }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: KH.mono, fontWeight: 700, fontSize: 13, color: KH.cobalt }}>{c.code}</span>
                    {c.confidence && <span style={{ fontSize: 9, fontFamily: KH.mono, color: KH.amber, background: KH.amberSoft, padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>AI {c.confidence}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: KH.body, marginTop: 2 }}>{c.name}</div>
                  {on && <div style={{ fontSize: 10.5, color: KH.cobalt, marginTop: 5, fontWeight: 600 }}>Primary diagnosis</div>}
                </div>
              );
            })}
          </div>
          {revealed && s.receipt && (
            <div style={{ marginTop: 10 }}>
              <Label title="Receipt preview" />
              <div style={{ fontFamily: KH.mono, fontSize: 10.5, color: KH.body, lineHeight: 1.7, background: KH.bg, padding: 10, borderRadius: 7, border: `1px dashed ${KH.line}`, whiteSpace: 'pre-line' }}>{s.receipt}</div>
            </div>
          )}
        </div>
      );
    default:
      return s.text ? <div style={{ fontSize: 13, color: KH.body }}>{s.text}</div> : null;
  }
}

function VitalChip({ v }: { v: Vital }) {
  const hot = v.hot;
  return (
    <div style={{ padding: '6px 9px', borderRadius: 8, background: hot ? KH.amberSoft : KH.bg, border: `1px solid ${hot ? `${KH.amber}66` : KH.line}` }}>
      <div style={{ fontFamily: KH.mono, fontSize: 8.5, fontWeight: 600, letterSpacing: '0.04em', color: hot ? KH.amber : KH.muted }}>{v.label}</div>
      <div style={{ fontFamily: KH.mono, fontSize: 14, fontWeight: 700, color: hot ? KH.amber : KH.ink, marginTop: 1 }}>{v.value}</div>
    </div>
  );
}

function CriticalRow({ c }: { c: Critical }) {
  const n = c.count ?? 1;
  return (
    <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: '#FEF3F2', border: `1px solid ${KH.red}40`, borderRadius: 9, padding: '10px 12px' }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: KH.red, marginTop: 5, flexShrink: 0 }} />
      <div>
        <div style={{ fontFamily: KH.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', color: KH.red, marginBottom: 2 }}>CRITICAL · {n} FINDING{n === 1 ? '' : 'S'}</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: KH.ink, lineHeight: 1.3 }}>{c.title}</div>
        {c.body && <div style={{ fontSize: 11.5, color: KH.body, marginTop: 2, lineHeight: 1.4 }}>{c.body}</div>}
      </div>
    </div>
  );
}

function Pill({ text, fg, bg }: { text: string; fg: string; bg: string }) {
  return <span style={{ fontSize: 10, fontWeight: 600, color: fg, background: bg, padding: '2px 8px', borderRadius: 999 }}>{text}</span>;
}
