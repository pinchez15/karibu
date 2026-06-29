// Karibu Health landing — donor / funder band. Speaks the language of reach,
// continuity, and accountability. Numbers are structural facts (not invented
// outcomes) and count up when scrolled into view.

function CountUp({ to, suffix = '', prefix = '', dur = 1300, decimals = 0 }) {
  const ref = React.useRef(null);
  const [val, setVal] = React.useState(0);
  React.useEffect(() => {
    const el = ref.current; if (!el) return;
    let started = false, timer;
    const run = () => {
      const t0 = Date.now();
      clearInterval(timer);
      timer = setInterval(() => {
        const p = Math.min(1, (Date.now() - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        setVal(to * eased);
        if (p >= 1) { clearInterval(timer); setVal(to); }
      }, 40);
    };
    const inView = () => {
      const r = el.getBoundingClientRect();
      return r.top < (window.innerHeight || 800) * 0.86 && r.bottom > 0;
    };
    const maybeStart = () => { if (!started && inView()) { started = true; run(); detach(); } };
    const onScroll = () => maybeStart();
    function detach() { window.removeEventListener('scroll', onScroll); clearTimeout(t1); }
    window.addEventListener('scroll', onScroll, { passive: true });
    maybeStart();
    const t1 = setTimeout(maybeStart, 320);
    // failsafe: never leave the number stuck at 0
    const failsafe = setTimeout(() => { if (!started) { started = true; setVal(to); } detach(); }, 2400);
    return () => { clearInterval(timer); detach(); clearTimeout(failsafe); };
  }, [to, dur]);
  return <span ref={ref}>{prefix}{val.toFixed(decimals)}{suffix}</span>;
}

function ImpactBand() {
  const stats = [
    { to: 5, suffix: '', label: 'clinical roles on one shared record' },
    { to: 0, suffix: '', label: 'computers needed to run a clinic' },
    { to: 100, suffix: '%', label: 'of visits feed HMIS 105 reporting' },
    { to: 1, suffix: '', label: 'continuous record per patient, for life' },
  ];
  const pillars = [
    ['phone', 'Reach, not hardware', 'Karibu runs on the Android phones clinicians already carry. Adding a clinic costs a login, not a procurement cycle — so every dollar reaches further.'],
    ['layers', 'Continuity becomes outcomes', 'One record follows the patient across every role and every visit. Fewer gaps, fewer repeats, safer care — the difference a funded system is meant to make.'],
    ['trending', 'Every visit becomes data', 'Clean HMIS 105 reporting is generated from real visits, giving clinics and districts the accountability and public-health signal that paper can’t.'],
  ];
  return (
    <section id="impact" style={{ padding: '96px 0' }}>
      <Container>
        <div style={{ display: 'grid', gridTemplateColumns: '0.95fr 1.05fr', gap: 56, alignItems: 'start' }} className="kh-impact-grid">
          <Reveal>
            <Eyebrow color={KH.slate}>Why it matters</Eyebrow>
            <h2 style={{ fontSize: 'clamp(30px, 3.6vw, 46px)', fontWeight: 600, letterSpacing: '-0.03em', color: KH.ink, margin: '14px 0 0', lineHeight: 1.06, textWrap: 'balance' }}>
              Software that makes every shilling of care go further.
            </h2>
            <p style={{ fontSize: 17.5, color: KH.body, lineHeight: 1.6, margin: '18px 0 0', maxWidth: 460, textWrap: 'pretty' }}>
              Built so the smallest HC II and a busy HC IV run on the same record — and so the people funding better care can see it compound.
            </p>
            {/* animated stat grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, marginTop: 32, background: KH.line, border: `1px solid ${KH.line}`, borderRadius: 16, overflow: 'hidden' }}>
              {stats.map((s, i) => (
                <div key={i} style={{ background: '#fff', padding: '22px 20px' }}>
                  <div style={{ fontSize: 38, fontWeight: 600, letterSpacing: '-0.03em', color: KH.cobalt, lineHeight: 1 }}>
                    <CountUp to={s.to} suffix={s.suffix} />
                  </div>
                  <div style={{ fontSize: 13, color: KH.body, lineHeight: 1.45, marginTop: 8 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </Reveal>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {pillars.map(([ic, t, d], i) => (
              <Reveal key={t} delay={i * 90}>
                <div style={{ display: 'flex', gap: 18, padding: '22px 24px', background: '#fff', border: `1px solid ${KH.line}`, borderRadius: 16, boxShadow: '0 1px 2px rgba(11,20,82,.04)' }}>
                  <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 46, height: 46, borderRadius: 12, background: KH.cobaltSoft, color: KH.cobalt }}><Icon name={ic} size={22} /></span>
                  <div>
                    <h4 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', color: KH.ink, margin: '2px 0 6px' }}>{t}</h4>
                    <p style={{ fontSize: 14.5, color: KH.body, lineHeight: 1.55, margin: 0 }}>{d}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}

Object.assign(window, { CountUp, ImpactBand });
