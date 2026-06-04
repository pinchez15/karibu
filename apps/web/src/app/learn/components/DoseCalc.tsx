// Weight-based dose calculator — a cobalt KaribuEHR tool (centered modal on
// web). Driven by DoseCalcSpec so any case/drug can open it.
'use client';

import React from 'react';
import { KH } from '../lib/tokens';
import { Icon } from '../lib/icons';
import { bandFor, type DoseCalcSpec } from '../lib/types';

export function DoseCalc({ spec, onClose, onUse }: {
  spec: DoseCalcSpec; onClose: () => void; onUse?: (tabs: number, total: number) => void;
}) {
  const [w, setW] = React.useState(spec.start_weight ?? 60);
  const clamp = (x: number) => Math.max(2, Math.min(120, Math.round(x * 10) / 10));
  const dosesPerDay = spec.doses_per_day ?? 2;
  const days = spec.days ?? 3;
  const band = bandFor(spec, w);
  const tabs = band?.tabs ?? 0;
  const total = tabs * dosesPerDay * days;
  const sBtn: React.CSSProperties = { width: 46, height: 46, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: KH.surface, border: `1px solid ${KH.line}`, borderRadius: 12, color: KH.cobalt, cursor: 'pointer' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(11,20,82,0.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 420, maxWidth: '100%', background: KH.surface, borderRadius: 18, overflow: 'hidden', fontFamily: KH.font, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: KH.cobaltInk, color: '#fff', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.14)' }}><Icon name="calc" size={17} color="#fff" /></span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Dose calculator</div>
            <div style={{ fontFamily: KH.mono, fontSize: 9.5, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.6)' }}>KARIBUEHR · WEIGHT-BASED</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.12)', border: 0, color: '#fff', width: 28, height: 28, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={16} color="#fff" /></button>
        </div>

        <div style={{ padding: 18, overflow: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: `1px solid ${KH.line}`, background: KH.bg, marginBottom: 16 }}>
            <Icon name="pill" size={18} color={KH.cobalt} />
            <div><div style={{ fontSize: 13.5, fontWeight: 700, color: KH.ink }}>{spec.drug}</div><div style={{ fontFamily: KH.mono, fontSize: 9.5, color: KH.muted }}>{spec.drug_sub}</div></div>
          </div>

          <div style={{ fontFamily: KH.mono, fontSize: 9.5, fontWeight: 600, letterSpacing: '0.06em', color: KH.muted, marginBottom: 8 }}>PATIENT WEIGHT</div>
          <div style={{ display: 'flex', alignItems: 'stretch', gap: 10, marginBottom: 12 }}>
            <button onClick={() => setW((v) => clamp(v - 0.5))} style={sBtn}><Icon name="minus" size={18} color={KH.cobalt} /></button>
            <div style={{ flex: 1, display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 5, border: `1px solid ${KH.line}`, borderRadius: 12, background: KH.bg }}>
              <span style={{ fontFamily: KH.mono, fontSize: 28, fontWeight: 700, color: KH.ink, letterSpacing: '-0.02em' }}>{w.toFixed(1)}</span>
              <span style={{ fontSize: 13, color: KH.muted }}>kg</span>
            </div>
            <button onClick={() => setW((v) => clamp(v + 0.5))} style={sBtn}><Icon name="plus" size={18} color={KH.cobalt} /></button>
          </div>
          <input type="range" min={2} max={90} step={0.5} value={w} onChange={(e) => setW(clamp(parseFloat(e.target.value)))} style={{ width: '100%', accentColor: KH.cobalt, marginBottom: 16 }} />

          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${spec.bands.length},1fr)`, gap: 5, marginBottom: 16 }}>
            {spec.bands.map((b) => {
              const on = band != null && b.lo === band.lo;
              return (
                <div key={b.label} style={{ padding: '8px 4px', borderRadius: 9, textAlign: 'center', border: `1.5px solid ${on ? KH.cobalt : KH.line}`, background: on ? KH.cobaltSoft : KH.surface }}>
                  <div style={{ fontFamily: KH.mono, fontSize: 9, color: on ? KH.cobalt : KH.muted, fontWeight: 600 }}>{b.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: on ? KH.cobalt : KH.body, marginTop: 1 }}>{b.tabs}</div>
                </div>
              );
            })}
          </div>

          {band ? (
            <div style={{ borderRadius: 12, border: `1.5px solid ${KH.cobalt}`, background: `${KH.cobaltSoft}66`, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                <span style={{ fontSize: 26, fontWeight: 700, color: KH.cobalt, letterSpacing: '-0.02em' }}>{tabs} tablets</span>
                <span style={{ fontSize: 13, color: KH.body, fontWeight: 600 }}>per dose</span>
              </div>
              <div style={{ fontSize: 12.5, color: KH.body, marginTop: 3 }}>{dosesPerDay === 2 ? 'Twice daily' : `${dosesPerDay}× daily`} × {days} days · <strong style={{ color: KH.ink }}>{total} total</strong></div>
            </div>
          ) : (
            <div style={{ borderRadius: 12, border: `1.5px solid ${KH.red}55`, background: '#FEF3F2', padding: 14 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: KH.red }}>Below {spec.drug.split(' ')[0]} range</div>
              <div style={{ fontSize: 12.5, color: KH.body, marginTop: 2 }}>For &lt; {spec.min_weight ?? 5} kg, refer for specialist dosing.</div>
            </div>
          )}

          <div style={{ fontFamily: KH.mono, fontSize: 9.5, color: KH.muted, marginTop: 11, lineHeight: 1.5 }}>SOURCE · {(spec.source_label ?? '').toUpperCase()}</div>

          <div style={{ display: 'flex', gap: 9, marginTop: 16 }}>
            <button onClick={onClose} style={{ flex: 1, background: KH.surface, color: KH.body, border: `1px solid ${KH.line}`, borderRadius: 11, padding: 12, fontWeight: 600, fontSize: 13.5, cursor: 'pointer', fontFamily: KH.font }}>Close</button>
            {onUse && <button onClick={() => onUse(tabs, total)} disabled={!band} style={{ flex: 1.4, background: band ? KH.cobalt : KH.line, color: band ? '#fff' : KH.muted, border: 0, borderRadius: 11, padding: 12, fontWeight: 600, fontSize: 13.5, cursor: band ? 'pointer' : 'default', fontFamily: KH.font }}>Use this dose</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
