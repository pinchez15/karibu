// Case walkthrough — the two-colour split IS the concept: faithful cobalt EHR
// on the left, coral KaribuLearn coach on the right (narrates, poses graded
// decisions, teaches). Web mirror of WalkthroughScreen.kt.
'use client';

import React from 'react';
import { KH, KL } from '../lib/tokens';
import { Icon, KMark } from '../lib/icons';
import { Btn, Eyebrow, Meta } from '../lib/ui';
import { ChartFragment } from './ChartFragment';
import { DoseCalc } from './DoseCalc';
import type { LearnCase } from '../lib/types';

export function Walkthrough({ c, showTeaching = true, onExit, onComplete }: {
  c: LearnCase; showTeaching?: boolean; onExit: () => void; onComplete: (score: number, total: number) => void;
}) {
  const steps = c.steps ?? [];
  const [i, setI] = React.useState(0);
  const [answers, setAnswers] = React.useState<Record<number, { choice: number; correct: boolean }>>({});
  const [calcOpen, setCalcOpen] = React.useState(false);
  const scrollRef = React.useRef<HTMLElement>(null);

  if (steps.length === 0) return null;
  const step = steps[i];
  const total = steps.length;
  const decisionTotal = steps.filter((s) => s.kind === 'decision').length;
  const answered = answers[i] !== undefined;
  const revealed = step.kind === 'story' || answered;
  const hasCalc = !!step.chart?.sections.some((s) => s.calculator) && !!c.dose_calc;

  const choose = (oi: number) => {
    if (answered) return;
    setAnswers((a) => ({ ...a, [i]: { choice: oi, correct: !!step.question!.options[oi].correct } }));
  };
  const next = () => {
    if (i < total - 1) { setI(i + 1); scrollRef.current?.scrollTo(0, 0); }
    else onComplete(Object.values(answers).filter((a) => a.correct).length, decisionTotal);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: KL.bg, fontFamily: KH.font }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '11px 20px', background: KL.surface, borderBottom: `1px solid ${KL.line}`, flexShrink: 0 }}>
        <button onClick={onExit} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'transparent', border: 0, color: KL.muted, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: KH.font }}>
          <Icon name="x" size={16} color={KL.muted} /> Exit
        </button>
        <div style={{ width: 1, height: 22, background: KL.line }} />
        <KMark size={22} color={KL.primary} />
        <div style={{ fontSize: 13.5, fontWeight: 700, color: KL.ink, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title}</div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', gap: 5 }}>
            {steps.map((_, si) => <span key={si} style={{ width: si === i ? 22 : 8, height: 8, borderRadius: 999, background: si <= i ? KL.primary : KL.line, transition: 'all 200ms ease' }} />)}
          </div>
          <Meta style={{ color: KL.muted }}>STEP {i + 1} / {total}</Meta>
        </div>
      </header>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 420px', overflow: 'hidden', minHeight: 0 }}>
        {/* EHR stage */}
        <div style={{ overflow: 'auto', borderRight: `1px solid ${KL.line}`, padding: 28, display: 'flex', justifyContent: 'center' }}>
          {step.chart && <div style={{ width: '100%', maxWidth: 560 }}><ChartFragment spec={step.chart} patient={c.patient} revealed={revealed} onCalc={hasCalc ? () => setCalcOpen(true) : undefined} /></div>}
        </div>

        {/* Coach */}
        <aside ref={scrollRef} style={{ overflow: 'auto', background: KL.surface, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '24px 26px', flex: 1 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '4px 10px', borderRadius: 999, background: KL.soft, marginBottom: 18 }}>
              <Icon name="bulb" size={14} color={KL.primary} />
              <span style={{ fontFamily: KH.mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: KL.deep }}>KARIBULEARN COACH</span>
            </div>
            <Eyebrow color={KL.primary} style={{ marginBottom: 8 }}>{step.coach.eyebrow}</Eyebrow>
            <h2 style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2, margin: '0 0 10px', color: KL.ink }}>{step.coach.title}</h2>
            {step.coach.body && <p style={{ fontSize: 14.5, color: KL.body, lineHeight: 1.6, margin: 0 }}>{step.coach.body}</p>}

            {step.coach.quote && (
              <blockquote style={{ margin: '18px 0 0', padding: '14px 16px', borderLeft: `3px solid ${KL.primary}`, background: KL.wash, borderRadius: '0 10px 10px 0', fontSize: 15, fontStyle: 'italic', color: KL.ink, lineHeight: 1.5 }}>{step.coach.quote}</blockquote>
            )}

            {step.kind === 'story' && step.coach.teach && showTeaching && (
              <div style={{ marginTop: 18, padding: '14px 16px', borderRadius: 12, background: KL.soft, border: `1px solid ${KL.primary}26` }}>
                <div style={{ fontFamily: KH.mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: KL.deep, marginBottom: 6, textTransform: 'uppercase' }}>{step.coach.teach.label}</div>
                <div style={{ fontSize: 13.5, color: KL.body, lineHeight: 1.55 }}>{step.coach.teach.text}</div>
              </div>
            )}

            {step.kind === 'decision' && step.question && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: KL.ink, marginBottom: 12 }}>{step.question.prompt}</div>
                {hasCalc && (
                  <button onClick={() => setCalcOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginBottom: 12, background: KH.cobaltSoft, color: KH.cobalt, border: `1px solid ${KH.cobalt}33`, borderRadius: 9, padding: '9px 13px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: KH.font }}>
                    <Icon name="calc" size={15} color={KH.cobalt} /> Open dose calculator
                  </button>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {step.question.options.map((o, oi) => {
                    const mine = answers[i] && answers[i].choice === oi;
                    let bd: string = KL.line, bg: string = KL.surface, col: string = KL.ink;
                    let badge: React.ReactNode = null;
                    if (answered) {
                      if (o.correct) { bd = KH.green; bg = KH.greenSoft; col = KH.green; badge = <Icon name="check" size={13} color={KH.green} />; }
                      else if (mine) { bd = KL.primary; bg = KL.soft; col = KL.deep; badge = <span style={{ fontWeight: 700 }}>×</span>; }
                      else col = KL.muted;
                    }
                    return (
                      <button key={oi} onClick={() => choose(oi)} disabled={answered} style={{ textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', borderRadius: 11, border: `1.5px solid ${bd}`, background: bg, cursor: answered ? 'default' : 'pointer', fontFamily: KH.font, fontSize: 13.5, color: col, lineHeight: 1.45, fontWeight: 500, transition: 'all 120ms ease' }}
                        onMouseEnter={(e) => { if (!answered) { e.currentTarget.style.borderColor = `${KL.primary}88`; e.currentTarget.style.background = KL.wash; } }}
                        onMouseLeave={(e) => { if (!answered) { e.currentTarget.style.borderColor = KL.line; e.currentTarget.style.background = KL.surface; } }}>
                        <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 999, border: `1.5px solid ${answered && (o.correct || mine) ? bd : KL.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: col, marginTop: 1 }}>{badge || String.fromCharCode(65 + oi)}</span>
                        <span>{o.text}</span>
                      </button>
                    );
                  })}
                </div>

                {answered && (
                  <div style={{ marginTop: 14, padding: '14px 16px', borderRadius: 12, background: answers[i].correct ? KH.greenSoft : KL.soft, border: `1px solid ${answers[i].correct ? `${KH.green}44` : `${KL.primary}33`}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                      <Icon name={answers[i].correct ? 'checkCircle' : 'bulb'} size={15} color={answers[i].correct ? KH.green : KL.deep} />
                      <span style={{ fontFamily: KH.mono, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', color: answers[i].correct ? KH.green : KL.deep }}>{answers[i].correct ? 'CORRECT' : "NOT QUITE — HERE'S WHY"}</span>
                    </div>
                    <div style={{ fontSize: 13.5, color: KL.body, lineHeight: 1.55 }}>{answers[i].correct ? step.question.right : step.question.wrong}</div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ position: 'sticky', bottom: 0, padding: '14px 26px', borderTop: `1px solid ${KL.line}`, background: KL.surface, display: 'flex', alignItems: 'center', gap: 12 }}>
            {step.kind === 'decision' && !answered && <span style={{ fontSize: 12.5, color: KL.muted, flex: 1 }}>Choose an answer to continue</span>}
            {(step.kind === 'story' || answered) && (
              <Btn kind="primary" size="lg" full onClick={next} iconRight={<Icon name="arrowRight" size={16} color="#fff" />}>
                {i === total - 1 ? 'Finish case' : step.kind === 'story' ? 'Continue' : 'Next step'}
              </Btn>
            )}
          </div>
        </aside>
      </div>

      {calcOpen && c.dose_calc && <DoseCalc spec={c.dose_calc} onClose={() => setCalcOpen(false)} onUse={() => setCalcOpen(false)} />}
    </div>
  );
}
