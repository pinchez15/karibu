// Karibu Health landing — icons (24×24, currentColor, 1.8px stroke) + UI primitives.

const I = {
  mic: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="100%" height="100%"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>,
  phone: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="100%" height="100%"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10.5 18.5h3"/></svg>,
  wifi: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="100%" height="100%"><path d="M2 8.5a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8.5 15.5a6 6 0 0 1 7 0"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/></svg>,
  record: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="100%" height="100%"><path d="M3 12h3l2-5 4 14 3-9 2 3h4"/></svg>,
  layers: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="100%" height="100%"><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5M3 8.5v5M21 8.5v5"/></svg>,
  scale: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="100%" height="100%"><rect x="2" y="6" width="7" height="12" rx="1.5"/><rect x="11.5" y="4" width="10.5" height="9" rx="1.5"/><path d="M16.75 16v2M13.5 18h6.5"/></svg>,
  sparkle: <svg viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%"><path d="M12 2l1.7 5.3L19 9l-5.3 1.7L12 16l-1.7-5.3L5 9l5.3-1.7zM19 14l.9 2.6L22 18l-2.1.9-.9 2.1-1-2.1L16 18l1.9-1.4z"/></svg>,
  learn: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="100%" height="100%"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M7 9.5V15c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V9.5"/><path d="M21 7v5"/></svg>,
  stethoscope: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="100%" height="100%"><path d="M5 3v5a4 4 0 0 0 8 0V3"/><path d="M9 16v0a5 5 0 0 0 10 0v-2"/><circle cx="19" cy="11" r="2.2"/></svg>,
  shield: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="100%" height="100%"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg>,
  arrow: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="100%" height="100%"><path d="M5 12h14M13 5l7 7-7 7"/></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="100%" height="100%"><path d="M20 6L9 17l-5-5"/></svg>,
  clock: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="100%" height="100%"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>,
  pulse: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="100%" height="100%"><path d="M22 12h-4l-3 8-6-16-3 8H2"/></svg>,
  globe: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="100%" height="100%"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.7 3.8 9S14.5 18.5 12 21c-2.5-2.5-3.8-5.7-3.8-9S9.5 5.5 12 3z"/></svg>,
  flask: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="100%" height="100%"><path d="M9 3h6M10 3v6L4.5 18.5A1.5 1.5 0 0 0 5.8 21h12.4a1.5 1.5 0 0 0 1.3-2.5L14 9V3"/><path d="M7 15h10"/></svg>,
  pill: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="100%" height="100%"><rect x="3" y="9" width="18" height="6" rx="3" transform="rotate(-30 12 12)"/><path d="M9.6 7.4l4 7"/></svg>,
  receipt: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="100%" height="100%"><path d="M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21V3z"/><path d="M9 8h6M9 12h6"/></svg>,
  bed: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="100%" height="100%"><path d="M3 8v12M3 17h18v3M21 17v-3a3 3 0 0 0-3-3H10v6"/><circle cx="6.5" cy="11.5" r="1.6"/></svg>,
  heart: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="100%" height="100%"><path d="M12 20s-7-4.5-9.2-9C1.3 8 2.6 4.8 5.8 4.8c2 0 3.3 1.3 4.2 2.7.9-1.4 2.2-2.7 4.2-2.7 3.2 0 4.5 3.2 3 6.2C19 15.5 12 20 12 20z"/></svg>,
  box: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="100%" height="100%"><path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8"/></svg>,
  trending: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="100%" height="100%"><path d="M3 17l6-6 4 4 7-7M14 8h5v5"/></svg>,
  refer: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="100%" height="100%"><path d="M7 17L17 7M9 7h8v8"/></svg>,
  droplet: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="100%" height="100%"><path d="M12 3s6 6.3 6 10.5A6 6 0 0 1 6 13.5C6 9.3 12 3 12 3z"/></svg>,
  users: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="100%" height="100%"><circle cx="9" cy="8" r="3.4"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17.5" cy="9" r="2.6"/><path d="M16 14.4c2.6.3 4.6 2.4 4.6 5.1"/></svg>,
};

// Sized icon wrapper.
function Icon({ name, size = 20, color, style }) {
  return <span style={{ display: 'inline-flex', width: size, height: size, color, flexShrink: 0, ...style }}>{I[name]}</span>;
}

function Container({ children, w = 1180, style }) {
  return <div style={{ maxWidth: w, margin: '0 auto', padding: '0 32px', width: '100%', boxSizing: 'border-box', ...style }}>{children}</div>;
}

function Eyebrow({ children, color = KH.muted, style }) {
  return <div style={{ fontFamily: KH.mono, fontSize: 12, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color, ...style }}>{children}</div>;
}

function Btn({ kind = 'primary', children, href, onClick, icon, iconRight, size = 'md', accent = KH.cobalt, style }) {
  const pads = { sm: '9px 15px', md: '12px 20px', lg: '15px 26px' };
  const fs = { sm: 13.5, md: 14.5, lg: 16 };
  const kinds = {
    primary: { background: accent, color: '#fff', border: '1px solid transparent', boxShadow: '0 1px 2px rgba(11,20,82,0.12), 0 6px 16px ' + accent + '24' },
    dark: { background: KH.ink, color: '#fff', border: '1px solid transparent' },
    ghost: { background: KH.surface, color: KH.ink, border: `1px solid ${KH.line}` },
    ghostDark: { background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.22)' },
    soft: { background: accent + '14', color: accent, border: `1px solid ${accent}26` },
    link: { background: 'transparent', color: accent, border: '1px solid transparent', padding: '0', boxShadow: 'none' },
  };
  const k = kinds[kind];
  const Tag = href ? 'a' : 'button';
  return (
    <Tag href={href} onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      fontFamily: KH.font, fontWeight: 600, fontSize: fs[size], padding: kind === 'link' ? 0 : pads[size],
      borderRadius: 11, cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap', lineHeight: 1.1,
      transition: 'transform 130ms ease, filter 130ms ease, box-shadow 130ms ease', ...k, ...style,
    }}
    onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(0.97)'; if (kind !== 'link') e.currentTarget.style.transform = 'translateY(-1px)'; }}
    onMouseLeave={e => { e.currentTarget.style.filter = 'none'; e.currentTarget.style.transform = 'none'; }}>
      {icon && <Icon name={icon} size={size === 'lg' ? 19 : 17} />}{children}{iconRight && <Icon name={iconRight} size={size === 'lg' ? 19 : 17} />}
    </Tag>
  );
}

// Scroll reveal. Visible by default (above-the-fold always paints, and any
// JS/observer flakiness can never hide content). Below-the-fold elements are
// hidden on mount then animated in as they scroll into view.
function Reveal({ children, delay = 0, y = 18, style }) {
  const ref = React.useRef(null);
  const [seen, setSeen] = React.useState(true);
  React.useEffect(() => {
    const el = ref.current; if (!el || typeof IntersectionObserver === 'undefined') return;
    const rect = el.getBoundingClientRect();
    const below = rect.top > (window.innerHeight || 800) * 0.92;
    if (!below) return; // above the fold: leave visible
    setSeen(false); // off-screen, safe to hide
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });
    io.observe(el);
    const t = setTimeout(() => { setSeen(true); io.disconnect(); }, 1600); // failsafe
    return () => { io.disconnect(); clearTimeout(t); };
  }, []);
  return (
    <div ref={ref} style={{
      opacity: seen ? 1 : 0, transform: seen ? 'none' : `translateY(${y}px)`,
      transition: `opacity 680ms cubic-bezier(.16,.84,.44,1) ${delay}ms, transform 680ms cubic-bezier(.16,.84,.44,1) ${delay}ms`,
      ...style,
    }}>{children}</div>
  );
}

Object.assign(window, { I, Icon, Container, Eyebrow, Btn, Reveal });
