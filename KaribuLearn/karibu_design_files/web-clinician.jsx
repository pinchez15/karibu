// Karibu Health — web app surfaces (clinician, pharmacy, lab, analyst)
// Designed for desktop. Left rail nav, role-aware.

const W_ICONS = {
  home: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 12l9-9 9 9M5 10v10h14V10"/></svg>,
  patients: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M15 14c2.8 0 5 2.2 5 5"/></svg>,
  pill: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="9" width="18" height="6" rx="3" transform="rotate(-30 12 12)"/><path d="M9.5 7.5l4 7" /></svg>,
  flask: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M9 3h6M10 3v7L4 20a1 1 0 0 0 .9 1.5h14.2A1 1 0 0 0 20 20l-6-10V3"/><path d="M7 15h10"/></svg>,
  chart: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 20V8M10 20V4M16 20v-7M22 20H2"/></svg>,
  cog: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>,
  search: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>,
  download: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 19h16"/></svg>,
  filter: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h18M6 12h12M10 19h4"/></svg>,
  sparkle: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.7 5.3L19 9l-5.3 1.7L12 16l-1.7-5.3L5 9l5.3-1.7zM19 14l.9 2.6L22 18l-2.1.9-.9 2.1-1-2.1L16 18l1.9-1.4z"/></svg>,
  arrow: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>,
  bell: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 21a2 2 0 0 0 4 0"/></svg>,
};

// Web shell with sidebar
function WebShell({ role = 'clinician', activeNav, children, width = 1320, height = 840 }) {
  const navByRole = {
    clinician: [
      { id: 'home', label: 'Today', icon: W_ICONS.home, count: '6' },
      { id: 'patients', label: 'Patients', icon: W_ICONS.patients },
      { id: 'review', label: 'Review queue', icon: W_ICONS.sparkle, count: '2', amber: true },
      { id: 'reports', label: 'Reports', icon: W_ICONS.chart },
    ],
    pharmacy: [
      { id: 'orders', label: 'Orders', icon: W_ICONS.pill, count: '14' },
      { id: 'dispensing', label: 'Dispensing', icon: W_ICONS.arrow },
      { id: 'stock', label: 'Stock', icon: W_ICONS.chart, count: '3', amber: true },
      { id: 'history', label: 'History', icon: W_ICONS.patients },
    ],
    lab: [
      { id: 'orders', label: 'Orders', icon: W_ICONS.flask, count: '9' },
      { id: 'running', label: 'Running', icon: W_ICONS.arrow, count: '4' },
      { id: 'results', label: 'Results', icon: W_ICONS.chart },
      { id: 'controls', label: 'QC', icon: W_ICONS.cog },
    ],
    analyst: [
      { id: 'overview', label: 'Overview', icon: W_ICONS.home },
      { id: 'workbench', label: 'Workbench', icon: W_ICONS.chart },
      { id: 'hmis', label: 'HMIS 105', icon: W_ICONS.flask, count: 'May' },
      { id: 'quality', label: 'Data quality', icon: W_ICONS.sparkle, count: '12', amber: true },
    ],
  };
  const nav = navByRole[role];
  const roleLabel = role === 'clinician' ? 'Clinician' : role === 'pharmacy' ? 'Pharmacy' : role === 'lab' ? 'Laboratory' : 'Analyst';

  return (
    <div style={{
      width, height, background: KH.bg, fontFamily: KH.font, color: KH.ink,
      display: 'flex', overflow: 'hidden',
    }}>
      {/* Sidebar */}
      <div style={{ width: 232, background: KH.surface, borderRight: `1px solid ${KH.line}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '20px 20px 16px', borderBottom: `1px solid ${KH.lineSoft}` }}>
          <KaribuLockup size={32} />
          <div style={{ marginTop: 12, padding: '8px 10px', background: KH.bg, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, color: KH.muted, fontFamily: KH.mono, letterSpacing: '0.04em' }}>CLINIC</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: KH.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Susunga HC III</div>
            </div>
            <span style={{ color: KH.muted, fontSize: 11 }}>▾</span>
          </div>
        </div>

        <div style={{ padding: '14px 12px', flex: 1 }}>
          <div style={{ fontSize: 10, fontFamily: KH.mono, color: KH.muted, padding: '0 8px 8px', letterSpacing: '0.08em' }}>
            {roleLabel.toUpperCase()}
          </div>
          {nav.map(item => {
            const active = item.id === activeNav;
            return (
              <div key={item.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8,
                background: active ? KH.cobaltSoft : 'transparent',
                color: active ? KH.cobalt : KH.body,
                fontSize: 13, fontWeight: active ? 600 : 500,
                marginBottom: 2, cursor: 'pointer',
              }}>
                <span style={{ display: 'flex', color: active ? KH.cobalt : KH.muted }}>{item.icon}</span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.count && (
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 999,
                    background: item.amber ? KH.amberSoft : (active ? '#fff' : KH.bg),
                    color: item.amber ? KH.amberInk : (active ? KH.cobalt : KH.muted),
                    fontFamily: typeof item.count === 'string' && item.count.length > 2 ? KH.mono : KH.font,
                  }}>{item.count}</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Account */}
        <div style={{ padding: 14, borderTop: `1px solid ${KH.lineSoft}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 16, background: KH.cobaltSoft, color: KH.cobalt, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 12 }}>RA</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Dr. Akello</div>
              <div style={{ fontSize: 11, color: KH.muted }}>Clinical officer</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}

// Top bar inside main area
function WebTopBar({ title, subtitle, actions }) {
  return (
    <div style={{ padding: '20px 32px', borderBottom: `1px solid ${KH.line}`, background: KH.surface, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
      <div>
        {subtitle && <div style={{ fontSize: 11, fontFamily: KH.mono, color: KH.muted, letterSpacing: '0.06em', marginBottom: 4 }}>{subtitle}</div>}
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.015em' }}>{title}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {actions}
      </div>
    </div>
  );
}

// ── Web 1: Clinician dashboard ──────────────────────────────
function WebClinicianDashboard() {
  const Stat = ({ label, value, delta, deltaPositive }) => (
    <div style={{ background: KH.surface, border: `1px solid ${KH.line}`, borderRadius: 12, padding: 18 }}>
      <div style={{ fontSize: 11, fontFamily: KH.mono, color: KH.muted, letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 600, marginTop: 6, letterSpacing: '-0.02em', display: 'flex', alignItems: 'baseline', gap: 8 }}>
        {value}
        {delta && (
          <span style={{ fontSize: 12, fontWeight: 600, color: deltaPositive ? KH.green : KH.muted, background: deltaPositive ? KH.greenSoft : KH.bg, padding: '2px 6px', borderRadius: 6 }}>{delta}</span>
        )}
      </div>
    </div>
  );

  const queue = [
    { id: 'PT-100015', name: 'Nakato Sarah', age: '34F', status: 'Vitals', cc: 'Fever, headache 3d', wait: '8m', clinician: 'Dr. Akello', vit: 'T 38.4°' },
    { id: 'PT-100016', name: 'Okello James', age: '7M', status: 'In note', cc: 'Cough, mild fever', wait: '12m', clinician: 'Dr. Akello' },
    { id: 'PT-100018', name: 'Namusoke Grace', age: '28F', status: 'Waiting', cc: 'ANC routine', wait: '15m', clinician: '—' },
    { id: 'PT-100021', name: 'Mukasa David', age: '52M', status: 'Urgent', cc: 'BP follow-up', wait: '22m', clinician: '—', vit: 'BP 168/104' },
    { id: 'PT-100022', name: 'Achieng Mary', age: '41F', status: 'Waiting', cc: 'Joint pain', wait: '4m', clinician: '—' },
    { id: 'PT-100023', name: 'Wasswa Peter', age: '63M', status: 'Lab', cc: 'Diabetes review', wait: '—', clinician: 'Dr. Lwanga' },
  ];

  const StatusPill = ({ s }) => {
    const m = {
      Urgent: [KH.amber, KH.amberSoft],
      Vitals: [KH.cobalt, KH.cobaltSoft],
      'In note': [KH.cobalt, KH.cobaltSoft],
      Waiting: [KH.muted, KH.bg],
      Lab: [KH.slate, KH.slateSoft],
    };
    const [c, bg] = m[s] || [KH.muted, KH.bg];
    return <span style={{ fontSize: 11, fontWeight: 600, color: c, background: bg, padding: '3px 9px', borderRadius: 999 }}>{s}</span>;
  };

  return (
    <WebShell role="clinician" activeNav="home">
      <WebTopBar
        title="Today at Susunga HC III"
        subtitle="THU · 7 MAY 2026"
        actions={<>
          <div style={{ background: KH.bg, border: `1px solid ${KH.line}`, borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, color: KH.muted, fontSize: 13, width: 280 }}>
            {W_ICONS.search} <span>Search patients, visits, codes</span>
            <span style={{ marginLeft: 'auto', fontFamily: KH.mono, fontSize: 11, background: KH.surface, border: `1px solid ${KH.line}`, padding: '1px 6px', borderRadius: 4 }}>⌘K</span>
          </div>
          <button style={{ background: KH.cobalt, color: '#fff', border: 0, borderRadius: 8, padding: '9px 14px', fontWeight: 600, fontSize: 13 }}>+ New visit</button>
        </>}
      />

      <div style={{ padding: 24, overflow: 'auto', flex: 1 }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          <Stat label="VISITS TODAY" value="42" delta="+8 vs yest" deltaPositive />
          <Stat label="WAITING" value="6" />
          <Stat label="AVG TIME" value="9m 14s" />
          <Stat label="TO REVIEW" value="2" delta="AI" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16 }}>
          {/* Queue table */}
          <div style={{ background: KH.surface, border: `1px solid ${KH.line}`, borderRadius: 12 }}>
            <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${KH.lineSoft}` }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Queue</div>
                <div style={{ fontSize: 12, color: KH.muted }}>6 patients · ordered by wait time</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={{ background: KH.bg, color: KH.body, border: `1px solid ${KH.line}`, borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }}>{W_ICONS.filter} Filter</button>
              </div>
            </div>
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1.6fr 0.8fr 1fr', gap: 12, padding: '8px 18px', fontSize: 10, fontFamily: KH.mono, color: KH.muted, letterSpacing: '0.06em', borderBottom: `1px solid ${KH.lineSoft}` }}>
                <span>PATIENT</span><span>STATUS</span><span>COMPLAINT</span><span>WAIT</span><span>SEEN BY</span>
              </div>
              {queue.map((p, i) => (
                <div key={p.id} style={{
                  display: 'grid', gridTemplateColumns: '1.5fr 1fr 1.6fr 0.8fr 1fr', gap: 12,
                  padding: '12px 18px', fontSize: 13, alignItems: 'center',
                  borderBottom: i < queue.length - 1 ? `1px solid ${KH.lineSoft}` : 0,
                  background: p.status === 'Urgent' ? KH.amberSoft + '40' : 'transparent',
                }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: KH.muted, fontFamily: KH.mono }}>{p.id} · {p.age}</div>
                  </div>
                  <div><StatusPill s={p.status} /></div>
                  <div style={{ color: KH.body }}>
                    {p.cc}
                    {p.vit && <div style={{ fontSize: 11, color: p.status === 'Urgent' ? KH.amber : KH.muted, fontFamily: KH.mono, fontWeight: 600, marginTop: 2 }}>{p.vit}</div>}
                  </div>
                  <div style={{ fontFamily: KH.mono, fontSize: 12, color: KH.body }}>{p.wait}</div>
                  <div style={{ color: p.clinician === '—' ? KH.muted : KH.body }}>{p.clinician}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Side column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* AI review */}
            <div style={{ background: KH.surface, border: `1px solid ${KH.amber}40`, borderRadius: 12, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: KH.amber, fontSize: 11, fontFamily: KH.mono, letterSpacing: '0.06em', marginBottom: 8 }}>
                {W_ICONS.sparkle} AI REVIEW QUEUE
              </div>
              <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.015em' }}>2 notes structured</div>
              <div style={{ fontSize: 13, color: KH.muted, marginTop: 4 }}>Confirm SOAP and HMIS codes before submitting.</div>
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[['Aciro Joy', 'B54 · Malaria', '0.84'], ['Tumusiime Paul', 'J06.9 · URTI', '0.76']].map(([n, d, c]) => (
                  <div key={n} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderTop: `1px solid ${KH.lineSoft}` }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{n}</div>
                      <div style={{ fontSize: 11, color: KH.muted, fontFamily: KH.mono }}>{d}</div>
                    </div>
                    <span style={{ fontSize: 11, color: KH.amber, fontFamily: KH.mono, fontWeight: 600 }}>{c}</span>
                  </div>
                ))}
              </div>
              <button style={{ width: '100%', marginTop: 14, background: KH.amber, color: KH.amberInk, border: 0, borderRadius: 8, padding: '10px', fontWeight: 600, fontSize: 13 }}>Open review queue</button>
            </div>

            {/* Sync status */}
            <div style={{ background: KH.surface, border: `1px solid ${KH.line}`, borderRadius: 12, padding: 18 }}>
              <div style={{ fontSize: 11, fontFamily: KH.mono, color: KH.muted, letterSpacing: '0.06em', marginBottom: 8 }}>OFFLINE SYNC</div>
              <div style={{ fontSize: 13, color: KH.body, marginBottom: 12 }}>3 visits from field devices waiting to push.</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: KH.body }}>
                  <span>Dr. Akello · Pixel 6a</span>
                  <span style={{ fontFamily: KH.mono, color: KH.green }}>Synced 09:38</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: KH.body }}>
                  <span>N. Babirye · Galaxy A14</span>
                  <span style={{ fontFamily: KH.mono, color: KH.amber }}>3 pending</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: KH.body }}>
                  <span>M. Lwanga · Tecno Spark</span>
                  <span style={{ fontFamily: KH.mono, color: KH.muted }}>Offline 1h</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </WebShell>
  );
}

// ── Web 2: Visit detail — email-style note layout ────────────
// Patient identifiers + critical-finding callouts at top.
// Note as the main, full-width text block.
// Previous notes in a left rail like an inbox folder.
function WebVisitDetail() {
  const previousNotes = [
    { date: '2026-05-07', age: 'Today · 09:48', cc: 'Fever, headache 3d', dx: 'B54 Malaria', author: 'Dr. Akello', current: true, critical: true },
    { date: '2026-03-12', age: '8 weeks ago', cc: 'Routine ANC visit', dx: 'Z34', author: 'N. Babirye' },
    { date: '2025-11-04', age: '6 months ago', cc: 'Sore throat, runny nose', dx: 'J06.9 URTI', author: 'Dr. Akello' },
    { date: '2025-08-19', age: '9 months ago', cc: 'Skin rash, itching', dx: 'L29.9', author: 'Dr. Lwanga' },
    { date: '2025-04-22', age: '1 year ago', cc: 'Pregnancy confirmation', dx: 'Z32.0', author: 'N. Babirye' },
    { date: '2024-12-08', age: '17 mo ago', cc: 'Hypertension review', dx: 'I10', author: 'Dr. Akello', critical: true },
    { date: '2024-09-15', age: '20 mo ago', cc: 'Headache', dx: 'R51', author: 'Dr. Akello' },
  ];

  const VitalChip = ({ label, value, hot, range: refRange }) => (
    <div style={{
      padding: '6px 12px', borderRadius: 8,
      background: hot ? KH.amberSoft : KH.bg,
      border: `1px solid ${hot ? KH.amber + '60' : KH.line}`,
      display: 'flex', flexDirection: 'column', gap: 1, minWidth: 64,
    }}>
      <div style={{ fontSize: 10, fontFamily: KH.mono, color: hot ? KH.amber : KH.muted, letterSpacing: '0.05em', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 14, fontFamily: KH.mono, fontWeight: 700, color: hot ? KH.amber : KH.ink }}>{value}</div>
      {refRange && <div style={{ fontSize: 9, fontFamily: KH.mono, color: KH.muted }}>{refRange}</div>}
    </div>
  );

  return (
    <WebShell role="clinician" activeNav="patients">
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '300px 1fr 320px', overflow: 'hidden' }}>
        {/* LEFT — Inbox-style previous notes list */}
        <div style={{ borderRight: `1px solid ${KH.line}`, background: KH.surface, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px 12px', borderBottom: `1px solid ${KH.lineSoft}` }}>
            <div style={{ fontSize: 11, fontFamily: KH.mono, color: KH.muted, letterSpacing: '0.06em', marginBottom: 8 }}>NAKATO SARAH · PT-100015</div>
            <div style={{ background: KH.bg, border: `1px solid ${KH.line}`, borderRadius: 8, padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 8, color: KH.muted, fontSize: 12 }}>
              {W_ICONS.search} <span>Search this patient's notes</span>
            </div>
          </div>
          <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 11, fontFamily: KH.mono, color: KH.muted, letterSpacing: '0.06em' }}>VISITS · {previousNotes.length}</div>
            <button style={{ fontSize: 11, color: KH.cobalt, background: 'transparent', border: 0, fontWeight: 600 }}>Filter</button>
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {previousNotes.map((n, i) => (
              <div key={i} style={{
                padding: '12px 18px', borderTop: i ? `1px solid ${KH.lineSoft}` : 0,
                background: n.current ? KH.cobaltSoft + '70' : 'transparent',
                borderLeft: n.current ? `3px solid ${KH.cobalt}` : '3px solid transparent',
                cursor: 'pointer',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 13, fontWeight: n.current ? 700 : 600, color: n.current ? KH.cobalt : KH.ink }}>{n.author}</span>
                  <span style={{ fontFamily: KH.mono, fontSize: 10, color: KH.muted }}>{n.date}</span>
                </div>
                <div style={{ fontSize: 13, color: KH.body, marginTop: 3, fontWeight: n.current ? 500 : 400, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {n.cc}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                  <span style={{ fontSize: 11, color: KH.muted, fontFamily: KH.mono }}>{n.dx}</span>
                  <span style={{ fontSize: 10, color: KH.muted }}>{n.age}</span>
                </div>
                {n.critical && !n.current && (
                  <div style={{ marginTop: 4, fontSize: 10, color: KH.red, fontFamily: KH.mono, fontWeight: 600 }}>● CRITICAL FINDING</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* CENTER — Note as main canvas */}
        <div style={{ overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          {/* Email-style header: identifiers + vitals */}
          <div style={{ padding: '20px 36px 16px', background: KH.surface, borderBottom: `1px solid ${KH.line}`, position: 'sticky', top: 0, zIndex: 2 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center', minWidth: 0 }}>
                <div style={{ width: 48, height: 48, borderRadius: 10, background: KH.cobaltSoft, color: KH.cobalt, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, flexShrink: 0 }}>NS</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.015em' }}>Nakato Sarah</span>
                    <span style={{ fontFamily: KH.mono, fontSize: 12, color: KH.muted }}>PT-100015</span>
                    <span style={{ fontSize: 12, color: KH.body }}>34F</span>
                    <span style={{ fontSize: 12, color: KH.muted }}>·</span>
                    <span style={{ fontFamily: KH.mono, fontSize: 12, color: KH.body }}>+256 772 558 102</span>
                  </div>
                  <div style={{ fontSize: 12, color: KH.muted, marginTop: 3, fontFamily: KH.mono, letterSpacing: '0.04em' }}>
                    VISIT · 2026-05-07 · 09:42 · DR. AKELLO · CHIEF COMPLAINT: FEVER & HEADACHE 3D
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <button style={{ background: KH.surface, color: KH.body, border: `1px solid ${KH.line}`, borderRadius: 8, padding: '8px 12px', fontWeight: 500, fontSize: 13 }}>Print receipt</button>
                <button style={{ background: KH.cobalt, color: '#fff', border: 0, borderRadius: 8, padding: '8px 14px', fontWeight: 600, fontSize: 13 }}>Approve & send</button>
              </div>
            </div>

            {/* Vital strip */}
            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <VitalChip label="TEMP" value="38.4°" hot range="36.5–37.5" />
              <VitalChip label="BP" value="128/82" range="<140/90" />
              <VitalChip label="HR" value="92" range="60–100" />
              <VitalChip label="RESP" value="18" range="12–20" />
              <VitalChip label="SpO₂" value="98%" range="≥95%" />
              <VitalChip label="WT" value="62.4kg" />
              <VitalChip label="HT" value="162cm" />
              <VitalChip label="BMI" value="23.8" />
            </div>
          </div>

          {/* CRITICAL FINDINGS callout — only renders if any */}
          <div style={{ margin: '16px 36px 0', padding: '14px 18px', background: '#FEF3F2', border: `1px solid ${KH.red}40`, borderRadius: 10, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: KH.red, marginTop: 7, flexShrink: 0 }}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontFamily: KH.mono, color: KH.red, letterSpacing: '0.06em', fontWeight: 700, marginBottom: 4 }}>CRITICAL · 1 FINDING</div>
              <div style={{ fontSize: 14, color: KH.ink, fontWeight: 600 }}>Fever ≥ 38°C with headache · suspect malaria</div>
              <div style={{ fontSize: 13, color: KH.body, marginTop: 2 }}>RDT ordered. Watch for danger signs: altered consciousness, jaundice, severe weakness, repeated vomiting. Re-check temperature every 30 min until afebrile.</div>
            </div>
            <button style={{ background: 'transparent', color: KH.red, border: `1px solid ${KH.red}40`, borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>Acknowledge</button>
          </div>

          {/* AI structuring banner */}
          <div style={{ margin: '12px 36px 0', display: 'flex', alignItems: 'center', gap: 10, color: KH.amber, fontSize: 11, fontFamily: KH.mono, letterSpacing: '0.06em' }}>
            {W_ICONS.sparkle} STRUCTURING NOTE · ~6S REMAINING
            <span style={{ flex: 1, height: 2, background: KH.line, borderRadius: 1, position: 'relative', overflow: 'hidden' }}>
              <span style={{ position: 'absolute', inset: 0, background: `linear-gradient(90deg, transparent, ${KH.amber}, transparent)`, backgroundSize: '200% 100%', animation: 'webshim 1.6s linear infinite' }}/>
            </span>
            <button style={{ fontFamily: KH.font, fontSize: 11, color: KH.muted, background: 'transparent', border: 0, fontWeight: 600 }}>Skip · keep raw</button>
          </div>
          <style>{`@keyframes webshim { 0% {background-position: 200% 0} 100% {background-position: -200% 0} } @keyframes khpulseW { 0%, 60%, 100% { opacity: 0.3 } 30% { opacity: 1 } }`}</style>

          {/* THE NOTE — main, full-width text body */}
          <div style={{ flex: 1, padding: '20px 36px 36px' }}>
            <div style={{ background: KH.surface, border: `1px solid ${KH.line}`, borderRadius: 14, overflow: 'hidden' }}>
              {/* tabbed header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', borderBottom: `1px solid ${KH.lineSoft}`, background: KH.bg }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {['Structured (AI)', 'Raw note', 'History', 'Diff'].map((t, i) => (
                    <span key={t} style={{ fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 6, background: i === 0 ? KH.surface : 'transparent', color: i === 0 ? KH.cobalt : KH.muted, border: i === 0 ? `1px solid ${KH.line}` : '1px solid transparent' }}>{t}</span>
                  ))}
                </div>
                <span style={{ fontSize: 11, fontFamily: KH.mono, color: KH.muted }}>147 WORDS · AUTO-SAVED 09:48</span>
              </div>

              {/* Note body */}
              <div style={{ padding: '32px 48px', minHeight: 380 }}>
                {[
                  ['SUBJECTIVE', '34F presents with 3-day history of fever, headache and generalized body weakness. Took paracetamol at home with minimal relief. No vomiting, diarrhea, or neck stiffness. No recent travel. Last menstrual period 2 weeks ago.', 'done'],
                  ['OBJECTIVE', 'T 38.4°C, BP 128/82, HR 92, SpO₂ 98%, RR 18. Mildly dehydrated, mucous membranes dry. Lungs clear to auscultation bilaterally. Heart sounds normal. Abdomen soft, non-tender. No meningeal signs.', 'done'],
                  ['ASSESSMENT', 'Likely uncomplicated malaria, pending RDT confirmation. Differential: viral syndrome, early dengue, urinary tract infection.', 'streaming'],
                  ['PLAN', '', 'pending'],
                ].map(([label, body, state]) => (
                  <div key={label} style={{ marginBottom: 26 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 11, fontFamily: KH.mono, color: state === 'pending' ? KH.muted : (state === 'streaming' ? KH.amber : KH.cobalt), letterSpacing: '0.08em', fontWeight: 700 }}>{label}</span>
                      {state === 'streaming' && (
                        <span style={{ display: 'inline-flex', gap: 3 }}>
                          {[0,1,2].map(i => <span key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: KH.amber, animation: `khpulseW 1.2s ${i*0.15}s infinite ease-in-out` }}/>)}
                        </span>
                      )}
                      {state === 'done' && <span style={{ fontSize: 10, color: KH.green, fontFamily: KH.mono, fontWeight: 700 }}>✓ EDITED</span>}
                    </div>
                    {state === 'pending' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {[92, 78, 64].map(w => (
                          <div key={w} style={{ height: 12, width: w + '%', background: KH.lineSoft, borderRadius: 4 }}/>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 16, lineHeight: 1.7, color: KH.body, fontFamily: KH.font }}>{body}</div>
                    )}
                  </div>
                ))}
              </div>

              {/* Toolbar */}
              <div style={{ borderTop: `1px solid ${KH.lineSoft}`, padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: KH.bg }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['B', 'I', '•', '1.', '@'].map(c => (
                    <span key={c} style={{ width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: KH.muted, fontFamily: c === 'B' || c === 'I' ? KH.font : KH.mono, fontWeight: c === 'B' ? 700 : 500, fontStyle: c === 'I' ? 'italic' : 'normal', borderRadius: 6 }}>{c}</span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={{ fontSize: 12, color: KH.muted, background: 'transparent', border: 0, fontWeight: 600, padding: '6px 10px' }}>Compare to raw</button>
                  <button style={{ fontSize: 12, color: KH.cobalt, background: KH.cobaltSoft, border: 0, fontWeight: 600, padding: '6px 12px', borderRadius: 6 }}>Re-run AI</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT — codes + orders */}
        <div style={{ borderLeft: `1px solid ${KH.line}`, background: KH.surface, padding: 20, overflow: 'auto' }}>
          <div style={{ fontSize: 11, fontFamily: KH.mono, color: KH.muted, letterSpacing: '0.06em', marginBottom: 10 }}>HMIS CODES</div>
          {[
            ['B54', 'Malaria, unspecified', '0.84', 'AI', true],
            ['R50.9', 'Fever, unspecified', '0.62', 'AI', false],
          ].map(([code, name, conf, src, primary]) => (
            <div key={code} style={{
              border: `1px solid ${primary ? KH.cobalt : KH.line}`,
              borderRadius: 10, padding: 12, marginBottom: 8,
              background: primary ? KH.cobaltSoft + '60' : KH.surface,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontFamily: KH.mono, fontWeight: 700, color: KH.cobalt }}>{code}</span>
                <span style={{ fontSize: 10, fontFamily: KH.mono, color: KH.amber, background: KH.amberSoft, padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>{src} {conf}</span>
              </div>
              <div style={{ fontSize: 13, color: KH.body }}>{name}</div>
              {primary && <div style={{ fontSize: 11, color: KH.cobalt, marginTop: 6, fontWeight: 600 }}>Primary diagnosis</div>}
            </div>
          ))}
          <button style={{ width: '100%', marginTop: 4, background: 'transparent', color: KH.cobalt, border: `1px dashed ${KH.line}`, borderRadius: 10, padding: '10px', fontWeight: 600, fontSize: 13 }}>+ Add code</button>

          <div style={{ marginTop: 22, fontSize: 11, fontFamily: KH.mono, color: KH.muted, letterSpacing: '0.06em', marginBottom: 10 }}>ORDERS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ border: `1px solid ${KH.line}`, borderRadius: 10, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Malaria RDT</span>
                <span style={{ fontSize: 11, color: KH.amber, background: KH.amberSoft, padding: '2px 8px', borderRadius: 999, fontWeight: 600 }}>Lab pending</span>
              </div>
              <div style={{ fontSize: 11, color: KH.muted, fontFamily: KH.mono, marginTop: 2 }}>SENT 09:51 · LAB-2271</div>
            </div>
            <div style={{ border: `1px solid ${KH.line}`, borderRadius: 10, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Artemether-Lumefantrine</span>
                <span style={{ fontSize: 11, color: KH.muted, background: KH.bg, padding: '2px 8px', borderRadius: 999, fontWeight: 600 }}>Awaiting RDT</span>
              </div>
              <div style={{ fontSize: 11, color: KH.muted, fontFamily: KH.mono, marginTop: 2 }}>20/120 mg · 6 doses · weight-based 4 tabs</div>
            </div>
          </div>

          <div style={{ marginTop: 22, fontSize: 11, fontFamily: KH.mono, color: KH.muted, letterSpacing: '0.06em', marginBottom: 10 }}>ALLERGIES & PROBLEM LIST</div>
          <div style={{ fontSize: 13, color: KH.body, padding: '8px 12px', background: KH.bg, borderRadius: 8 }}>No known drug allergies</div>
          <div style={{ fontSize: 13, color: KH.body, padding: '8px 12px', background: KH.bg, borderRadius: 8, marginTop: 6 }}>G2P1 · LMP 2 wk ago</div>
        </div>
      </div>
    </WebShell>
  );
}

Object.assign(window, { WebShell, WebTopBar, WebClinicianDashboard, WebVisitDetail, W_ICONS });
