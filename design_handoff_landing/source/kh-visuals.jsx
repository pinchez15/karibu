// Karibu Health landing — product visuals. Real-feeling product UI, not lorem.

// Animated waveform (bars driven by CSS keyframes defined in the host <style>).
function Waveform({ color = '#fff', bars = 28, height = 30, active = true }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, height }}>
      {Array.from({ length: bars }).map((_, i) => (
        <span key={i} className={active ? 'kh-wave' : ''} style={{
          width: 3, borderRadius: 2, background: color,
          height: active ? '100%' : 6,
          animationDelay: `${(i % 9) * 0.09}s`,
          transformOrigin: 'center',
          opacity: 0.5 + (Math.sin(i * 1.7) + 1) * 0.25,
        }}/>
      ))}
    </div>
  );
}

// Android phone frame.
function Phone({ children, w = 300, accent = KH.cobalt, statusInk = KH.ink, statusBg = '#fff', label }) {
  const h = Math.round(w * 2.06);
  return (
    <div style={{ width: w, height: h, borderRadius: w * 0.12, background: '#0d1326',
      boxShadow: `0 2px 4px rgba(11,20,82,.18), 0 30px 70px rgba(11,20,82,.28), inset 0 0 0 ${w*0.012}px #20294a`,
      padding: w * 0.025, position: 'relative', flexShrink: 0 }}>
      <div style={{ width: '100%', height: '100%', borderRadius: w * 0.097, overflow: 'hidden', background: statusBg, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {/* status bar */}
        <div style={{ height: w * 0.105, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `0 ${w*0.055}px`, color: statusInk, flexShrink: 0 }}>
          <span style={{ fontFamily: KH.mono, fontSize: w * 0.043, fontWeight: 600 }}>9:41</span>
          <span style={{ display: 'flex', gap: w*0.018, alignItems: 'center', opacity: 0.8 }}>
            <span style={{ fontFamily: KH.mono, fontSize: w*0.034 }}>4G</span>
            <span style={{ width: w*0.05, height: w*0.028, borderRadius: 2, border: `1.4px solid ${statusInk}`, position: 'relative' }}><span style={{ position: 'absolute', inset: 1.4, right: w*0.018, background: statusInk, borderRadius: 1 }}/></span>
          </span>
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>{children}</div>
        {/* camera dot */}
        <div style={{ position: 'absolute', top: w*0.045, left: '50%', transform: 'translateX(-50%)', width: w*0.022, height: w*0.022, borderRadius: 999, background: '#20294a' }}/>
      </div>
    </div>
  );
}

// HERO visual — Karibu EHR mid-dictation, with floating AI + saved cards.
function HeroEHR() {
  return (
    <div style={{ position: 'relative', width: 332, margin: '0 auto' }}>
      <Phone w={300} statusBg="#fff" statusInk={KH.ink}>
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: KH.bg }}>
          {/* cobalt app header */}
          <div style={{ background: KH.cobaltInk, color: '#fff', padding: '11px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <KMark size={18} color="#fff" fg={KH.cobalt} />
              <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: '-0.01em' }}>Karibu<span style={{ opacity: 0.65, fontWeight: 500 }}>.health</span></span>
              <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: KH.mono, fontSize: 9, color: 'rgba(255,255,255,.6)' }}><span style={{ width: 5, height: 5, borderRadius: 999, background: KH.green }}/>OFFLINE OK</span>
            </div>
          </div>
          {/* patient strip */}
          <div style={{ background: '#fff', padding: '9px 14px', borderBottom: `1px solid ${KH.line}`, display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: KH.cobaltSoft, color: KH.cobalt, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>NS</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: KH.ink }}>Nakato Sarah <span style={{ fontWeight: 400, color: KH.muted, fontFamily: KH.mono, fontSize: 10 }}>34F</span></div>
              <div style={{ fontFamily: KH.mono, fontSize: 9, color: KH.muted, letterSpacing: '.03em' }}>PT-100015 · VISIT 09:42</div>
            </div>
          </div>

          {/* dictation stage */}
          <div style={{ flex: 1, padding: 14, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontFamily: KH.mono, fontSize: 9.5, fontWeight: 600, letterSpacing: '.06em', color: KH.muted, marginBottom: 8 }}>POST-VISIT NOTE</div>

            {/* recording card */}
            <div style={{ background: KH.cobalt, borderRadius: 13, padding: 14, color: '#fff', boxShadow: '0 8px 22px rgba(31,54,199,.28)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: '#fff' }} className="kh-rec-dot"/>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Recording</span>
                <span style={{ marginLeft: 'auto', fontFamily: KH.mono, fontSize: 12, opacity: 0.9 }}>0:47</span>
              </div>
              <Waveform color="rgba(255,255,255,.9)" height={28} bars={26} />
              <div style={{ fontSize: 11.5, lineHeight: 1.5, marginTop: 12, color: 'rgba(255,255,255,.92)' }}>
                “…three days of fever and headache, RDT positive for falciparum, started on AL four tablets twice daily…”
              </div>
            </div>

            {/* mic button */}
            <div style={{ display: 'flex', justifyContent: 'center', margin: '16px 0 14px' }}>
              <div style={{ position: 'relative', width: 58, height: 58 }}>
                <span className="kh-mic-ring" style={{ position: 'absolute', inset: 0, borderRadius: 999, border: `2px solid ${KH.cobalt}` }}/>
                <div style={{ position: 'absolute', inset: 0, borderRadius: 999, background: KH.cobalt, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: '0 6px 16px rgba(31,54,199,.32)' }}>
                  <Icon name="mic" size={24} />
                </div>
              </div>
            </div>

            {/* structured preview rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {[['S', 'Fever ×3d, headache, weakness'], ['O', 'T 38.4 · RDT +ve P. falciparum'], ['A', 'Uncomplicated malaria — B54']].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#fff', border: `1px solid ${KH.line}`, borderRadius: 9, padding: '8px 10px' }}>
                  <span style={{ width: 18, height: 18, borderRadius: 5, background: KH.cobaltSoft, color: KH.cobalt, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: KH.mono, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{k}</span>
                  <span style={{ fontSize: 11, color: KH.body, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Phone>

      {/* floating: AI structuring (amber — reserved) */}
      <div className="kh-float kh-float-a" style={{ position: 'absolute', top: 120, left: -70, background: '#fff', borderRadius: 12, padding: '11px 13px', boxShadow: '0 16px 40px rgba(11,20,82,.16)', border: `1px solid ${KH.line}`, width: 196 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: KH.amber, marginBottom: 5 }}>
          <Icon name="sparkle" size={14} /><span style={{ fontFamily: KH.mono, fontSize: 9.5, fontWeight: 700, letterSpacing: '.05em', whiteSpace: 'nowrap' }}>AI STRUCTURING</span>
        </div>
        <div style={{ fontSize: 11.5, color: KH.body, lineHeight: 1.45 }}>Turning your dictation into a clean SOAP note.</div>
      </div>

      {/* floating: saved/synced (green) */}
      <div className="kh-float kh-float-b" style={{ position: 'absolute', bottom: 86, right: -56, background: '#fff', borderRadius: 12, padding: '11px 13px', boxShadow: '0 16px 40px rgba(11,20,82,.16)', border: `1px solid ${KH.line}`, width: 170 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 26, height: 26, borderRadius: 8, background: KH.greenSoft, color: KH.green, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="check" size={15} /></span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: KH.ink }}>Note saved</div>
            <div style={{ fontFamily: KH.mono, fontSize: 9.5, color: KH.muted }}>2 min · syncs later</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Coral Learn phone — compact, for the Learn section.
function PhoneLearn() {
  return (
    <Phone w={264} statusBg="#fff" statusInk="#fff">
      <div style={{ height: '100%', background: KH.coralGrad, color: '#fff', display: 'flex', flexDirection: 'column', padding: '18px 18px 0', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-14%', right: '-20%', width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,.3), transparent 62%)' }}/>
        <div style={{ position: 'relative' }}>
          <KLockup size={22} markColor="#fff" markFg={KH.coral} textColor="#fff" suffix=".learn" suffixColor="rgba(255,255,255,.72)" />
        </div>
        <div style={{ position: 'relative', marginTop: 'auto', paddingBottom: 0 }}>
          <div style={{ fontFamily: KH.mono, fontSize: 9.5, letterSpacing: '.08em', opacity: .85, marginBottom: 8 }}>CASE · FEBRILE ILLNESS</div>
          <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.12 }}>Fever and headache, 3 days</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <span style={{ background: '#fff', color: KH.coralDeep, fontWeight: 700, fontSize: 12, padding: '8px 14px', borderRadius: 9, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="learn" size={14} /> Start case</span>
            <span style={{ fontFamily: KH.mono, fontSize: 10, opacity: .9 }}>12 min · CME</span>
          </div>
        </div>
        {/* bottom sheet peek */}
        <div style={{ position: 'relative', marginTop: 16, background: '#fff', borderRadius: '14px 14px 0 0', padding: 14, color: KH.ink, marginInline: -18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: KH.coralDeep, marginBottom: 6 }}><Icon name="sparkle" size={13} /><span style={{ fontFamily: KH.mono, fontSize: 8.5, fontWeight: 700, letterSpacing: '.06em' }}>LEARN COACH</span></div>
          <div style={{ fontSize: 12, color: KH.body, lineHeight: 1.45 }}>Decide what to ask, what to test, and what to treat — the way you would on a busy morning.</div>
        </div>
      </div>
    </Phone>
  );
}

Object.assign(window, { Waveform, Phone, HeroEHR, PhoneLearn });
