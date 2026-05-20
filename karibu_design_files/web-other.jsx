// Karibu Health — pharmacy, lab, analyst surfaces
// Designed for one-person-handles-40-patients-a-day workflow.
// Density and glanceability are the explicit goals.

// ── Web 3: Pharmacy ──────────────────────────────────────────
// One pharmacist, ~40 patients/day, 18-ish formulary items.
// Layout: queue ALONG TOP (every patient on the screen), then a
// "drug load" matrix below — every order, every drug, every count.
// Goal: pre-pull stock for several patients in parallel.
function WebPharmacy() {
  // Limited formulary — these are the columns of the matrix
  const formulary = [
    { sku: 'ALU-20',  name: 'AL 20/120',     short: 'AL',   stock: 142, low: false },
    { sku: 'AMX-500', name: 'Amoxicillin 500',short: 'AMX', stock: 38,  low: true },
    { sku: 'PCM-500', name: 'Paracetamol 500',short: 'PCM', stock: 1240,low: false },
    { sku: 'ORS-1',   name: 'ORS sachets',    short: 'ORS', stock: 12,  crit: true },
    { sku: 'AML-5',   name: 'Amlodipine 5',   short: 'AML', stock: 88,  low: false },
    { sku: 'LOS-50',  name: 'Losartan 50',    short: 'LOS', stock: 64,  low: false },
    { sku: 'MET-500', name: 'Metformin 500',  short: 'MET', stock: 230, low: false },
    { sku: 'ZIN-20',  name: 'Zinc 20',        short: 'ZN',  stock: 86,  low: false },
    { sku: 'CTX-960', name: 'Cotrim 960',     short: 'CTX', stock: 156, low: false },
    { sku: 'IBU-200', name: 'Ibuprofen 200',  short: 'IBU', stock: 90,  low: false },
  ];

  // 40-row queue (truncated rendered list to fit, but matrix is honest)
  // Each order: counts per formulary sku
  const orders = [
    { id: 'RX-4421', t: '09:54', pt: 'Nakato Sarah',     ptId: 'PT-100015', age: '34F', from: 'Akello',  s: 'New',       counts: { 'ALU-20': 24 } },
    { id: 'RX-4420', t: '09:48', pt: 'Mukasa David',     ptId: 'PT-100021', age: '52M', from: 'Akello',  s: 'New', urgent: true, counts: { 'AML-5': 30, 'LOS-50': 30 } },
    { id: 'RX-4419', t: '09:31', pt: 'Aciro Joy',        ptId: 'PT-100012', age: '6F',  from: 'Lwanga',  s: 'Counting', counts: { 'PCM-500': 8, 'ORS-1': 6 } },
    { id: 'RX-4418', t: '09:14', pt: 'Tumusiime Paul',   ptId: 'PT-100009', age: '38M', from: 'Akello',  s: 'Ready',    counts: { 'AMX-500': 21 } },
    { id: 'RX-4417', t: '08:52', pt: 'Kato Daniel',      ptId: 'PT-100007', age: '63M', from: 'Lwanga',  s: 'Dispensed',counts: { 'MET-500': 60 } },
    { id: 'RX-4416', t: '08:31', pt: 'Namusoke Grace',   ptId: 'PT-100018', age: '28F', from: 'Akello',  s: 'New',      counts: { 'PCM-500': 10 } },
    { id: 'RX-4415', t: '08:18', pt: 'Achieng Mary',     ptId: 'PT-100022', age: '41F', from: 'Akello',  s: 'New',      counts: { 'IBU-200': 12 } },
    { id: 'RX-4414', t: '08:02', pt: 'Wasswa Peter',     ptId: 'PT-100023', age: '63M', from: 'Lwanga',  s: 'Ready',    counts: { 'MET-500': 60, 'AML-5': 30 } },
    { id: 'RX-4413', t: '07:48', pt: 'Auma Beatrice',    ptId: 'PT-100024', age: '29F', from: 'Akello',  s: 'Counting', counts: { 'CTX-960': 14 } },
    { id: 'RX-4412', t: '07:34', pt: 'Lubega John',      ptId: 'PT-100025', age: '4M',  from: 'Lwanga',  s: 'New',      counts: { 'ORS-1': 6, 'ZIN-20': 10 } },
    { id: 'RX-4411', t: '07:22', pt: 'Apio Sandra',      ptId: 'PT-100026', age: '52F', from: 'Akello',  s: 'New',      counts: { 'PCM-500': 8 } },
    { id: 'RX-4410', t: '07:08', pt: 'Sekitto Henry',    ptId: 'PT-100027', age: '47M', from: 'Lwanga',  s: 'Ready',    counts: { 'ALU-20': 24 } },
  ];

  const sStyle = (s) => {
    const m = { New: [KH.cobalt, KH.cobaltSoft], Counting: [KH.amber, KH.amberSoft], Ready: [KH.green, KH.greenSoft], Dispensed: [KH.muted, KH.bg] };
    return m[s] || [KH.muted, KH.bg];
  };

  return (
    <WebShell role="pharmacy" activeNav="orders">
      <WebTopBar
        subtitle="PHARMACY · SUSUNGA HC III · 40 PATIENTS TODAY"
        title="Dispensing board"
        actions={<>
          <div style={{ display: 'flex', gap: 8, marginRight: 4 }}>
            {[['NEW',14,KH.cobalt],['COUNTING',3,KH.amber],['READY',7,KH.green],['DISPENSED',16,KH.muted]].map(([l,v,c]) => (
              <div key={l} style={{ padding: '4px 10px', background: KH.bg, border: `1px solid ${KH.line}`, borderRadius: 6, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 10, fontFamily: KH.mono, color: KH.muted, letterSpacing: '0.06em' }}>{l}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: c, fontFamily: KH.mono }}>{v}</span>
              </div>
            ))}
          </div>
          <button style={{ background: KH.surface, color: KH.body, border: `1px solid ${KH.line}`, borderRadius: 8, padding: '8px 12px', fontWeight: 500, fontSize: 13 }}>Stock count</button>
          <button style={{ background: KH.cobalt, color: '#fff', border: 0, borderRadius: 8, padding: '8px 14px', fontWeight: 600, fontSize: 13 }}>+ Receive</button>
        </>}
      />

      <div style={{ flex: 1, overflow: 'auto', padding: 20, background: KH.bg }}>

        {/* ─── DRUG LOAD MATRIX ──────────────────────────────────
            Rows: orders (patients).
            Cols: formulary items.
            Cell: count to dispense. Tap = check off as picked.
            Lets the pharmacist scan one column to pre-pull (e.g. all PCM today). */}
        <div style={{ background: KH.surface, border: `1px solid ${KH.line}`, borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ padding: '12px 18px', borderBottom: `1px solid ${KH.lineSoft}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Today's drug load</div>
              <div style={{ fontSize: 12, color: KH.muted }}>Pre-pull by column. Tap a cell to mark as counted.</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {['Active', 'Ready', 'All'].map((tab, i) => (
                <span key={tab} style={{ fontSize: 12, fontWeight: 500, padding: '5px 10px', borderRadius: 6, background: i === 0 ? KH.cobaltSoft : 'transparent', color: i === 0 ? KH.cobalt : KH.muted }}>{tab}</span>
              ))}
            </div>
          </div>

          {/* Column header */}
          <div style={{ display: 'grid', gridTemplateColumns: `220px 70px ${formulary.map(()=>'1fr').join(' ')} 90px 90px`, fontSize: 10, fontFamily: KH.mono, color: KH.muted, letterSpacing: '0.04em', borderBottom: `1px solid ${KH.line}`, background: KH.bg }}>
            <div style={{ padding: '8px 14px' }}>PATIENT</div>
            <div style={{ padding: '8px 4px', textAlign: 'center' }}>RX</div>
            {formulary.map(d => (
              <div key={d.sku} style={{ padding: '8px 4px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, borderLeft: `1px solid ${KH.lineSoft}`, color: d.crit ? KH.red : d.low ? KH.amber : KH.muted }}>
                <span style={{ fontWeight: 700 }}>{d.short}</span>
                <span style={{ fontSize: 9, fontFamily: KH.mono, opacity: 0.85 }}>{d.stock}</span>
              </div>
            ))}
            <div style={{ padding: '8px 4px', textAlign: 'center' }}>STATUS</div>
            <div style={{ padding: '8px 4px', textAlign: 'center' }}>ACTION</div>
          </div>

          {/* Order rows */}
          {orders.map((o, ri) => {
            const [c, bg] = sStyle(o.s);
            const dimmed = o.s === 'Dispensed';
            return (
              <div key={o.id} style={{
                display: 'grid', gridTemplateColumns: `220px 70px ${formulary.map(()=>'1fr').join(' ')} 90px 90px`,
                fontSize: 13, alignItems: 'center', borderBottom: ri < orders.length - 1 ? `1px solid ${KH.lineSoft}` : 0,
                background: o.urgent ? KH.amberSoft + '40' : 'transparent',
                opacity: dimmed ? 0.55 : 1,
              }}>
                <div style={{ padding: '10px 14px' }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{o.pt}</div>
                  <div style={{ fontSize: 11, color: KH.muted, fontFamily: KH.mono }}>{o.ptId} · {o.age} · {o.from}</div>
                </div>
                <div style={{ padding: '10px 4px', fontFamily: KH.mono, fontSize: 11, color: KH.cobalt, fontWeight: 600, textAlign: 'center' }}>{o.id.replace('RX-','')}</div>
                {formulary.map(d => {
                  const qty = o.counts[d.sku];
                  const picked = o.s === 'Ready' || o.s === 'Dispensed';
                  return (
                    <div key={d.sku} style={{
                      padding: '10px 2px', textAlign: 'center', borderLeft: `1px solid ${KH.lineSoft}`, position: 'relative',
                      background: qty ? (picked ? KH.greenSoft : KH.cobaltSoft + '70') : 'transparent',
                    }}>
                      {qty ? (
                        <span style={{
                          fontFamily: KH.mono, fontSize: 13, fontWeight: 700,
                          color: picked ? KH.green : KH.cobalt,
                        }}>{qty}{picked && <span style={{ marginLeft: 3, fontSize: 9 }}>✓</span>}</span>
                      ) : (
                        <span style={{ color: KH.line }}>·</span>
                      )}
                    </div>
                  );
                })}
                <div style={{ padding: '10px 4px', textAlign: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: c, background: bg, padding: '3px 9px', borderRadius: 999 }}>{o.s}</span>
                </div>
                <div style={{ padding: '10px 4px', textAlign: 'center' }}>
                  {o.s === 'Counting' && <button style={{ background: KH.cobalt, color: '#fff', border: 0, borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600 }}>Mark ready</button>}
                  {o.s === 'New' && <button style={{ background: 'transparent', color: KH.cobalt, border: `1px solid ${KH.cobalt}40`, borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600 }}>Start</button>}
                  {o.s === 'Ready' && <button style={{ background: KH.green, color: '#fff', border: 0, borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600 }}>Dispense</button>}
                  {o.s === 'Dispensed' && <span style={{ fontSize: 10, color: KH.muted, fontFamily: KH.mono }}>—</span>}
                </div>
              </div>
            );
          })}

          {/* Column totals — stock burn-down at-a-glance */}
          <div style={{ display: 'grid', gridTemplateColumns: `220px 70px ${formulary.map(()=>'1fr').join(' ')} 90px 90px`, fontSize: 12, alignItems: 'center', background: KH.bg, borderTop: `1px solid ${KH.line}` }}>
            <div style={{ padding: '10px 14px', fontFamily: KH.mono, fontSize: 11, color: KH.muted, letterSpacing: '0.04em', fontWeight: 700 }}>NEED TODAY</div>
            <div style={{ padding: '10px 4px' }}/>
            {formulary.map(d => {
              const total = orders.reduce((acc, o) => acc + (o.counts[d.sku] || 0), 0);
              const willDeplete = total >= d.stock * 0.5;
              return (
                <div key={d.sku} style={{ padding: '10px 2px', textAlign: 'center', borderLeft: `1px solid ${KH.lineSoft}` }}>
                  {total ? (
                    <span style={{ fontFamily: KH.mono, fontSize: 13, fontWeight: 700, color: willDeplete ? KH.amber : KH.ink }}>{total}</span>
                  ) : <span style={{ color: KH.muted }}>·</span>}
                </div>
              );
            })}
            <div/>
            <div/>
          </div>
        </div>

        {/* Stock alerts row — minimal, only what needs attention */}
        <div style={{ background: KH.surface, border: `1px solid ${KH.amber}40`, borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 11, fontFamily: KH.mono, color: KH.amber, letterSpacing: '0.06em', fontWeight: 700, flexShrink: 0 }}>STOCK · 2 ITEMS NEED ATTENTION</div>
          <div style={{ display: 'flex', gap: 12, flex: 1, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: KH.red }}/>
              <span style={{ fontWeight: 600 }}>ORS sachets</span>
              <span style={{ fontFamily: KH.mono, color: KH.muted }}>12 left · 6 needed today</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: KH.amber }}/>
              <span style={{ fontWeight: 600 }}>Amoxicillin 500</span>
              <span style={{ fontFamily: KH.mono, color: KH.muted }}>38 left · reorder at 80</span>
            </div>
          </div>
          <button style={{ background: KH.amber, color: KH.amberInk, border: 0, borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 700 }}>Reorder</button>
        </div>
      </div>
    </WebShell>
  );
}

// ── Web 4: Lab ────────────────────────────────────────────────
// Same density principle. ~40 patients/day, ~12 test types.
// Single-screen workflow: every order in a tight table; result entry
// happens INLINE (no row-click, no modal). One-tap status advance.
function WebLab() {
  // Limited test menu
  const testCatalog = ['Malaria RDT', 'CBC', 'RBS', 'Urinalysis', 'HIV Rapid', 'HB', 'Syphilis', 'Stool', 'Pregnancy', 'Typhoid'];

  const orders = [
    { id: 'LAB-2271', t: '09:51', test: 'Malaria RDT', pt: 'Nakato Sarah',  ptId: 'PT-100015', age: '34F', from: 'Akello', s: 'New',     result: '' },
    { id: 'LAB-2270', t: '09:46', test: 'CBC',         pt: 'Mukasa David',  ptId: 'PT-100021', age: '52M', from: 'Akello', s: 'Running', result: '', urgent: true },
    { id: 'LAB-2269', t: '09:33', test: 'RBS',         pt: 'Wasswa Peter',  ptId: 'PT-100023', age: '63M', from: 'Lwanga', s: 'Running', result: '' },
    { id: 'LAB-2268', t: '09:21', test: 'Urinalysis',  pt: 'Achieng Mary',  ptId: 'PT-100022', age: '41F', from: 'Akello', s: 'Result',  result: 'Leuk +' },
    { id: 'LAB-2267', t: '08:54', test: 'HIV Rapid',   pt: 'Tumusiime Paul',ptId: 'PT-100009', age: '38M', from: 'Lwanga', s: 'Sent',    result: 'Non-reactive' },
    { id: 'LAB-2266', t: '08:31', test: 'HB',          pt: 'Auma Beatrice', ptId: 'PT-100024', age: '29F', from: 'Akello', s: 'Result',  result: '9.4 g/dL', flag: 'low' },
    { id: 'LAB-2265', t: '08:18', test: 'Malaria RDT', pt: 'Lubega John',   ptId: 'PT-100025', age: '4M',  from: 'Lwanga', s: 'New',     result: '' },
    { id: 'LAB-2264', t: '08:02', test: 'Stool',       pt: 'Apio Sandra',   ptId: 'PT-100026', age: '52F', from: 'Akello', s: 'Running', result: '' },
    { id: 'LAB-2263', t: '07:48', test: 'Pregnancy',   pt: 'Namusoke G.',   ptId: 'PT-100018', age: '28F', from: 'Akello', s: 'Sent',    result: 'Positive' },
    { id: 'LAB-2262', t: '07:34', test: 'Malaria RDT', pt: 'Sekitto Henry', ptId: 'PT-100027', age: '47M', from: 'Lwanga', s: 'Sent',    result: 'Negative' },
  ];

  const sStyle = (s) => {
    const m = { New: [KH.cobalt, KH.cobaltSoft], Running: [KH.amber, KH.amberSoft], Result: [KH.green, KH.greenSoft], Sent: [KH.muted, KH.bg] };
    return m[s];
  };

  // Quick-result options per test (keeps it to one tap)
  const quickResults = {
    'Malaria RDT':   ['Negative', 'P. falciparum +', 'P. vivax +', 'Invalid'],
    'HIV Rapid':     ['Non-reactive', 'Reactive', 'Indeterminate'],
    'Pregnancy':     ['Negative', 'Positive'],
    'Urinalysis':    ['Normal', 'Leuk +', 'Nitr +', 'Both'],
    'RBS':           ['mg/dL'],
    'CBC':           ['Open panel'],
    'HB':            ['g/dL'],
    'Syphilis':      ['Non-reactive', 'Reactive'],
    'Stool':         ['Normal', 'Ova/parasite', 'Occult blood'],
    'Typhoid':       ['Negative', 'Positive'],
  };

  return (
    <WebShell role="lab" activeNav="orders">
      <WebTopBar
        subtitle="LABORATORY · SUSUNGA HC III · 40 PATIENTS TODAY"
        title="Lab board"
        actions={<>
          <div style={{ display: 'flex', gap: 8, marginRight: 4 }}>
            {[['NEW',9,KH.cobalt],['RUNNING',4,KH.amber],['RESULT',6,KH.green],['SENT',21,KH.muted]].map(([l,v,c]) => (
              <div key={l} style={{ padding: '4px 10px', background: KH.bg, border: `1px solid ${KH.line}`, borderRadius: 6, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 10, fontFamily: KH.mono, color: KH.muted, letterSpacing: '0.06em' }}>{l}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: c, fontFamily: KH.mono }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ padding: '4px 10px', background: KH.amberSoft, border: `1px solid ${KH.amber}60`, borderRadius: 6, display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 10, fontFamily: KH.mono, color: KH.amber, letterSpacing: '0.06em', fontWeight: 700 }}>ABNORMAL</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: KH.amber, fontFamily: KH.mono }}>2</span>
          </div>
          <button style={{ background: KH.cobalt, color: '#fff', border: 0, borderRadius: 8, padding: '8px 14px', fontWeight: 600, fontSize: 13 }}>+ Walk-in</button>
        </>}
      />

      <div style={{ flex: 1, overflow: 'auto', padding: 20, background: KH.bg }}>
        {/* Inline result-entry table — every order, every action one tap */}
        <div style={{ background: KH.surface, border: `1px solid ${KH.line}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: `1px solid ${KH.lineSoft}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Today's queue</div>
              <div style={{ fontSize: 12, color: KH.muted }}>Tap a result chip to record. Status auto-advances.</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {['Active', 'New', 'Running', 'Result', 'All'].map((tab, i) => (
                <span key={tab} style={{ fontSize: 12, fontWeight: 500, padding: '5px 10px', borderRadius: 6, background: i === 0 ? KH.cobaltSoft : 'transparent', color: i === 0 ? KH.cobalt : KH.muted }}>{tab}</span>
              ))}
            </div>
          </div>

          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 130px 1.4fr 100px 80px', fontSize: 10, fontFamily: KH.mono, color: KH.muted, letterSpacing: '0.06em', padding: '8px 18px', borderBottom: `1px solid ${KH.line}`, background: KH.bg }}>
            <span>LAB ID</span>
            <span>PATIENT · TEST</span>
            <span>STATUS</span>
            <span>RESULT · TAP TO RECORD</span>
            <span>TIME</span>
            <span style={{ textAlign: 'right' }}>SEND</span>
          </div>

          {orders.map((o, i) => {
            const [c, bg] = sStyle(o.s);
            const isSent = o.s === 'Sent';
            const choices = quickResults[o.test] || [];
            return (
              <div key={o.id} style={{
                display: 'grid', gridTemplateColumns: '90px 1fr 130px 1.4fr 100px 80px', alignItems: 'center',
                padding: '10px 18px', borderBottom: i < orders.length - 1 ? `1px solid ${KH.lineSoft}` : 0, fontSize: 13,
                background: o.urgent ? KH.amberSoft + '40' : 'transparent',
                opacity: isSent ? 0.6 : 1,
              }}>
                <span style={{ fontFamily: KH.mono, color: KH.cobalt, fontSize: 11, fontWeight: 700 }}>{o.id.replace('LAB-','')}</span>
                <div>
                  <div>
                    <span style={{ fontWeight: 600 }}>{o.pt}</span>
                    <span style={{ fontFamily: KH.mono, color: KH.muted, fontSize: 11, marginLeft: 8 }}>{o.ptId} · {o.age}</span>
                  </div>
                  <div style={{ fontSize: 12, color: KH.body, marginTop: 1 }}>{o.test} <span style={{ color: KH.muted, fontSize: 11 }}>· {o.from}</span></div>
                </div>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: c, background: bg, padding: '3px 9px', borderRadius: 999 }}>{o.s}</span>
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {o.result ? (
                    <span style={{
                      fontSize: 13, fontWeight: 700, fontFamily: o.result.match(/\d/) ? KH.mono : KH.font,
                      color: o.flag === 'low' || o.flag === 'high' || /positive|reactive(?!.*non)/i.test(o.result) && !/non/i.test(o.result) ? KH.amber : KH.body,
                      padding: '4px 10px', background: KH.bg, borderRadius: 6, border: `1px solid ${KH.line}`,
                    }}>
                      {o.result}{o.flag === 'low' && <span style={{ marginLeft: 4, color: KH.amber, fontSize: 11 }}>↓</span>}
                    </span>
                  ) : (
                    choices.slice(0, 4).map(opt => (
                      <button key={opt} style={{
                        fontSize: 12, fontWeight: 600,
                        padding: '4px 10px', borderRadius: 6,
                        border: `1px solid ${KH.line}`, background: KH.surface, color: KH.body, cursor: 'pointer',
                      }}>{opt}</button>
                    ))
                  )}
                </div>
                <span style={{ fontFamily: KH.mono, fontSize: 11, color: KH.muted }}>{o.t}</span>
                <div style={{ textAlign: 'right' }}>
                  {o.s === 'Result' && <button style={{ background: KH.green, color: '#fff', border: 0, borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 700 }}>Send</button>}
                  {o.s === 'Sent' && <span style={{ fontSize: 10, color: KH.green, fontFamily: KH.mono }}>✓</span>}
                  {(o.s === 'New' || o.s === 'Running') && <span style={{ fontSize: 10, color: KH.muted, fontFamily: KH.mono }}>—</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Single critical callout — abnormal results awaiting clinician */}
        <div style={{ marginTop: 16, background: KH.surface, border: `1px solid ${KH.amber}40`, borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 11, fontFamily: KH.mono, color: KH.amber, letterSpacing: '0.06em', fontWeight: 700, flexShrink: 0 }}>2 ABNORMAL · CLINICIAN NOTIFIED</div>
          <div style={{ display: 'flex', gap: 16, flex: 1, fontSize: 13 }}>
            <span><b>Auma Beatrice</b> · HB <span style={{ color: KH.amber, fontWeight: 700, fontFamily: KH.mono }}>9.4 g/dL ↓</span></span>
            <span><b>Mukasa David</b> · CBC <span style={{ color: KH.amber, fontWeight: 700, fontFamily: KH.mono }}>WBC 11.4 ↑ · Plt 128 ↓</span></span>
          </div>
        </div>
      </div>
    </WebShell>
  );
}

// ── Web 5: Analyst — Tableau-style dashboard + report library ──
function WebAnalyst() {
  const Spark = ({ values, color = KH.cobalt, height = 36 }) => {
    const max = Math.max(...values);
    const min = Math.min(...values);
    return (
      <svg width="100%" height={height} viewBox={`0 0 ${values.length * 10} ${height}`} preserveAspectRatio="none">
        <polyline
          fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          points={values.map((v, i) => `${i * 10},${height - ((v - min) / (max - min || 1)) * (height - 4) - 2}`).join(' ')}
        />
      </svg>
    );
  };
  const Bars = ({ values, color = KH.cobalt, height = 80 }) => {
    const max = Math.max(...values);
    return (
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height }}>
        {values.map((v, i) => (
          <div key={i} style={{ flex: 1, height: `${(v / max) * 100}%`, background: color, borderRadius: 2, opacity: 0.4 + (v / max) * 0.6 }}/>
        ))}
      </div>
    );
  };

  const trend = [22, 31, 28, 35, 42, 38, 51, 47, 55, 49, 62, 58, 64, 71];
  const revenue = [1200, 1450, 1380, 1620, 1850, 1740, 2050, 1980, 2240, 2180, 2410, 2520, 2680, 2810];

  return (
    <WebShell role="analyst" activeNav="overview">
      <WebTopBar
        subtitle="DATA · MAY 2026 · 3 CLINICS"
        title="Overview"
        actions={<>
          <div style={{ background: KH.surface, border: `1px solid ${KH.line}`, borderRadius: 8, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span style={{ fontSize: 11, fontFamily: KH.mono, color: KH.muted }}>RANGE</span>
            <span style={{ fontWeight: 600 }}>1 May – 31 May 2026</span>
            <span style={{ color: KH.muted, fontSize: 11 }}>▾</span>
          </div>
          <button style={{ background: KH.surface, color: KH.body, border: `1px solid ${KH.line}`, borderRadius: 8, padding: '8px 12px', fontWeight: 500, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}>{W_ICONS.download} Export</button>
          <button style={{ background: KH.cobalt, color: '#fff', border: 0, borderRadius: 8, padding: '8px 14px', fontWeight: 600, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}>+ New report</button>
        </>}
      />

      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>

        {/* HEADLINE KPIs — clinic-wide */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            ['REVENUE · MAY',   'UGX 28.1M',  '+12% vs Apr', revenue, KH.cobalt],
            ['OPD VISITS',      '1,284',      '+12%',        trend,   KH.cobalt],
            ['UNIQUE PATIENTS', '942',        '+8%',         trend.map(v=>v*0.8), KH.slate],
            ['AVG VISIT TIME',  '9m 14s',     '−1m 8s',      [12,11,11,10,10,10,9,9,9,9,9.2], KH.green],
            ['DATA QUALITY',    '94%',        '+3pp',        [88,90,89,92,91,94,94], KH.green],
          ].map(([l, v, d, vals, color]) => (
            <div key={l} style={{ background: KH.surface, border: `1px solid ${KH.line}`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 10, fontFamily: KH.mono, color: KH.muted, letterSpacing: '0.06em' }}>{l}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 }}>
                <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>{v}</span>
                <span style={{ fontSize: 11, color: KH.green, fontFamily: KH.mono, fontWeight: 600 }}>{d}</span>
              </div>
              <div style={{ marginTop: 8 }}><Spark values={vals} color={color} height={32}/></div>
            </div>
          ))}
        </div>

        {/* MAIN — revenue chart + clinic compare */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16, marginBottom: 20 }}>
          <div style={{ background: KH.surface, border: `1px solid ${KH.line}`, borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Revenue · daily</div>
                <div style={{ fontSize: 12, color: KH.muted }}>Payments processed through Karibu · last 14 days</div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {['14d', '30d', '90d', 'YTD'].map((t, i) => (
                  <span key={t} style={{ fontSize: 12, fontWeight: 500, padding: '4px 10px', borderRadius: 6, background: i === 0 ? KH.cobaltSoft : 'transparent', color: i === 0 ? KH.cobalt : KH.muted }}>{t}</span>
                ))}
              </div>
            </div>
            <Bars values={revenue} color={KH.cobalt} height={140}/>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: KH.muted, fontFamily: KH.mono, marginTop: 6 }}>
              <span>24 APR</span><span>1 MAY</span><span>7 MAY</span>
            </div>
          </div>

          <div style={{ background: KH.surface, border: `1px solid ${KH.line}`, borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Clinic compare · revenue</div>
            <div style={{ fontSize: 12, color: KH.muted, marginBottom: 14 }}>UGX, last 14 days</div>
            {[
              ['Susunga HC III',  'Pilot',      [22,31,28,35,42,38,51,47,55,49,62,58,64,71], KH.cobalt, '28.1M'],
              ['Mityana HC III',  'Active',     [18,24,22,28,30,27,34,32,38,36,40,39,42,45], KH.slate,  '17.4M'],
              ['Kayunga HC III',  'Onboarding', [8,12,10,14,18,16,21,19,22,24,26,28,32,35],  KH.amber,  '9.2M'],
            ].map(([n, t, vals, c, total]) => (
              <div key={n} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{n}</span>
                    <span style={{ fontSize: 11, color: KH.muted, marginLeft: 8 }}>{t}</span>
                  </div>
                  <span style={{ fontFamily: KH.mono, fontSize: 12, fontWeight: 700 }}>UGX {total}</span>
                </div>
                <Bars values={vals} color={c} height={32}/>
              </div>
            ))}
          </div>
        </div>

        {/* REPORT LIBRARY — Tableau-style report tiles */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>Reports</div>
            <div style={{ fontSize: 12, color: KH.muted }}>Open a report, drill down, save your view, or build a custom workbench.</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ background: KH.surface, color: KH.body, border: `1px solid ${KH.line}`, borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 500 }}>Standard</button>
            <button style={{ background: 'transparent', color: KH.muted, border: '1px solid transparent', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 500 }}>My saved (4)</button>
            <button style={{ background: 'transparent', color: KH.muted, border: '1px solid transparent', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 500 }}>HMIS</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          <ReportTile
            tag="FINANCIAL"
            title="Clinic profitability"
            desc="Revenue, fees, payouts, margin per clinic. Drill down by service line."
            stats={[['Margin', '34%', KH.green], ['Net', 'UGX 9.6M', null]]}
            mini={<Bars values={[40,42,44,46,45,48,52,49,54,57,60,62,64,68]} color={KH.cobalt} height={50}/>}
          />
          <ReportTile
            tag="CLINICAL"
            title="Disease burden"
            desc="Top diagnoses by month, age band, and clinic. Outbreak watch."
            stats={[['Malaria', '418', KH.amber], ['URTI', '162', null]]}
            mini={
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 50 }}>
                {[418,162,128,92,76,67,41].map((v, i) => (
                  <div key={i} style={{ flex: 1, height: `${(v/418)*100}%`, background: i === 0 ? KH.amber : KH.slate, borderRadius: 2, opacity: 0.7 }}/>
                ))}
              </div>
            }
          />
          <ReportTile
            tag="POPULATION"
            title="Demographics"
            desc="Age, sex, geography, repeat-visit rate. Catchment vs registered."
            stats={[['<5 yrs', '24%', null], ['Female', '58%', null]]}
            mini={
              <div style={{ height: 50, display: 'flex', alignItems: 'flex-end', gap: 3 }}>
                {[18,32,46,38,28,22,16,10,6].map((v, i) => (
                  <div key={i} style={{ flex: 1, height: `${(v/46)*100}%`, background: KH.slate, borderRadius: 2, opacity: 0.5 + (v/46)*0.5 }}/>
                ))}
              </div>
            }
          />
          <ReportTile
            tag="CLINICAL"
            title="Care delivered"
            desc="Visits, scripts, labs, ANC visits, vaccinations, referrals."
            stats={[['Scripts', '1,847', null], ['Labs', '624', null]]}
            mini={<Spark values={[120,140,135,160,180,170,210,205,230,225,260,270,290,310]} color={KH.green} height={50}/>}
          />
          <ReportTile
            tag="QUALITY"
            title="30-day readmission"
            desc="Patients returning within 30 days for the same complaint."
            stats={[['Rate', '4.8%', KH.green], ['↓ vs Apr', '0.6pp', KH.green]]}
            mini={<Spark values={[6.2, 5.8, 5.6, 5.4, 5.2, 5.1, 4.9, 4.8]} color={KH.green} height={50}/>}
            hot
          />
          <ReportTile
            tag="COMPLIANCE"
            title="HMIS 105"
            desc="Monthly outpatient submission. Data quality gates."
            stats={[['Status', 'In review', KH.amber], ['Issues', '12', KH.amber]]}
            mini={
              <div style={{ display: 'flex', gap: 4, height: 50, alignItems: 'flex-end' }}>
                {[88,90,89,92,91,94,94].map((v,i) => (
                  <div key={i} style={{ flex: 1, height: `${v}%`, background: KH.cobalt, borderRadius: 2, opacity: 0.5 + (v-85)/15 }}/>
                ))}
              </div>
            }
          />
          <ReportTile
            tag="CUSTOM"
            title="Workbench"
            desc="Build your own report. Drag fields. Save views. Schedule emails."
            workbench
          />
          <ReportTile
            tag="SAVED · YOURS"
            title="Diocese roll-up"
            desc="Your saved view across the 3 partner clinics, weekly."
            stats={[['Clinics', '3', null], ['Schedule', 'Mon 8am', null]]}
            mini={<Spark values={[1.2, 1.4, 1.5, 1.7, 1.9, 2.1, 2.3, 2.5, 2.7]} color={KH.slate} height={50}/>}
          />
          <ReportTile
            tag="SAVED · YOURS"
            title="Outbreak watch"
            desc="Triggers an alert if any DX exceeds 2× rolling baseline."
            stats={[['Alerts', '0', KH.green], ['Watching', '8 dx', null]]}
            mini={
              <div style={{ height: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', color: KH.green, fontSize: 12, fontFamily: KH.mono, fontWeight: 600 }}>
                ● ALL CLEAR
              </div>
            }
          />
        </div>
      </div>
    </WebShell>
  );
}

// Report tile component — used in analyst overview
function ReportTile({ tag, title, desc, stats, mini, hot, workbench }) {
  if (workbench) {
    return (
      <div style={{
        background: `linear-gradient(135deg, ${KH.cobaltSoft} 0%, ${KH.surface} 100%)`,
        border: `1px dashed ${KH.cobalt}50`, borderRadius: 12, padding: 18,
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        cursor: 'pointer',
      }}>
        <div>
          <div style={{ fontSize: 10, fontFamily: KH.mono, color: KH.cobalt, letterSpacing: '0.08em', fontWeight: 700, marginBottom: 8 }}>{tag}</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: KH.cobalt, letterSpacing: '-0.01em' }}>{title}</div>
          <div style={{ fontSize: 12, color: KH.body, marginTop: 6 }}>{desc}</div>
        </div>
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ display: 'inline-flex', width: 32, height: 32, borderRadius: 8, background: KH.cobalt, color: '#fff', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 600 }}>+</span>
          <span style={{ fontSize: 13, color: KH.cobalt, fontWeight: 600 }}>Start a new report →</span>
        </div>
      </div>
    );
  }
  return (
    <div style={{
      background: KH.surface, border: `1px solid ${hot ? KH.amber + '60' : KH.line}`,
      borderRadius: 12, padding: 18, cursor: 'pointer',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div>
        <div style={{ fontSize: 10, fontFamily: KH.mono, color: hot ? KH.amber : KH.muted, letterSpacing: '0.08em', fontWeight: 700, marginBottom: 6 }}>{tag}</div>
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em' }}>{title}</div>
        <div style={{ fontSize: 12, color: KH.muted, marginTop: 4, lineHeight: 1.45 }}>{desc}</div>
      </div>
      {mini}
      <div style={{ display: 'flex', gap: 14, paddingTop: 4, borderTop: `1px solid ${KH.lineSoft}` }}>
        {stats && stats.map(([l, v, c]) => (
          <div key={l}>
            <div style={{ fontSize: 10, fontFamily: KH.mono, color: KH.muted, letterSpacing: '0.04em' }}>{l.toUpperCase()}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: c || KH.ink, fontFamily: KH.mono }}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { WebPharmacy, WebLab, WebAnalyst });
