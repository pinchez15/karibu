// Karibu Health landing — "One clinic. One record. Every role."
// Interactive, auto-rotating showcase. A single patient's care flows through
// Clinician → Lab → Pharmacy → Billing → Maternity, each on the same record.
// This is the centerpiece: it houses lab/pharmacy/billing/inpatient, proves
// continuity-of-care (what a donor funds), and carries the motion.

// ── Shared product-surface frame (a small "app window") ───────
function Surface({ tone, context, title, children, foot }) {
  return (
    <div style={{ width: '100%', maxWidth: 560, background: '#fff', border: `1px solid ${KH.line}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 2px rgba(11,20,82,.05), 0 24px 60px rgba(11,20,82,.10)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 16px', borderBottom: `1px solid ${KH.lineSoft}`, background: KH.bg }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 7, background: tone + '16', color: tone }}><Icon name={context.icon} size={15} /></span>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: KH.ink }}>{title}</span>
        <span style={{ marginLeft: 'auto', fontFamily: KH.mono, fontSize: 10, letterSpacing: '.06em', color: KH.muted, textTransform: 'uppercase' }}>{context.label}</span>
      </div>
      <div style={{ padding: 16 }}>{children}</div>
      {foot && <div style={{ padding: '11px 16px', borderTop: `1px solid ${KH.lineSoft}`, background: KH.bg, display: 'flex', alignItems: 'center', gap: 8 }}>{foot}</div>}
    </div>
  );
}

const Chip = ({ tone, soft, ink, icon, children }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: soft, color: ink || tone, fontSize: 11, fontWeight: 600, padding: '4px 9px', borderRadius: 999, lineHeight: 1 }}>
    {icon && <Icon name={icon} size={12} />}{children}
  </span>
);
const Row = ({ children, last }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: last ? 'none' : `1px solid ${KH.lineSoft}` }}>{children}</div>
);
const Dot = (c) => <span style={{ width: 7, height: 7, borderRadius: 999, background: c, flexShrink: 0 }}/>;

// ── Role panels ──────────────────────────────────────────────
function ClinicianPanel() {
  return (
    <Surface tone={KH.cobalt} context={{ icon: 'stethoscope', label: 'Clinician · Android' }} title="Nakato Sarah · 34F"
      foot={<><Chip soft={KH.cobaltSoft} ink={KH.cobalt} icon="check">Note signed</Chip><span style={{ fontFamily: KH.mono, fontSize: 10.5, color: KH.muted, marginLeft: 'auto' }}>VISIT 09:42 · PT-100015</span></>}>
      <div style={{ fontFamily: KH.mono, fontSize: 10, fontWeight: 700, letterSpacing: '.06em', color: KH.muted, marginBottom: 8 }}>ASSESSMENT</div>
      <div style={{ fontSize: 14.5, color: KH.ink, fontWeight: 500, lineHeight: 1.5 }}>Uncomplicated malaria <span style={{ fontFamily: KH.mono, fontSize: 12, color: KH.muted, fontWeight: 400 }}>· B54</span></div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        {[['flask', 'Order lab', KH.slate], ['pill', 'Prescribe', KH.green], ['refer', 'Refer', KH.cobalt]].map(([ic, t, c]) => (
          <div key={t} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 0', border: `1px solid ${KH.line}`, borderRadius: 11, background: '#fff' }}>
            <span style={{ color: c, display: 'flex' }}><Icon name={ic} size={18} /></span>
            <span style={{ fontSize: 12, fontWeight: 600, color: KH.body }}>{t}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderRadius: 10, background: KH.amberSoft + '88', border: `1px solid ${KH.amber}33` }}>
        <span style={{ color: KH.amber, display: 'flex' }}><Icon name="sparkle" size={14} /></span>
        <span style={{ fontSize: 12.5, color: KH.amberInk, lineHeight: 1.4 }}>AI drafted the note and suggested code <strong>B54</strong> for you to confirm.</span>
      </div>
    </Surface>
  );
}

function LabPanel() {
  const rows = [
    ['Malaria RDT', 'Nakato S.', 'Ready', KH.green, 'POSITIVE'],
    ['Blood sugar', 'Okello J.', 'Running', KH.amber, '—'],
    ['Urinalysis', 'Auma B.', 'Received', KH.slate, '—'],
  ];
  return (
    <Surface tone={KH.slate} context={{ icon: 'flask', label: 'Lab · Workflow tool' }} title="Lab worklist"
      foot={<><Chip soft={KH.cobaltSoft} ink={KH.cobalt} icon="phone">Ordered from the clinician’s app</Chip><Chip soft={KH.greenSoft} ink={KH.green} icon="check">Result → phone</Chip></>}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontFamily: KH.mono, fontSize: 10, fontWeight: 700, letterSpacing: '.06em', color: KH.muted }}>SPECIMENS TODAY</span>
        <span style={{ fontFamily: KH.mono, fontSize: 10.5, color: KH.muted }}>3 IN QUEUE</span>
      </div>
      {rows.map(([test, pt, st, c, res], i) => (
        <Row key={test} last={i === rows.length - 1}>
          {Dot(c)}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: KH.ink }}>{test}</div>
            <div style={{ fontFamily: KH.mono, fontSize: 10.5, color: KH.muted }}>{pt}</div>
          </div>
          {res !== '—' && <span style={{ fontFamily: KH.mono, fontSize: 11, fontWeight: 600, color: KH.red }}>{res}</span>}
          <span style={{ fontSize: 11, fontWeight: 600, color: c, background: c + '16', padding: '4px 10px', borderRadius: 999, minWidth: 64, textAlign: 'center' }}>{st}</span>
        </Row>
      ))}
    </Surface>
  );
}

function PharmacyPanel() {
  const rows = [
    ['Artemether-Lumefantrine', '24 tabs', 'Dispensed', KH.green],
    ['Paracetamol 500mg', '20 tabs', 'To dispense', KH.slate],
    ['ORS sachets', '6', 'To dispense', KH.slate],
  ];
  return (
    <Surface tone={KH.green} context={{ icon: 'pill', label: 'Pharmacy · Dispensary' }} title="Scripts received"
      foot={<><Chip soft={KH.cobaltSoft} ink={KH.cobalt} icon="phone">Sent from the visit</Chip><span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: KH.body }}><Icon name="box" size={13} color={KH.green} /> Stock: <strong style={{ color: KH.ink }}>AL · 138 left</strong></span></>}>
      {rows.map(([drug, qty, st, c], i) => (
        <Row key={drug} last={i === rows.length - 1}>
          <span style={{ width: 22, height: 22, borderRadius: 6, background: c + '16', color: c, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={st === 'Dispensed' ? 'check' : 'pill'} size={13} /></span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: KH.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{drug}</div>
            <div style={{ fontFamily: KH.mono, fontSize: 10.5, color: KH.muted }}>{qty}</div>
          </div>
          <span style={{ fontSize: 11, fontWeight: 600, color: c, background: c + '16', padding: '4px 10px', borderRadius: 999 }}>{st}</span>
        </Row>
      ))}
    </Surface>
  );
}

function BillingPanel() {
  const items = [['Consultation', '5,000'], ['Malaria RDT', '4,000'], ['Artemether-Lumefantrine', '8,000']];
  return (
    <Surface tone={KH.cobaltDeep} context={{ icon: 'receipt', label: 'Billing · Charges' }} title="Visit charges"
      foot={<><Chip soft={KH.greenSoft} ink={KH.green} icon="check">Receipt issued</Chip><span style={{ marginLeft: 'auto', fontFamily: KH.mono, fontSize: 10.5, color: KH.muted }}>UGX · NAKATO S.</span></>}>
      {items.map(([t, amt], i) => (
        <Row key={t} last={false}>
          <div style={{ flex: 1, fontSize: 13.5, color: KH.body }}>{t}</div>
          <div style={{ fontFamily: KH.mono, fontSize: 13, fontWeight: 600, color: KH.ink }}>{amt}</div>
        </Row>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 0 4px' }}>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: KH.ink }}>Total</div>
        <div style={{ fontFamily: KH.mono, fontSize: 16, fontWeight: 700, color: KH.cobalt }}>UGX 17,000</div>
      </div>
      {/* clinic tracker */}
      <div style={{ marginTop: 10, padding: 12, borderRadius: 11, background: KH.bg, border: `1px solid ${KH.line}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontFamily: KH.mono, fontSize: 10, fontWeight: 700, letterSpacing: '.05em', color: KH.muted }}>CLINIC · THIS WEEK</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: KH.green }}><Icon name="trending" size={12} /> tracked daily</span>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 34 }}>
          {[40, 62, 48, 78, 70, 92, 58].map((h, i) => (
            <div key={i} style={{ flex: 1, height: `${h}%`, background: i === 5 ? KH.cobalt : KH.cobaltSoft, borderRadius: 3 }}/>
          ))}
        </div>
      </div>
    </Surface>
  );
}

function MaternityPanel() {
  return (
    <Surface tone={KH.green} context={{ icon: 'heart', label: 'Maternity · Ward board' }} title="Inpatient & delivery"
      foot={<><Chip soft={KH.greenSoft} ink={KH.green} icon="users">2 mothers admitted</Chip><span style={{ marginLeft: 'auto', fontFamily: KH.mono, fontSize: 10.5, color: KH.muted }}>OVERNIGHT CARE</span></>}>
      {/* active labour */}
      <div style={{ borderRadius: 12, border: `1px solid ${KH.green}33`, background: KH.greenSoft + '66', padding: 13, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ width: 30, height: 30, borderRadius: 8, background: '#fff', color: KH.green, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="heart" size={16} /></span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: KH.ink }}>Bed 1 · Akello Mary <span style={{ fontWeight: 400, fontFamily: KH.mono, fontSize: 11, color: KH.muted }}>28F</span></div>
            <div style={{ fontSize: 12, color: KH.green, fontWeight: 600 }}>In active labour · 6 cm</div>
          </div>
          <span style={{ fontFamily: KH.mono, fontSize: 11, color: KH.muted, textAlign: 'right' }}>FHR 142<br/><span style={{ fontSize: 9.5 }}>NEXT ROUND 0:18</span></span>
        </div>
        {/* partograph-ish track */}
        <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 22, marginTop: 10 }}>
          {[30, 38, 44, 50, 62, 70, 84, 92].map((h, i) => (
            <div key={i} style={{ flex: 1, height: `${h}%`, background: KH.green, opacity: 0.35 + i * 0.08, borderRadius: 2 }}/>
          ))}
        </div>
      </div>
      {/* overnight bed */}
      <Row last>
        <span style={{ width: 30, height: 30, borderRadius: 8, background: KH.bg, color: KH.slate, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1px solid ${KH.line}` }}><Icon name="bed" size={16} /></span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: KH.ink }}>Bed 2 · Nansubuga R. <span style={{ fontWeight: 400, fontFamily: KH.mono, fontSize: 11, color: KH.muted }}>post-partum</span></div>
          <div style={{ fontSize: 11.5, color: KH.muted }}>Overnight obs · stable · vitals q4h</div>
        </div>
        {Dot(KH.green)}
      </Row>
    </Surface>
  );
}

const ROLES = [
  { id: 'clinician', label: 'Clinician', icon: 'stethoscope', tone: KH.cobalt, headline: 'Sees the patient and starts the record.', body: 'Document by voice, order tests, prescribe, refer — all from the phone in your pocket.', Panel: ClinicianPanel },
  { id: 'lab', label: 'Lab', icon: 'flask', tone: KH.slate, headline: 'Orders flow straight to the lab.', body: 'The lab works its own queue and sends results back to the clinician’s phone — no paper chits, no walking between rooms.', Panel: LabPanel },
  { id: 'pharmacy', label: 'Pharmacy', icon: 'pill', tone: KH.green, headline: 'Scripts arrive ready to dispense.', body: 'The dispensary sees every prescription the moment it’s written, marks what’s given, and tracks stock as it moves.', Panel: PharmacyPanel },
  { id: 'billing', label: 'Billing', icon: 'receipt', tone: KH.cobaltDeep, headline: 'Charges and costs, captured as you go.', body: 'Issue charges against the visit, print a receipt, and watch the clinic’s numbers build — no end-of-day reconciliation.', Panel: BillingPanel },
  { id: 'maternity', label: 'Maternity', icon: 'heart', tone: KH.green, headline: 'Care that stays through the night.', body: 'Admit mothers for delivery or overnight observation, track labour and rounds, and keep it all on the same record.', Panel: MaternityPanel },
];

function RolesShowcase() {
  const [active, setActive] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const wrapRef = React.useRef(null);
  const [inView, setInView] = React.useState(false);

  React.useEffect(() => {
    const el = wrapRef.current; if (!el || typeof IntersectionObserver === 'undefined') { setInView(true); return; }
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.25 });
    io.observe(el); return () => io.disconnect();
  }, []);

  React.useEffect(() => {
    if (paused || !inView) return;
    const t = setTimeout(() => setActive(a => (a + 1) % ROLES.length), 4200);
    return () => clearTimeout(t);
  }, [active, paused, inView]);

  const role = ROLES[active];
  return (
    <section id="platform" style={{ padding: '96px 0', background: KH.page, borderTop: `1px solid ${KH.line}`, borderBottom: `1px solid ${KH.line}` }}>
      <Container>
        <Reveal style={{ maxWidth: 680, marginBottom: 40 }}>
          <Eyebrow color={KH.cobalt}>The whole clinic</Eyebrow>
          <h2 style={{ fontSize: 'clamp(32px, 3.6vw, 46px)', fontWeight: 600, letterSpacing: '-0.03em', color: KH.ink, margin: '14px 0 0', lineHeight: 1.06, textWrap: 'balance' }}>One clinic. One record. Every role.</h2>
          <p style={{ fontSize: 18, color: KH.body, lineHeight: 1.6, margin: '18px 0 0', textWrap: 'pretty' }}>
            A visit doesn’t end with the clinician. In Karibu, the same patient record moves with the work — to the lab, the pharmacy, billing, and the maternity ward — so nothing is re-entered and nothing falls through.
          </p>
        </Reveal>

        {/* flow rail */}
        <div ref={wrapRef} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
          <div style={{ position: 'relative', marginBottom: 34 }}>
            {/* base line */}
            <div style={{ position: 'absolute', top: 27, left: '8%', right: '8%', height: 2, background: KH.line }}/>
            {/* animated flow comet */}
            <div className="kh-flowline" style={{ position: 'absolute', top: 26, left: '8%', right: '8%', height: 4, borderRadius: 999, overflow: 'hidden', opacity: inView ? 1 : 0 }}>
              <div className="kh-flow-comet" style={{ position: 'absolute', top: 0, left: 0, width: '34%', height: '100%', background: `linear-gradient(90deg, transparent, ${KH.cobalt}, transparent)` }}/>
            </div>
            <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between' }}>
              {ROLES.map((r, i) => {
                const on = i === active;
                return (
                  <button key={r.id} onClick={() => setActive(i)} style={{
                    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                    background: 'transparent', border: 0, cursor: 'pointer', padding: 0,
                  }}>
                    <span style={{
                      position: 'relative', width: 54, height: 54, borderRadius: 15, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: on ? r.tone : '#fff', color: on ? '#fff' : KH.muted,
                      border: `1.5px solid ${on ? r.tone : KH.line}`,
                      boxShadow: on ? `0 10px 24px ${r.tone}33` : '0 1px 2px rgba(11,20,82,.04)',
                      transform: on ? 'scale(1.06)' : 'scale(1)', transition: 'all 320ms cubic-bezier(.2,.7,.3,1)',
                    }}>
                      <Icon name={r.icon} size={22} />
                    </span>
                    <span style={{ fontSize: 13, fontWeight: on ? 700 : 500, color: on ? KH.ink : KH.muted, transition: 'color 200ms ease' }}>{r.label}</span>
                    {/* progress under active */}
                    <span style={{ width: 30, height: 3, borderRadius: 999, background: KH.lineSoft, overflow: 'hidden' }}>
                      {on && !paused && inView && <span key={active} className="kh-rolebar" style={{ display: 'block', height: '100%', background: r.tone }}/>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* detail: copy + crossfading surface */}
          <div style={{ display: 'grid', gridTemplateColumns: '0.82fr 1.18fr', gap: 44, alignItems: 'center' }} className="kh-roles-detail">
            <div style={{ minHeight: 150 }}>
              <div key={'c' + active} className="kh-rolecopy">
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, background: role.tone + '16', color: role.tone }}><Icon name={role.icon} size={17} /></span>
                  <span style={{ fontFamily: KH.mono, fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: role.tone }}>{role.label}</span>
                </div>
                <h3 style={{ fontSize: 'clamp(22px, 2.2vw, 28px)', fontWeight: 600, letterSpacing: '-0.02em', color: KH.ink, margin: 0, lineHeight: 1.16, textWrap: 'balance' }}>{role.headline}</h3>
                <p style={{ fontSize: 15.5, color: KH.body, lineHeight: 1.6, margin: '14px 0 0', maxWidth: 380 }}>{role.body}</p>
              </div>
            </div>
            <div style={{ position: 'relative', minHeight: 360, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {ROLES.map((r, i) => {
                const Panel = r.Panel;
                return (
                  <div key={r.id} style={{
                    position: i === active ? 'relative' : 'absolute', inset: i === active ? 'auto' : 0,
                    width: '100%', display: 'flex', justifyContent: 'center',
                    opacity: i === active ? 1 : 0, transform: i === active ? 'none' : 'translateY(10px) scale(0.985)',
                    transition: 'opacity 460ms ease, transform 460ms ease', pointerEvents: i === active ? 'auto' : 'none',
                  }}>
                    <Panel />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

Object.assign(window, { RolesShowcase });
