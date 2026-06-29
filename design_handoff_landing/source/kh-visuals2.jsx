// Karibu Health landing — secondary product visuals.

// "Works on any Android, scales to the whole clinic" — phone, tablet, laptop.
function DeviceScale() {
  const Screen = ({ children, ar = '1' }) => (
    <div style={{ width: '100%', aspectRatio: ar, background: KH.bg, borderRadius: 6, overflow: 'hidden', border: `1px solid ${KH.line}` }}>{children}</div>
  );
  const MiniHeader = ({ small }) => (
    <div style={{ background: KH.cobaltInk, color: '#fff', padding: small ? '5px 7px' : '7px 10px', display: 'flex', alignItems: 'center', gap: 5 }}>
      <KMark size={small ? 11 : 14} color="#fff" fg={KH.cobalt} />
      <span style={{ fontWeight: 700, fontSize: small ? 8 : 10 }}>Karibu<span style={{ opacity: .6, fontWeight: 500 }}>.health</span></span>
    </div>
  );
  const rows = (n, w) => (
    <div style={{ padding: w ? 8 : 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 14, height: 14, borderRadius: 4, background: KH.cobaltSoft, flexShrink: 0 }}/>
          <span style={{ height: 5, borderRadius: 3, background: KH.line, flex: 1, maxWidth: `${70 - i * 8}%` }}/>
        </div>
      ))}
    </div>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 26 }}>
      {/* phone */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 84, height: 172, background: '#0d1326', borderRadius: 14, padding: 5, boxShadow: '0 16px 36px rgba(11,20,82,.20)' }}>
          <div style={{ width: '100%', height: '100%', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
            <MiniHeader small /><div style={{ padding: 5 }}>{rows(5)}</div>
          </div>
        </div>
        <div style={{ fontFamily: KH.mono, fontSize: 10, color: KH.muted, marginTop: 12, letterSpacing: '.04em' }}>PHONE</div>
        <div style={{ fontSize: 12, color: KH.body, fontWeight: 500 }}>Any Android</div>
      </div>
      {/* tablet */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 150, height: 200, background: '#0d1326', borderRadius: 14, padding: 6, boxShadow: '0 16px 36px rgba(11,20,82,.20)' }}>
          <div style={{ width: '100%', height: '100%', borderRadius: 9, overflow: 'hidden', background: '#fff' }}>
            <MiniHeader /><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, padding: 7 }}>{rows(3)}{rows(3)}</div>
          </div>
        </div>
        <div style={{ fontFamily: KH.mono, fontSize: 10, color: KH.muted, marginTop: 12, letterSpacing: '.04em' }}>TABLET</div>
        <div style={{ fontSize: 12, color: KH.body, fontWeight: 500 }}>Triage & front desk</div>
      </div>
      {/* laptop */}
      <div style={{ textAlign: 'center' }}>
        <div>
          <div style={{ width: 256, height: 158, background: '#0d1326', borderRadius: '10px 10px 0 0', padding: 6, boxShadow: '0 16px 36px rgba(11,20,82,.20)' }}>
            <div style={{ width: '100%', height: '100%', borderRadius: 5, overflow: 'hidden', background: '#fff', display: 'flex' }}>
              <div style={{ width: 54, background: KH.cobaltInk }}/>
              <div style={{ flex: 1 }}><MiniHeader /><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, padding: 7 }}>{rows(2)}{rows(2)}{rows(2)}</div></div>
            </div>
          </div>
          <div style={{ width: 290, height: 9, marginLeft: -17, background: 'linear-gradient(180deg,#cbd2e6,#aeb7d4)', borderRadius: '0 0 8px 8px' }}/>
        </div>
        <div style={{ fontFamily: KH.mono, fontSize: 10, color: KH.muted, marginTop: 12, letterSpacing: '.04em' }}>LAPTOP</div>
        <div style={{ fontSize: 12, color: KH.body, fontWeight: 500 }}>Full clinic dashboard</div>
      </div>
    </div>
  );
}

// "A continuous record means better care" — a patient's visit timeline.
function RecordTimeline() {
  const visits = [
    { d: '07 May', t: 'Malaria · B54', meta: 'AL prescribed · RDT +ve', tone: 'cobalt' },
    { d: '02 Mar', t: 'Antenatal · 2nd visit', meta: 'BP 118/76 · 24 wks', tone: 'slate' },
    { d: '14 Jan', t: 'Upper resp. infection', meta: 'Symptomatic care', tone: 'slate' },
  ];
  return (
    <div style={{ background: '#fff', border: `1px solid ${KH.line}`, borderRadius: 16, padding: 22, boxShadow: '0 1px 2px rgba(11,20,82,.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: KH.cobaltSoft, color: KH.cobalt, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>NS</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: KH.ink }}>Nakato Sarah</div>
          <div style={{ fontFamily: KH.mono, fontSize: 11, color: KH.muted }}>PT-100015 · 34F · 3 visits</div>
        </div>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, background: KH.greenSoft, color: KH.green, fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 999 }}><Icon name="check" size={12} /> One record</span>
      </div>
      <div style={{ position: 'relative', paddingLeft: 22 }}>
        <div style={{ position: 'absolute', left: 5, top: 6, bottom: 6, width: 2, background: KH.line }}/>
        {visits.map((v, i) => {
          const c = v.tone === 'cobalt' ? KH.cobalt : KH.slate;
          return (
            <div key={i} style={{ position: 'relative', paddingBottom: i < visits.length - 1 ? 16 : 0 }}>
              <span style={{ position: 'absolute', left: -22, top: 3, width: 12, height: 12, borderRadius: 999, background: '#fff', border: `3px solid ${c}` }}/>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontFamily: KH.mono, fontSize: 11, color: KH.muted, width: 48, flexShrink: 0 }}>{v.d}</span>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: KH.ink }}>{v.t}</div>
                  <div style={{ fontSize: 12, color: KH.muted, marginTop: 1 }}>{v.meta}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { DeviceScale, RecordTimeline });
