// Karibu Health landing — EHR deep-dive, Learn section, mission band, final CTA.

// Alternating feature row: copy on one side, visual on the other.
function FeatureRow({ flip, eyebrow, title, body, points, visual, accent = KH.cobalt }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 56, alignItems: 'center' }} className="kh-feat-row">
      <Reveal style={{ order: flip ? 2 : 1 }} className={flip ? 'kh-feat-copy-flip' : ''}>
        <Eyebrow color={accent}>{eyebrow}</Eyebrow>
        <h3 style={{ fontSize: 'clamp(26px, 2.6vw, 34px)', fontWeight: 600, letterSpacing: '-0.025em', color: KH.ink, margin: '14px 0 0', lineHeight: 1.12 }}>{title}</h3>
        <p style={{ fontSize: 16.5, color: KH.body, lineHeight: 1.6, margin: '16px 0 0', maxWidth: 460, textWrap: 'pretty' }}>{body}</p>
        {points && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 22 }}>
            {points.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 7, background: accent + '14', color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}><Icon name="check" size={13} /></span>
                <span style={{ fontSize: 14.5, color: KH.body, lineHeight: 1.45 }}>{p}</span>
              </div>
            ))}
          </div>
        )}
      </Reveal>
      <Reveal delay={120} style={{ order: flip ? 1 : 2, display: 'flex', justifyContent: 'center' }}>{visual}</Reveal>
    </div>
  );
}

// Dictation flow visual — voice → transcript → structured SOAP note.
function DictationFlow() {
  return (
    <div style={{ width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* voice */}
      <div style={{ background: KH.cobalt, borderRadius: 14, padding: 16, color: '#fff', boxShadow: '0 14px 34px rgba(31,54,199,.24)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,.16)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="mic" size={19} color="#fff" /></span>
          <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600 }}>You speak, after the visit</div><div style={{ fontFamily: KH.mono, fontSize: 10.5, opacity: .85 }}>0:47 · ENGLISH</div></div>
          <Waveform color="rgba(255,255,255,.85)" height={24} bars={14} />
        </div>
      </div>
      {/* connector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 8 }}>
        <span style={{ width: 2, height: 14, background: KH.line }}/>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: KH.amber, fontFamily: KH.mono, fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em' }}><Icon name="sparkle" size={13} /> AI STRUCTURES IT</span>
      </div>
      {/* SOAP note */}
      <div style={{ background: '#fff', border: `1px solid ${KH.line}`, borderRadius: 14, padding: 16, boxShadow: '0 1px 2px rgba(11,20,82,.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontFamily: KH.mono, fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', color: KH.muted }}>SOAP NOTE · DRAFT</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: KH.amberSoft, color: KH.amberInk, fontSize: 10.5, fontWeight: 600, padding: '3px 9px', borderRadius: 999 }}><Icon name="sparkle" size={11} /> AI structured</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {[['S', 'Fever and headache ×3 days, generalised weakness. Took paracetamol with little relief.'], ['O', 'T 38.4 °C · BP 128/82 · RDT positive, P. falciparum.'], ['A', 'Uncomplicated malaria (B54).'], ['P', 'Artemether-lumefantrine 4 tabs BD ×3d. Return if vomiting or confusion.']].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 10 }}>
              <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 6, background: KH.cobaltSoft, color: KH.cobalt, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: KH.mono, fontSize: 11, fontWeight: 700 }}>{k}</span>
              <span style={{ fontSize: 13, color: KH.body, lineHeight: 1.5 }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <span style={{ flex: 1, textAlign: 'center', background: KH.cobalt, color: '#fff', fontSize: 13, fontWeight: 600, padding: '9px 0', borderRadius: 9 }}>Sign and save</span>
          <span style={{ textAlign: 'center', background: '#fff', color: KH.body, border: `1px solid ${KH.line}`, fontSize: 13, fontWeight: 600, padding: '9px 16px', borderRadius: 9 }}>Edit</span>
        </div>
      </div>
    </div>
  );
}

function EHRSection() {
  return (
    <section id="ehr" style={{ background: KH.page, padding: '92px 0', borderTop: `1px solid ${KH.line}` }}>
      <Container>
        <Reveal style={{ maxWidth: 680, marginBottom: 64 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, marginBottom: 18 }}>
            <KMark size={30} color={KH.cobalt} />
            <span style={{ fontFamily: KH.mono, fontSize: 12, fontWeight: 600, letterSpacing: '.1em', color: KH.cobalt }}>KARIBU EHR</span>
          </div>
          <h2 style={{ fontSize: 'clamp(32px, 3.6vw, 46px)', fontWeight: 600, letterSpacing: '-0.03em', color: KH.ink, margin: 0, lineHeight: 1.06 }}>Documentation that keeps up with your clinic.</h2>
          <p style={{ fontSize: 18, color: KH.body, lineHeight: 1.6, margin: '18px 0 0', textWrap: 'pretty' }}>
            Built for a clinic where one clinician sees forty patients a day. Karibu EHR fits the pace you already work — and gives every patient a record that follows them.
          </p>
        </Reveal>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 88 }}>
          <FeatureRow
            eyebrow="Dictate, don't type"
            title="A full visit note in minutes — just speak."
            body="After the patient leaves, dictate what happened in plain words. Karibu’s assistant turns it into a structured SOAP note you review and sign. The note saves whether or not the AI runs — it never blocks your work."
            points={['Speak in English; get a clean clinical note back.', 'You stay in control — review and sign every note.', 'Suggests the HMIS diagnosis code automatically.']}
            visual={<DictationFlow />}
          />
          <FeatureRow flip
            eyebrow="Any phone, whole clinic"
            title="Works on any Android. Scales to the whole clinic."
            body="Start on the phone already in your pocket — no new hardware, no computer required. As your clinic grows, the same record opens on tablets at triage and laptops at the front desk."
            points={['No procurement needed to begin.', 'One patient record across every device.', 'Designed for low bandwidth and basic data plans.']}
            visual={<div style={{ width: '100%', display: 'flex', justifyContent: 'center', padding: '8px 0' }}><DeviceScale /></div>}
          />
          <FeatureRow
            eyebrow="One continuous record"
            title="A record that follows the patient — so care does too."
            body="Every visit builds on the last. When a patient returns, their history is already there: past diagnoses, prescriptions, and results in one timeline. Continuity is what turns documentation into better care."
            points={['Past visits, medications and results in one place.', 'Available even when the network isn’t.', 'Cleaner HMIS 105 reporting, generated from real visits.']}
            visual={<div style={{ width: '100%', maxWidth: 420 }}><RecordTimeline /></div>}
          />
        </div>

        {/* essentials — editorial strip, not a card grid */}
        <Reveal>
          <div style={{ marginTop: 64, paddingTop: 36, borderTop: `1px solid ${KH.line}`, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0 }} className="kh-mini-grid">
            {[['wifi', 'Offline-first', 'Every visit saves on the device and syncs when the network returns — nothing is lost to a dropped connection.'],
              ['pulse', 'Receipts at discharge', 'Each visit prints a thermal receipt: diagnosis, medicines, and what to watch for at home.'],
              ['shield', 'Guideline-aligned', 'Coding and dosing follow the Uganda Clinical Guidelines, so the record holds up to scrutiny.']].map(([ic, t, d], i) => (
              <div key={t} style={{ paddingLeft: i ? 32 : 0, paddingRight: 24, borderLeft: i ? `1px solid ${KH.lineSoft}` : 'none' }}>
                <Icon name={ic} size={22} color={KH.cobalt} />
                <h4 style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em', color: KH.ink, margin: '14px 0 6px' }}>{t}</h4>
                <p style={{ fontSize: 14, color: KH.body, lineHeight: 1.55, margin: 0 }}>{d}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

function LearnSection() {
  return (
    <section id="learn" style={{ padding: '92px 0', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: '10%', right: -180, width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle, rgba(251,77,91,.07), transparent 62%)', pointerEvents: 'none' }}/>
      <Container style={{ position: 'relative' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 56, alignItems: 'center' }} className="kh-feat-row">
          <Reveal style={{ display: 'flex', justifyContent: 'center' }}>
            <PhoneLearn />
          </Reveal>
          <Reveal delay={100}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, marginBottom: 18 }}>
              <KMark size={30} color={KH.coral} />
              <span style={{ fontFamily: KH.mono, fontSize: 12, fontWeight: 600, letterSpacing: '.1em', color: KH.coralDeep }}>KARIBU LEARN</span>
            </div>
            <h2 style={{ fontSize: 'clamp(30px, 3.4vw, 42px)', fontWeight: 600, letterSpacing: '-0.03em', color: KH.ink, margin: 0, lineHeight: 1.08 }}>Practice the real thing — for free.</h2>
            <p style={{ fontSize: 17, color: KH.body, lineHeight: 1.6, margin: '18px 0 0', maxWidth: 460, textWrap: 'pretty' }}>
              Karibu Learn is a free continuing-education tool. Work realistic cases inside a faithful copy of the EHR — make the calls, see what happens, and sharpen the judgment that protects patients. Every patient is generated; no real data, ever.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: '22px 0 28px' }}>
              {['Real cases, written by Ugandan clinicians.', 'Earn CME credit on any phone — no account needed.', 'The same interface you’ll use in the clinic.'].map((p, i) => (
                <div key={i} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                  <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 7, background: KH.coralSoft, color: KH.coralDeep, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}><Icon name="check" size={13} /></span>
                  <span style={{ fontSize: 14.5, color: KH.body, lineHeight: 1.45 }}>{p}</span>
                </div>
              ))}
            </div>
            <Btn kind="primary" size="lg" accent={KH.coral} href="#learn" iconRight="arrow">Start learning — free</Btn>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}

// Dark mission band — the one dramatic moment.
function MissionBand() {
  return (
    <section id="why" style={{ background: KH.cobaltInk, color: '#fff', padding: '96px 0', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '26px 26px', maskImage: 'radial-gradient(120% 90% at 70% 0%, #000 35%, transparent 75%)', WebkitMaskImage: 'radial-gradient(120% 90% at 70% 0%, #000 35%, transparent 75%)', pointerEvents: 'none' }}/>
      <div style={{ position: 'absolute', top: -200, left: '30%', width: 700, height: 700, borderRadius: '50%', background: 'radial-gradient(circle, rgba(31,54,199,.35), transparent 60%)', pointerEvents: 'none' }}/>
      <Container style={{ position: 'relative' }}>
        <Reveal style={{ maxWidth: 760 }}>
          <Eyebrow color="rgba(255,255,255,.55)">Built in Uganda</Eyebrow>
          <h2 style={{ fontSize: 'clamp(32px, 4vw, 50px)', fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.08, margin: '16px 0 0' }}>
            Made for Ugandan clinics from the very first step — not adapted to them after the fact.
          </h2>
          <p style={{ fontSize: 18, color: 'rgba(255,255,255,.74)', lineHeight: 1.6, margin: '20px 0 0', maxWidth: 620 }}>
            Most health software is built elsewhere and shipped here. Karibu started in the clinic: on the phones clinicians carry, on the bandwidth they have, at the pace they work. Every decision serves the patient in the room.
          </p>
        </Reveal>
        <Reveal delay={100}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 28, marginTop: 56 }} className="kh-stat-grid">
            {[['Phone-first', 'No computer required to run a clinic'], ['Offline-first', 'Care continues when the network drops'], ['Minutes', 'To document a full visit by voice'], ['One record', 'That follows every patient']].map(([a, b], i) => (
              <div key={i} style={{ borderTop: '2px solid rgba(255,255,255,.18)', paddingTop: 18 }}>
                <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em' }}>{a}</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,.66)', marginTop: 6, lineHeight: 1.5 }}>{b}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

// Final CTA + apply.
function FinalCTA() {
  const [sent, setSent] = React.useState(false);
  return (
    <section id="apply" style={{ padding: '92px 0' }}>
      <Container w={980}>
        <Reveal>
          <div style={{ background: '#fff', border: `1px solid ${KH.line}`, borderRadius: 24, overflow: 'hidden', display: 'grid', gridTemplateColumns: '1.1fr 1fr', boxShadow: '0 24px 60px rgba(11,20,82,.08)' }} className="kh-apply-grid">
            <div style={{ padding: 40 }}>
              <Eyebrow color={KH.cobalt}>Bring Karibu to your clinic</Eyebrow>
              <h2 style={{ fontSize: 'clamp(26px, 2.8vw, 34px)', fontWeight: 600, letterSpacing: '-0.025em', color: KH.ink, margin: '14px 0 0', lineHeight: 1.1 }}>Start documenting in minutes, not hours.</h2>
              <p style={{ fontSize: 15.5, color: KH.body, lineHeight: 1.6, margin: '14px 0 24px' }}>
                Karibu EHR is provisioned per facility, with onboarding and device support. Tell us about your clinic and the team will be in touch within two working days.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[['phone', 'Works on the Android phones you already have'], ['shield', 'Your data stays in the patient record'], ['learn', 'Free Karibu Learn for your whole team']].map(([ic, t]) => (
                  <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, color: KH.body }}>
                    <Icon name={ic} size={16} color={KH.cobalt} /> {t}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ padding: 40, background: KH.bg, borderLeft: `1px solid ${KH.line}` }}>
              {!sent ? (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {[['Facility name', 'Susunga HC III'], ['District', 'Mityana'], ['Your role', 'In-charge / Clinical officer'], ['Phone', '+256 7…']].map(([l, ph]) => (
                      <label key={l} style={{ display: 'block' }}>
                        <span style={{ fontFamily: KH.mono, fontSize: 10.5, fontWeight: 600, letterSpacing: '.05em', color: KH.muted, textTransform: 'uppercase' }}>{l}</span>
                        <input placeholder={ph} style={{ width: '100%', marginTop: 5, padding: '11px 13px', borderRadius: 10, border: `1px solid ${KH.line}`, background: '#fff', color: KH.ink, fontFamily: KH.font, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                          onFocus={e => { e.target.style.borderColor = KH.cobalt; e.target.style.boxShadow = `0 0 0 4px ${KH.cobaltSoft}`; }}
                          onBlur={e => { e.target.style.borderColor = KH.line; e.target.style.boxShadow = 'none'; }} />
                      </label>
                    ))}
                  </div>
                  <Btn kind="primary" size="lg" accent={KH.cobalt} style={{ width: '100%', marginTop: 18 }} onClick={() => setSent(true)}>Send application</Btn>
                </>
              ) : (
                <div style={{ height: '100%', minHeight: 280, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 58, height: 58, borderRadius: 999, background: KH.greenSoft, color: KH.green, marginBottom: 16 }}><Icon name="check" size={26} /></span>
                  <h3 style={{ fontSize: 20, fontWeight: 600, color: KH.ink, margin: '0 0 6px' }}>Application sent</h3>
                  <p style={{ fontSize: 14, color: KH.body, lineHeight: 1.55, margin: 0, maxWidth: 240 }}>The Karibu team replies within two working days.</p>
                </div>
              )}
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

Object.assign(window, { FeatureRow, DictationFlow, EHRSection, LearnSection, MissionBand, FinalCTA });
