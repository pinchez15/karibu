// Karibu Health landing — hero + two-app split.

function Hero() {
  return (
    <section id="top" style={{ position: 'relative', overflow: 'hidden' }}>
      {/* subtle cobalt glow, top-right */}
      <div style={{ position: 'absolute', top: -260, right: -160, width: 720, height: 720, borderRadius: '50%', background: 'radial-gradient(circle, rgba(31,54,199,.10), transparent 60%)', pointerEvents: 'none' }}/>
      <div style={{ position: 'absolute', top: -120, left: -200, width: 560, height: 560, borderRadius: '50%', background: 'radial-gradient(circle, rgba(251,77,91,.06), transparent 62%)', pointerEvents: 'none' }}/>
      <Container style={{ position: 'relative', paddingTop: 72, paddingBottom: 96 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 48, alignItems: 'center' }} className="kh-hero-grid">
          {/* copy */}
          <div>
            <Reveal>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#fff', border: `1px solid ${KH.line}`, borderRadius: 999, padding: '6px 14px 6px 8px', boxShadow: '0 1px 2px rgba(11,20,82,.04)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: KH.cobaltSoft, color: KH.cobalt, borderRadius: 999, padding: '3px 9px', fontFamily: KH.mono, fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em' }}>KARIBU HEALTH</span>
                <span style={{ fontSize: 12.5, color: KH.body, fontWeight: 500 }}>Two apps. One mission.</span>
              </div>
            </Reveal>
            <Reveal delay={70}>
              <h1 style={{ fontSize: 'clamp(40px, 5vw, 64px)', fontWeight: 600, letterSpacing: '-0.035em', lineHeight: 1.02, color: KH.ink, margin: '24px 0 0' }}>
                Clinical software for Uganda, built from the&nbsp;first&nbsp;step.
              </h1>
            </Reveal>
            <Reveal delay={130}>
              <p style={{ fontSize: 'clamp(16px, 1.4vw, 19px)', lineHeight: 1.6, color: KH.body, margin: '22px 0 0', maxWidth: 520, textWrap: 'pretty' }}>
                <strong style={{ color: KH.ink, fontWeight: 600 }}>Karibu EHR</strong> runs your clinic. <strong style={{ color: KH.ink, fontWeight: 600 }}>Karibu Learn</strong> trains the people in it. Both made for how care actually happens here — on the phones you already carry, at the pace you already work.
              </p>
            </Reveal>
            <Reveal delay={190}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 32, flexWrap: 'wrap' }}>
                <Btn kind="primary" size="lg" href="#ehr" accent={KH.cobalt} iconRight="arrow">Explore Karibu EHR</Btn>
                <Btn kind="ghost" size="lg" href="#learn" icon="learn" style={{ color: KH.coralDeep, borderColor: KH.coral + '40' }}>Try Karibu Learn — free</Btn>
              </div>
            </Reveal>
            <Reveal delay={250}>
              <div style={{ display: 'flex', gap: 22, marginTop: 34, flexWrap: 'wrap' }}>
                {[['phone', 'Runs on any Android'], ['wifi', 'Works offline'], ['shield', 'Aligned to UCG 2023']].map(([ic, t]) => (
                  <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: KH.body, fontWeight: 500 }}>
                    <Icon name={ic} size={17} color={KH.cobalt} /> {t}
                  </span>
                ))}
              </div>
            </Reveal>
          </div>

          {/* hero product visual */}
          <Reveal delay={160} style={{ display: 'flex', justifyContent: 'center' }}>
            <HeroEHR />
          </Reveal>
        </div>
      </Container>
    </section>
  );
}

// Thin credibility strip beneath the hero.
function TrustStrip() {
  const items = [
    ['Built with', 'Ugandan clinicians'],
    ['Designed for', 'HC II – HC IV'],
    ['Documentation in', 'minutes, not hours'],
    ['Patient data', 'never leaves the record'],
  ];
  return (
    <div style={{ borderTop: `1px solid ${KH.line}`, borderBottom: `1px solid ${KH.line}`, background: '#fff' }}>
      <Container>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, padding: '26px 0' }} className="kh-trust-grid">
          {items.map(([a, b], i) => (
            <div key={i} style={{ borderLeft: i ? `1px solid ${KH.lineSoft}` : 'none', paddingLeft: i ? 24 : 0 }}>
              <div style={{ fontFamily: KH.mono, fontSize: 11, letterSpacing: '.06em', color: KH.muted, textTransform: 'uppercase' }}>{a}</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: KH.ink, marginTop: 4, letterSpacing: '-0.01em' }}>{b}</div>
            </div>
          ))}
        </div>
      </Container>
    </div>
  );
}

// Two-app split — EHR (cobalt) + Learn (coral).
function ProductSplit() {
  const card = (accent, soft, mark, name, suffix, tagline, points, cta, ctaHref, badge) => (
    <div style={{ position: 'relative', background: '#fff', border: `1px solid ${KH.line}`, borderRadius: 20, padding: 30, overflow: 'hidden', transition: 'transform 200ms ease, box-shadow 200ms ease' }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = `0 22px 50px ${accent}1f`; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
      <div style={{ position: 'absolute', top: -60, right: -60, width: 200, height: 200, borderRadius: '50%', background: `radial-gradient(circle, ${accent}12, transparent 64%)` }}/>
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <KLockup size={30} markColor={mark} textColor={KH.ink} suffix={suffix} suffixColor={accent} />
          <span style={{ fontFamily: KH.mono, fontSize: 10, fontWeight: 700, letterSpacing: '.06em', color: accent, background: soft, padding: '4px 10px', borderRadius: 999 }}>{badge}</span>
        </div>
        <h3 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', color: KH.ink, margin: '20px 0 8px' }}>{tagline}</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11, margin: '18px 0 24px' }}>
          {points.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 6, background: soft, color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}><Icon name="check" size={13} /></span>
              <span style={{ fontSize: 14.5, color: KH.body, lineHeight: 1.45 }}>{p}</span>
            </div>
          ))}
        </div>
        <Btn kind="primary" accent={accent} href={ctaHref} iconRight="arrow">{cta}</Btn>
      </div>
    </div>
  );
  return (
    <section style={{ padding: '88px 0' }}>
      <Container>
        <Reveal style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 48px' }}>
          <Eyebrow style={{ justifyContent: 'center' }}>Two apps, one roof</Eyebrow>
          <h2 style={{ fontSize: 'clamp(30px, 3.4vw, 42px)', fontWeight: 600, letterSpacing: '-0.03em', color: KH.ink, margin: '14px 0 0', lineHeight: 1.08 }}>One umbrella. Two ways in.</h2>
          <p style={{ fontSize: 17, color: KH.body, lineHeight: 1.6, margin: '14px 0 0' }}>
            Whether you’re running a clinic or sharpening your judgment, Karibu meets you where you are.
          </p>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }} className="kh-split-grid">
          <Reveal delay={60}>
            {card(KH.cobalt, KH.cobaltSoft, KH.cobalt, 'Karibu', '.health', 'The EHR that keeps up with your clinic.',
              ['Dictate a visit note in minutes — AI structures it into a clean SOAP note.', 'Runs on any Android, scales to tablets and laptops.', 'A continuous patient record, even offline.'],
              'Explore Karibu EHR', '#ehr', 'PER CLINIC')}
          </Reveal>
          <Reveal delay={120}>
            {card(KH.coral, KH.coralSoft, KH.coral, 'Karibu', '.learn', 'Free training that feels like the real thing.',
              ['Work real cases inside a faithful copy of the EHR.', 'Earn CME credit, on any phone, no account needed.', 'Build judgment that protects patients — for free.'],
              'Try Karibu Learn', '#learn', 'FREE')}
          </Reveal>
        </div>
      </Container>
    </section>
  );
}

Object.assign(window, { Hero, TrustStrip, ProductSplit });
