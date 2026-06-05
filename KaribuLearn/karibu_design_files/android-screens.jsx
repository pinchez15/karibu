// Karibu Health — Android screens
// Light + dark variants, M3-ish but Karibu-branded.

const KH_ICONS = {
  search: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>,
  plus: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>,
  mic: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>,
  chevron: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>,
  back: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>,
  more: <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>,
  sparkle: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.7 5.3L19 9l-5.3 1.7L12 16l-1.7-5.3L5 9l5.3-1.7zM19 14l.9 2.6L22 18l-2.1.9-.9 2.1-1-2.1L16 18l1.9-1.4z"/></svg>,
  wifi: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01"/></svg>,
  check: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>,
};

// Theme helper for Android
function useKHTheme(dark) {
  return dark ? {
    bg: KH.darkBg, surface: KH.darkSurface, surfaceHi: KH.darkSurfaceHi,
    line: KH.darkLine, ink: KH.darkInk, body: KH.darkBody, muted: KH.darkMuted,
    primary: '#7E91FF', primarySoft: 'rgba(126,145,255,0.12)',
    amber: KH.darkAmber, amberSoft: 'rgba(255,194,87,0.12)',
    green: '#3DD68C', greenSoft: 'rgba(61,214,140,0.12)',
  } : {
    bg: KH.bg, surface: KH.surface, surfaceHi: '#FAFBFE',
    line: KH.line, ink: KH.ink, body: KH.body, muted: KH.muted,
    primary: KH.cobalt, primarySoft: KH.cobaltSoft,
    amber: KH.amber, amberSoft: KH.amberSoft,
    green: KH.green, greenSoft: KH.greenSoft,
  };
}

// Status bar (Karibu-styled, replaces stock)
function KHStatusBar({ t, dark }) {
  const c = dark ? '#fff' : KH.ink;
  return (
    <div style={{ height: 32, padding: '0 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: KH.font, color: c, fontSize: 13, fontWeight: 600 }}>
      <div>9:42</div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', opacity: 0.8 }}>
        <span style={{ fontFamily: KH.mono, fontSize: 10 }}>4G</span>
        <span style={{ width: 14, height: 8, borderRadius: 2, border: `1.5px solid ${c}`, position: 'relative' }}>
          <span style={{ position: 'absolute', inset: 1, right: 5, background: c, borderRadius: 1 }}/>
        </span>
      </div>
    </div>
  );
}

// Reusable phone shell (no Material 3 chrome — Karibu chrome)
function KHPhone({ children, dark = false, statusOnly = false }) {
  const t = useKHTheme(dark);
  return (
    <div style={{
      width: 360, height: 760, borderRadius: 36,
      background: t.bg, fontFamily: KH.font, color: t.ink,
      overflow: 'hidden', position: 'relative',
      boxShadow: dark
        ? '0 0 0 8px #0a0a0e, 0 0 0 9px #1a1a22, 0 30px 80px rgba(0,0,0,0.45)'
        : '0 0 0 8px #1a1d2b, 0 0 0 9px #2a2d3b, 0 30px 80px rgba(20,30,80,0.18)',
    }}>
      <KHStatusBar t={t} dark={dark} />
      <div style={{ height: 'calc(100% - 32px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
      {/* gesture bar */}
      <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', width: 110, height: 4, borderRadius: 2, background: dark ? '#fff' : '#1a1d2b', opacity: 0.4 }} />
    </div>
  );
}

// ── 1) Home / Queue ───────────────────────────────────────────
function ScreenHome({ dark }) {
  const t = useKHTheme(dark);
  const queue = [
    { id: 'PT-100015', name: 'Nakato Sarah', age: '34F', cc: 'Fever, headache 3d', wait: '8 min', status: 'waiting', vit: 'BP 128/82' },
    { id: 'PT-100016', name: 'Okello James', age: '7M', cc: 'Cough, mild fever', wait: '12 min', status: 'vitals', vit: 'T 38.4°C' },
    { id: 'PT-100018', name: 'Namusoke Grace', age: '28F · ANC', cc: 'Routine prenatal', wait: '15 min', status: 'waiting' },
    { id: 'PT-100021', name: 'Mukasa David', age: '52M', cc: 'BP follow-up', wait: '22 min', status: 'urgent', vit: 'BP 168/104' },
  ];
  return (
    <KHPhone dark={dark}>
      {/* App bar */}
      <div style={{ padding: '12px 20px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <KaribuMark size={28} color={dark ? '#fff' : KH.cobalt} fg={dark ? KH.cobalt : '#fff'} />
          <div>
            <div style={{ fontSize: 11, color: t.muted, fontFamily: KH.mono, letterSpacing: '0.04em' }}>SUSUNGA HC III</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Dr. Akello</div>
          </div>
        </div>
        <div style={{ width: 36, height: 36, borderRadius: 18, background: t.primarySoft, color: t.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 13 }}>RA</div>
      </div>

      {/* Hero */}
      <div style={{ padding: '6px 20px 16px' }}>
        <div style={{ fontSize: 13, color: t.muted, marginBottom: 4 }}>Today, Thu 7 May</div>
        <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.05 }}>
          <span style={{ color: t.ink }}>12 seen.</span> <span style={{ color: t.primary }}>6 waiting.</span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <div style={{ flex: 1, background: t.surface, border: `1px solid ${t.line}`, borderRadius: 12, padding: '10px 12px' }}>
            <div style={{ fontSize: 11, color: t.muted, fontFamily: KH.mono }}>TO REVIEW</div>
            <div style={{ fontSize: 22, fontWeight: 600, marginTop: 2 }}>2</div>
          </div>
          <div style={{ flex: 1, background: t.surface, border: `1px solid ${t.line}`, borderRadius: 12, padding: '10px 12px' }}>
            <div style={{ fontSize: 11, color: t.muted, fontFamily: KH.mono }}>TO SYNC</div>
            <div style={{ fontSize: 22, fontWeight: 600, marginTop: 2, display: 'flex', alignItems: 'baseline', gap: 6 }}>
              3 <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.amber }}/>
            </div>
          </div>
          <div style={{ flex: 1, background: t.surface, border: `1px solid ${t.line}`, borderRadius: 12, padding: '10px 12px' }}>
            <div style={{ fontSize: 11, color: t.muted, fontFamily: KH.mono }}>AVG TIME</div>
            <div style={{ fontSize: 22, fontWeight: 600, marginTop: 2 }}>9m</div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '0 20px 12px' }}>
        <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 12, height: 44, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10, color: t.muted }}>
          {KH_ICONS.search}
          <span style={{ fontSize: 14 }}>Find patient by phone or name</span>
        </div>
      </div>

      {/* Queue list */}
      <div style={{ flex: 1, overflow: 'hidden', padding: '4px 20px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: t.ink }}>Queue</div>
          <div style={{ fontSize: 12, color: t.muted, fontFamily: KH.mono }}>4 PATIENTS</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {queue.map((p, i) => {
            const statusColor = p.status === 'urgent' ? t.amber : p.status === 'vitals' ? t.green : t.primary;
            const statusBg = p.status === 'urgent' ? t.amberSoft : p.status === 'vitals' ? t.greenSoft : t.primarySoft;
            const statusLabel = p.status === 'urgent' ? 'Urgent' : p.status === 'vitals' ? 'In vitals' : 'Waiting';
            return (
              <div key={i} style={{
                background: t.surface, border: `1px solid ${t.line}`, borderRadius: 14, padding: 12,
                borderLeft: `3px solid ${statusColor}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>{p.name}</span>
                    <span style={{ fontSize: 12, color: t.muted, fontFamily: KH.mono }}>{p.age}</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: statusColor, background: statusBg, padding: '3px 8px', borderRadius: 999 }}>{statusLabel}</span>
                </div>
                <div style={{ fontSize: 13, color: t.body }}>{p.cc}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12, color: t.muted, fontFamily: KH.mono }}>
                  <span>{p.id} · {p.wait}</span>
                  {p.vit && <span>{p.vit}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* FAB */}
      <button style={{
        position: 'absolute', right: 20, bottom: 28, width: 60, height: 60, borderRadius: 20,
        background: t.primary, color: '#fff', border: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 10px 24px ${dark ? 'rgba(126,145,255,0.4)' : 'rgba(31,54,199,0.35)'}`,
        cursor: 'pointer',
      }}>
        {KH_ICONS.plus}
      </button>
    </KHPhone>
  );
}

// ── 2) New visit ──────────────────────────────────────────────
function ScreenNewVisit({ dark }) {
  const t = useKHTheme(dark);
  const Field = ({ label, value, placeholder, mono }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontFamily: KH.mono, color: t.muted, marginBottom: 6, letterSpacing: '0.04em' }}>{label}</div>
      <div style={{
        background: t.surface, border: `1px solid ${t.line}`, borderRadius: 10,
        padding: '12px 14px', fontSize: 15, color: value ? t.ink : t.muted,
        fontFamily: mono ? KH.mono : KH.font,
      }}>{value || placeholder}</div>
    </div>
  );
  return (
    <KHPhone dark={dark}>
      <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10, color: t.ink }}>
        <button style={{ background: 'transparent', border: 0, color: t.ink, padding: 0, display: 'flex' }}>{KH_ICONS.back}</button>
        <div style={{ fontSize: 18, fontWeight: 600 }}>New visit</div>
      </div>
      <div style={{ flex: 1, padding: '8px 20px 20px', overflow: 'auto' }}>
        <div style={{ fontSize: 12, fontFamily: KH.mono, color: t.muted, marginBottom: 16, letterSpacing: '0.04em' }}>STEP 1 OF 3 · PATIENT</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <Field label="FIRST NAME" value="Nakato" />
          <Field label="LAST NAME" value="Sarah" />
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontFamily: KH.mono, color: t.muted, marginBottom: 6 }}>SEX</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {['Female', 'Male'].map((s, i) => {
              const active = i === 0;
              return (
                <div key={s} style={{
                  flex: 1, padding: '12px 0', textAlign: 'center', borderRadius: 10,
                  background: active ? t.primary : t.surface,
                  color: active ? '#fff' : t.body,
                  border: `1px solid ${active ? t.primary : t.line}`,
                  fontWeight: 600, fontSize: 14,
                }}>{s}</div>
              );
            })}
          </div>
        </div>

        <Field label="DATE OF BIRTH" value="14-08-1991" mono />
        <Field label="PHONE (optional)" value="+256 772 558 102" mono />

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontFamily: KH.mono, color: t.muted, marginBottom: 6 }}>CHIEF COMPLAINT</div>
          <div style={{
            background: t.surface, border: `1px solid ${t.line}`, borderRadius: 10,
            padding: '12px 14px', fontSize: 15, color: t.ink, minHeight: 70,
          }}>Fever and headache for 3 days. Body weakness. Took panadol with no relief.</div>
        </div>

        {/* Duplicate detected */}
        <div style={{
          background: t.amberSoft, border: `1px solid ${t.amber}33`, borderRadius: 12,
          padding: 14, marginTop: 8,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: t.amber, marginBottom: 4 }}>Possible match</div>
          <div style={{ fontSize: 13, color: t.body, marginBottom: 10 }}>
            A patient with the same name and DOB exists: <span style={{ fontFamily: KH.mono }}>PT-100015</span>, last seen 12 Mar.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ flex: 1, background: t.amber, color: '#3a2400', border: 0, borderRadius: 8, padding: '10px', fontWeight: 600, fontSize: 13 }}>Use existing</button>
            <button style={{ flex: 1, background: 'transparent', color: t.body, border: `1px solid ${t.line}`, borderRadius: 8, padding: '10px', fontWeight: 600, fontSize: 13 }}>Create new</button>
          </div>
        </div>
      </div>

      <div style={{ padding: 20, borderTop: `1px solid ${t.line}`, background: t.surface }}>
        <button style={{ width: '100%', background: t.primary, color: '#fff', border: 0, borderRadius: 12, padding: '14px', fontWeight: 600, fontSize: 15 }}>
          Continue to vitals
        </button>
      </div>
    </KHPhone>
  );
}

// ── 3) Vitals ─────────────────────────────────────────────────
// Height + Weight paired first (drives mg/kg dosing).
// keyboardUp prop shows the keyboard pulled up; the page is still scrollable
// and the focused field is auto-positioned above the keyboard with chip nav.
function ScreenVitals({ dark, keyboardUp = false, focusKey = 'temp' }) {
  const t = useKHTheme(dark);

  // Field meta — order matters; height+weight together (dosage critical)
  const fields = [
    { key: 'height', label: 'HEIGHT',  value: '162',  unit: 'cm' },
    { key: 'weight', label: 'WEIGHT',  value: '62.4', unit: 'kg' },
    { key: 'temp',   label: 'TEMP',    value: '38.4', unit: '°C', hot: true },
    { key: 'bps',    label: 'BP SYS',  value: '128',  unit: 'mmHg' },
    { key: 'bpd',    label: 'BP DIA',  value: '82',   unit: 'mmHg' },
    { key: 'pulse',  label: 'PULSE',   value: '92',   unit: 'bpm' },
    { key: 'resp',   label: 'RESP',    value: '18',   unit: '/min' },
    { key: 'spo2',   label: 'SpO₂',    value: '98',   unit: '%' },
    { key: 'muac',   label: 'MUAC',    value: '—',    unit: 'cm' },
  ];

  const VitalInput = ({ f, focused }) => (
    <div style={{
      flex: 1, background: t.surface,
      border: `${focused ? 2 : 1}px solid ${focused ? t.primary : f.hot ? t.amber : t.line}`,
      borderRadius: 12, padding: focused ? '11px 13px' : '12px 14px',
      boxShadow: focused ? `0 0 0 4px ${t.primarySoft}` : 'none',
      transition: 'all 120ms ease',
    }}>
      <div style={{ fontSize: 10, fontFamily: KH.mono, color: focused ? t.primary : t.muted, letterSpacing: '0.05em', fontWeight: 600 }}>{f.label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
        <span style={{ fontSize: 22, fontWeight: 600, color: f.hot ? t.amber : t.ink, fontFamily: KH.mono }}>
          {f.value}{focused && <span style={{ borderLeft: `2px solid ${t.primary}`, marginLeft: 1, animation: 'khcaret 1s steps(2) infinite' }}/>}
        </span>
        <span style={{ fontSize: 12, color: t.muted }}>{f.unit}</span>
      </div>
    </div>
  );

  // Layout — pairs of two
  const rows = [
    [fields[0], fields[1]], // height + weight (top, dose-critical)
    [fields[2], fields[3]], // temp + bp sys (but we want bp pair together)
  ];
  // Restructure: H+W, BP sys+dia, Pulse+Resp, Temp+SpO2, MUAC alone
  const rowed = [
    [fields[0], fields[1]], // HEIGHT, WEIGHT
    [fields[3], fields[4]], // BP SYS, BP DIA
    [fields[5], fields[6]], // PULSE, RESP
    [fields[2], fields[7]], // TEMP, SpO2
    [fields[8]],            // MUAC
  ];

  // Auto-scroll the focused field into view above keyboard.
  // We position the focused row near the top of the visible scroll area.
  const scrollRef = React.useRef(null);
  React.useEffect(() => {
    if (!keyboardUp || !scrollRef.current) return;
    const el = scrollRef.current.querySelector(`[data-vk="${focusKey}"]`);
    if (el && el.scrollIntoView) {
      // use 'nearest' equivalent without scrollIntoView quirks: manual
      const parent = scrollRef.current;
      const target = el.offsetTop - 16;
      parent.scrollTo({ top: target, behavior: 'smooth' });
    }
  }, [keyboardUp, focusKey]);

  // Find current focused field index, for prev/next chip nav
  const flat = rowed.flat();
  const fIdx = flat.findIndex(f => f.key === focusKey);
  const prev = flat[Math.max(0, fIdx - 1)];
  const next = flat[Math.min(flat.length - 1, fIdx + 1)];

  return (
    <KHPhone dark={dark}>
      <style>{`@keyframes khcaret { 50% { opacity: 0 } }`}</style>

      <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button style={{ background: 'transparent', border: 0, color: t.ink, padding: 0, display: 'flex' }}>{KH_ICONS.back}</button>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Vitals</div>
        </div>
        <div style={{ fontSize: 11, fontFamily: KH.mono, color: t.muted, letterSpacing: '0.04em' }}>STEP 2 / 3</div>
      </div>

      {/* Sticky patient strip — always visible so identity is clear when keyboard is up */}
      <div style={{
        margin: '0 20px', padding: '10px 12px', background: t.surfaceHi, borderRadius: 10,
        border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Nakato Sarah</div>
          <div style={{ fontSize: 11, color: t.muted, fontFamily: KH.mono }}>PT-100015 · 34F</div>
        </div>
        <div style={{ fontSize: 11, color: t.muted, fontFamily: KH.mono, textAlign: 'right' }}>
          {fIdx + 1} of {flat.length}
        </div>
      </div>

      {/* Scrollable vitals area */}
      <div ref={scrollRef} style={{ flex: 1, padding: '12px 20px 20px', overflow: 'auto', minHeight: 0 }}>
        {rowed.map((row, ri) => (
          <div key={ri} style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            {row.map(f => (
              <div key={f.key} data-vk={f.key} style={{ flex: row.length === 1 ? 0.5 : 1 }}>
                <VitalInput f={f} focused={keyboardUp && f.key === focusKey} />
              </div>
            ))}
            {row.length === 1 && <div style={{ flex: 0.5 }}/>}
          </div>
        ))}

        {/* AI hint — note inline placement so it scrolls with the form */}
        <div style={{
          marginTop: 6,
          background: t.amberSoft, border: `1px solid ${t.amber}33`, borderRadius: 12,
          padding: 12, fontSize: 13, color: t.body, display: 'flex', gap: 10,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: t.amber, marginTop: 7, flexShrink: 0 }}/>
          <div>
            <div style={{ fontWeight: 600, color: t.amber }}>Fever flagged · child dose 7.5 mg/kg</div>
            <div style={{ marginTop: 2 }}>Using weight 62.4 kg → AL 4 tabs/dose. Consider malaria RDT.</div>
          </div>
        </div>

        {/* Spacer so the last fields can be scrolled above the keyboard */}
        {keyboardUp && <div style={{ height: 80 }}/>}
      </div>

      {/* Field-nav accessory bar — sits above keyboard, lets you Tab through fields without dismissing */}
      {keyboardUp && (
        <div style={{
          flexShrink: 0, background: t.surfaceHi, borderTop: `1px solid ${t.line}`,
          padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <button style={{ background: 'transparent', border: 0, color: t.body, fontSize: 13, fontWeight: 600, padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 4, opacity: prev === flat[fIdx] ? 0.3 : 1 }}>
            <span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}>{KH_ICONS.chevron}</span>
            {prev.label}
          </button>
          <div style={{ flex: 1, textAlign: 'center', fontSize: 11, fontFamily: KH.mono, color: t.muted }}>
            {flat[fIdx].label} · {flat[fIdx].unit}
          </div>
          <button style={{ background: t.primarySoft, border: 0, color: t.primary, fontSize: 13, fontWeight: 600, padding: '6px 10px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
            {next.label}
            {KH_ICONS.chevron}
          </button>
        </div>
      )}

      {/* Bottom action OR keyboard */}
      {!keyboardUp ? (
        <div style={{ padding: 20, borderTop: `1px solid ${t.line}`, background: t.surface, display: 'flex', gap: 10, flexShrink: 0 }}>
          <button style={{ flex: 1, background: 'transparent', color: t.body, border: `1px solid ${t.line}`, borderRadius: 12, padding: '14px', fontWeight: 600, fontSize: 14 }}>
            Skip
          </button>
          <button style={{ flex: 2, background: t.primary, color: '#fff', border: 0, borderRadius: 12, padding: '14px', fontWeight: 600, fontSize: 15 }}>
            Save and continue
          </button>
        </div>
      ) : (
        <KHNumericKeyboard t={t} dark={dark} />
      )}
    </KHPhone>
  );
}

// Numeric keyboard — purpose-built for vitals (no QWERTY noise)
function KHNumericKeyboard({ t, dark }) {
  const Key = ({ k, wide, primary }) => (
    <div style={{
      flex: wide ? 1.6 : 1,
      height: 42, borderRadius: 8,
      background: primary ? t.primary : (dark ? '#2A3360' : '#FFFFFF'),
      color: primary ? '#fff' : t.ink,
      border: `1px solid ${dark ? '#39437A' : '#D1D5E2'}`,
      boxShadow: dark ? 'none' : '0 1px 0 rgba(20,30,80,0.08)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: KH.mono, fontSize: 18, fontWeight: 500,
    }}>{k}</div>
  );
  return (
    <div style={{
      flexShrink: 0,
      background: dark ? '#0F1530' : '#D6DAE5',
      padding: '10px 8px 14px',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      {[['1','2','3'], ['4','5','6'], ['7','8','9'], ['.','0','⌫']].map((row, i) => (
        <div key={i} style={{ display: 'flex', gap: 6 }}>
          {row.map(k => <Key key={k} k={k} />)}
        </div>
      ))}
    </div>
  );
}

// ── 4) Dictation (focus mode) ─────────────────────────────────
function ScreenDictation({ dark }) {
  const t = useKHTheme(dark);
  return (
    <KHPhone dark={dark}>
      <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button style={{ background: 'transparent', border: 0, color: t.ink, padding: 0, display: 'flex' }}>{KH_ICONS.back}</button>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Note</div>
            <div style={{ fontSize: 11, color: t.muted, fontFamily: KH.mono }}>NAKATO SARAH · PT-100015</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: t.green, fontSize: 11, fontFamily: KH.mono, fontWeight: 600 }}>
          {KH_ICONS.wifi} ONLINE
        </div>
      </div>

      <div style={{ flex: 1, padding: '12px 24px', overflow: 'auto' }}>
        <div style={{
          fontSize: 17, lineHeight: 1.55, color: t.ink,
          fontFamily: KH.font, fontWeight: 400,
        }}>
          Patient reports fever and headache for 3 days, also generalized body weakness. No vomiting,
          no diarrhea. Took paracetamol at home with minimal relief. On exam: febrile, mildly
          dehydrated, no neck stiffness. Lungs clear. Heart sounds normal.<br/><br/>
          Likely uncomplicated malaria. Sending for RDT and CBC. Will start ACT if positive.<br/>
          <span style={{ color: t.muted }}>|</span>
        </div>
      </div>

      {/* Soft AI hint */}
      <div style={{ padding: '0 20px 12px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: t.amberSoft, border: `1px solid ${t.amber}33`, borderRadius: 12,
          padding: '10px 14px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: t.amber }}>
            {KH_ICONS.sparkle}
            <span style={{ fontSize: 13, fontWeight: 600 }}>Structure with AI</span>
          </div>
          <span style={{ fontSize: 11, color: t.muted, fontFamily: KH.mono }}>OPTIONAL · ~15s</span>
        </div>
      </div>

      {/* Bottom toolbar */}
      <div style={{ padding: 20, borderTop: `1px solid ${t.line}`, background: t.surface, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button style={{
          width: 56, height: 56, borderRadius: 18, background: t.primary, color: '#fff', border: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 8px 20px ${dark ? 'rgba(126,145,255,0.35)' : 'rgba(31,54,199,0.3)'}`,
        }}>{KH_ICONS.mic}</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: t.body, fontWeight: 600 }}>Tap mic, or use keyboard voice</div>
          <div style={{ fontSize: 11, color: t.muted, fontFamily: KH.mono, marginTop: 2 }}>147 WORDS · AUTO-SAVED 09:48</div>
        </div>
        <button style={{ background: t.primary, color: '#fff', border: 0, borderRadius: 12, padding: '12px 16px', fontWeight: 600, fontSize: 14 }}>Save</button>
      </div>
    </KHPhone>
  );
}

// ── 5) Visit details with AI streaming SOAP ───────────────────
function ScreenVisitDetails({ dark, aiState = 'streaming' }) {
  const t = useKHTheme(dark);
  // aiState: 'idle' | 'streaming' | 'done'
  const streaming = aiState === 'streaming';
  const done = aiState === 'done';

  const Section = ({ label, body, done: secDone, streaming: secStreaming }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6,
      }}>
        <div style={{ fontSize: 11, fontFamily: KH.mono, color: secDone ? t.amber : t.muted, letterSpacing: '0.06em', fontWeight: 600 }}>
          {label}
        </div>
        {secStreaming && (
          <div style={{ display: 'flex', gap: 3 }}>
            {[0,1,2].map(i => (
              <span key={i} style={{
                width: 4, height: 4, borderRadius: '50%', background: t.amber,
                animation: `khpulse 1.2s ${i*0.15}s infinite ease-in-out`,
              }}/>
            ))}
          </div>
        )}
      </div>
      <div style={{
        fontSize: 14, color: secStreaming ? t.muted : t.ink, lineHeight: 1.5,
        opacity: secStreaming ? 0.6 : 1,
      }}>{body}</div>
    </div>
  );

  return (
    <KHPhone dark={dark}>
      <style>{`@keyframes khpulse { 0%, 60%, 100% { opacity: 0.3 } 30% { opacity: 1 } }`}</style>
      <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button style={{ background: 'transparent', border: 0, color: t.ink, padding: 0, display: 'flex' }}>{KH_ICONS.back}</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: streaming ? t.amber : t.green, fontSize: 11, fontFamily: KH.mono, fontWeight: 600 }}>
          {streaming ? <>{KH_ICONS.sparkle} STRUCTURING</> : <>{KH_ICONS.check} READY</>}
        </div>
        <button style={{ background: 'transparent', border: 0, color: t.ink, padding: 0 }}>{KH_ICONS.more}</button>
      </div>

      <div style={{ flex: 1, padding: '4px 20px 80px', overflow: 'auto' }}>
        {/* Patient card */}
        <div style={{
          background: t.surface, border: `1px solid ${t.line}`, borderRadius: 14,
          padding: 14, marginBottom: 12,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>Nakato Sarah</div>
              <div style={{ fontSize: 13, color: t.muted, fontFamily: KH.mono, marginTop: 2 }}>PT-100015 · 34F · +256 772 …</div>
            </div>
            <span style={{ fontSize: 11, color: t.amber, background: t.amberSoft, padding: '4px 10px', borderRadius: 999, fontWeight: 600 }}>Fever</span>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
            {[['T', '38.4°C', t.amber], ['BP', '128/82', t.ink], ['HR', '92', t.ink], ['SpO₂', '98%', t.ink]].map(([k,v,c]) => (
              <div key={k} style={{ fontFamily: KH.mono, fontSize: 12 }}>
                <span style={{ color: t.muted }}>{k} </span>
                <span style={{ color: c, fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* AI streaming card */}
        <div style={{
          background: t.surface,
          border: `1.5px solid ${streaming ? t.amber : t.line}`,
          borderRadius: 14, padding: 16, marginBottom: 12,
          position: 'relative', overflow: 'hidden',
        }}>
          {streaming && (
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 2,
              background: `linear-gradient(90deg, transparent, ${t.amber}, transparent)`,
              backgroundSize: '200% 100%',
              animation: 'khshimmer 1.6s linear infinite',
            }}/>
          )}
          <style>{`@keyframes khshimmer { 0% {background-position: 200% 0} 100% {background-position: -200% 0} }`}</style>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, color: t.amber }}>
            {KH_ICONS.sparkle}
            <span style={{ fontSize: 13, fontWeight: 600 }}>SOAP note</span>
            {streaming && <span style={{ fontSize: 11, color: t.muted, fontFamily: KH.mono, marginLeft: 'auto' }}>~6s</span>}
          </div>

          <Section label="SUBJECTIVE" body="34F presents with 3-day history of fever, headache and generalized body weakness. Took paracetamol at home with minimal relief. No vomiting, diarrhea, or neck stiffness." />
          <Section label="OBJECTIVE" body="T 38.4°C, BP 128/82, HR 92, SpO₂ 98%. Mildly dehydrated. Lungs clear. No meningeal signs." />
          <Section label="ASSESSMENT" body="Likely uncomplicated malaria, pending RDT confirmation. Differential: viral syndrome, UTI." streaming={streaming} />
          <Section label="PLAN" body="Awaiting structure…" streaming={streaming} />
        </div>

        {/* Diagnosis suggestions */}
        <div style={{ marginTop: 4, marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontFamily: KH.mono, color: t.muted, marginBottom: 8, letterSpacing: '0.06em' }}>HMIS CODES — SUGGESTED</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              ['B54', 'Malaria, unspecified', '0.84', true],
              ['R50.9', 'Fever, unspecified', '0.62', false],
            ].map(([code, name, conf, primary]) => (
              <div key={code} style={{
                background: t.surface, border: `1px solid ${t.line}`, borderRadius: 12,
                padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <span style={{ fontFamily: KH.mono, fontSize: 13, fontWeight: 600, color: t.primary }}>{code}</span>
                <span style={{ flex: 1, fontSize: 13 }}>{name}</span>
                <span style={{ fontSize: 11, color: t.muted, fontFamily: KH.mono }}>{conf}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom action */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: 20, borderTop: `1px solid ${t.line}`,
        background: t.surface,
      }}>
        <button style={{
          width: '100%', background: streaming ? t.line : t.primary, color: streaming ? t.muted : '#fff',
          border: 0, borderRadius: 12, padding: '14px', fontWeight: 600, fontSize: 15,
        }}>
          {streaming ? 'Wait for structure…' : 'Approve and proceed to payment'}
        </button>
      </div>
    </KHPhone>
  );
}

Object.assign(window, { ScreenHome, ScreenNewVisit, ScreenVitals, ScreenDictation, ScreenVisitDetails });
