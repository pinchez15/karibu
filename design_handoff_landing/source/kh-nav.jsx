// Karibu Health landing — nav + footer.

function Nav() {
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const links = [['Platform', '#platform'], ['Karibu EHR', '#ehr'], ['Karibu Learn', '#learn'], ['Impact', '#impact']];
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: scrolled ? 'rgba(251,252,254,0.82)' : 'rgba(251,252,254,0)',
      backdropFilter: scrolled ? 'saturate(180%) blur(14px)' : 'none',
      WebkitBackdropFilter: scrolled ? 'saturate(180%) blur(14px)' : 'none',
      borderBottom: `1px solid ${scrolled ? KH.line : 'transparent'}`,
      transition: 'background 240ms ease, border-color 240ms ease',
    }}>
      <Container style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 70 }}>
        <a href="#top" style={{ textDecoration: 'none' }}><KLockup size={30} /></a>
        <nav style={{ display: 'flex', alignItems: 'center', gap: 30 }} className="kh-navlinks">
          {links.map(([l, h]) => (
            <a key={l} href={h} style={{ fontSize: 14, fontWeight: 500, color: KH.body, textDecoration: 'none', transition: 'color 120ms ease' }}
              onMouseEnter={e => e.currentTarget.style.color = KH.ink} onMouseLeave={e => e.currentTarget.style.color = KH.body}>{l}</a>
          ))}
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="#ehr" style={{ fontSize: 14, fontWeight: 600, color: KH.ink, textDecoration: 'none' }} className="kh-signin">Sign in</a>
          <Btn kind="primary" size="sm" href="#apply" iconRight="arrow">Apply for your clinic</Btn>
        </div>
      </Container>
    </header>
  );
}

function Footer() {
  const cols = [
    ['Karibu EHR', [['Overview', '#ehr'], ['Dictation', '#ehr'], ['Works offline', '#ehr'], ['Apply for your clinic', '#apply']]],
    ['Karibu Learn', [['Browse cases', '#learn'], ['How it works', '#learn'], ['CME credit', '#learn'], ['Start free', '#learn']]],
    ['Company', [['About', '#about'], ['Built in Uganda', '#why'], ['Contact', '#apply']]],
  ];
  return (
    <footer style={{ background: KH.cobaltInk, color: '#fff', paddingTop: 64, paddingBottom: 36 }} id="about">
      <Container>
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr', gap: 40, paddingBottom: 48, borderBottom: '1px solid rgba(255,255,255,.12)' }} className="kh-foot-grid">
          <div>
            <KLockup size={32} markColor="#fff" markFg={KH.cobalt} textColor="#fff" suffix=".health" suffixColor="rgba(255,255,255,.6)" />
            <p style={{ fontSize: 14, lineHeight: 1.6, color: 'rgba(255,255,255,.66)', margin: '16px 0 0', maxWidth: 300 }}>
              Clinical software built for Uganda from the first step. An EHR for every clinic, and a classroom for every clinician.
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: KH.mono, fontSize: 11, color: 'rgba(255,255,255,.6)', border: '1px solid rgba(255,255,255,.18)', borderRadius: 999, padding: '5px 11px' }}><Icon name="globe" size={13} /> Kampala, Uganda</span>
            </div>
          </div>
          {cols.map(([h, items]) => (
            <div key={h}>
              <div style={{ fontFamily: KH.mono, fontSize: 11, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', marginBottom: 16 }}>{h}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                {items.map(([l, href]) => (
                  <a key={l} href={href} style={{ fontSize: 14, color: 'rgba(255,255,255,.8)', textDecoration: 'none', transition: 'color 120ms ease' }}
                    onMouseEnter={e => e.currentTarget.style.color = '#fff'} onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,.8)'}>{l}</a>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 24, flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,.5)' }}>© {new Date().getFullYear()} CappaWork LLC. All rights reserved.</span>
          <span style={{ fontFamily: KH.mono, fontSize: 11, color: 'rgba(255,255,255,.42)', letterSpacing: '.04em' }}>NO REAL PATIENT DATA APPEARS ON THIS SITE</span>
        </div>
      </Container>
    </footer>
  );
}

Object.assign(window, { Nav, Footer });
