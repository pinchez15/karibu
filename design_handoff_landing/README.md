# Handoff: Karibu Health — Umbrella Landing Page

## Overview
A marketing landing page for **Karibu Health**, the umbrella brand over two products:
- **Karibu EHR** (`Karibu.health`) — the clinical record system for Ugandan health centres (HC II–HC IV). Android-first, scales to tablets/laptops, offline-capable, voice-dictated notes.
- **Karibu Learn** (`Karibu.learn`) — free CME training that runs inside a faithful copy of the EHR.

The page is deliberately written for **two audiences at once**:
- a **Ugandan clinic director** (practical capability: what it does, on what hardware, at what pace), and
- a **US donor/funder** (reach, continuity-of-care, accountability — "every shilling of care goes further").

The signature section is an interactive **"One clinic. One record. Every role."** module that shows one patient's care flowing across Clinician → Lab → Pharmacy → Billing → Maternity on a single record.

---

## About the Design Files
The files in `source/` are **design references created in HTML/React-via-Babel** — prototypes that show the intended look, copy, and behaviour. **They are not production code to copy directly.**

The task is to **recreate this design inside the Karibu monorepo's existing web app** (`apps/web`, Next.js + React, Tailwind/shadcn per `tokens/globals.css`), using its established components, routing, and styling conventions. Treat the HTML/JSX as a precise spec for layout, tokens, copy, and motion — then build it the way the codebase builds everything else.

Key point specific to this repo: **the design tokens already exist in the codebase.** `tokens/globals.css` is a snapshot of the app's real Tailwind token layer (RGB-triple CSS variables for `/<alpha-value>` support). Wire the page to those variables — do **not** hard-code new hex values. `tokens/colors_and_type.css` is the framework-agnostic hex reference for the same palette.

---

## Fidelity
**High-fidelity (hifi).** Final colours, typography, spacing, copy, and interactions are all intentional and specified below. Recreate the UI faithfully using the codebase's existing primitives. Where this design introduces a pattern the codebase doesn't have yet (e.g. the role-switcher), build it as a new component following local conventions.

---

## How to view the reference
- `reference/Karibu-Health-Landing.bundled.html` — a **single self-contained file**. Open it in a browser (or have Claude Code screenshot it) to see the finished design with all motion. This is the source of truth for "what it should look like."
- `source/*` — the editable prototype: one `Karibu Health Landing.html` host that loads nine `kh-*.jsx` modules via Babel. Read these for exact component logic, copy strings, and inline style values.

> Note on rendering: the prototype uses React 18 + Babel-in-browser and a global `KH` token object (`kh-brand.jsx`). In production, replace `KH.*` lookups with the Tailwind tokens from `globals.css`.

---

## Page Structure (top → bottom)
Composed in `source/Karibu Health Landing.html`. Section components live in the noted files.

| # | Section | Component / file | Anchor |
|---|---------|------------------|--------|
| 1 | Sticky nav (glass) | `Nav` · `kh-nav.jsx` | — |
| 2 | Hero | `Hero` · `kh-hero.jsx` | `#top` |
| 3 | Trust strip (4 facts) | `TrustStrip` · `kh-hero.jsx` | — |
| 4 | Two-app split (EHR / Learn) | `ProductSplit` · `kh-hero.jsx` | — |
| 5 | Karibu EHR deep-dive | `EHRSection` · `kh-features.jsx` | `#ehr` |
| 6 | **Roles showcase (centerpiece)** | `RolesShowcase` · `kh-roles.jsx` | `#platform` |
| 7 | Impact / "Why it matters" | `ImpactBand` · `kh-impact.jsx` | `#impact` |
| 8 | Karibu Learn section | `LearnSection` · `kh-features.jsx` | `#learn` |
| 9 | Dark mission band | `MissionBand` · `kh-features.jsx` | `#why` |
| 10 | Apply / final CTA | `FinalCTA` · `kh-features.jsx` | `#apply` |
| 11 | Footer | `Footer` · `kh-features.jsx` | — |

Shared building blocks: `kh-ui.jsx` (`Container`, `Eyebrow`, `Btn`, `Icon`, `Reveal`, `Pill`) and `kh-brand.jsx` (`KH` tokens, `KMark`, `KWordmark`, `KLockup`). Product mock visuals: `kh-visuals.jsx` + `kh-visuals2.jsx`.

---

## Screens / Views (detail)

### 1. Nav (`kh-nav.jsx`)
- **Layout**: Sticky top, full-width, glass effect (`backdrop-filter: blur(12px)`, translucent white bg, 1px bottom hairline). Left: `KLockup` (k+ mark + "Karibu.health"). Center/right: links `Platform · Karibu EHR · Karibu Learn · Impact` (hidden < 920px). Right: ghost "Sign in" + primary "Book a demo".
- **Anchors**: links scroll to `#platform`, `#ehr`, `#learn`, `#impact`.

### 2. Hero (`kh-hero.jsx` → `Hero`)
- **Layout**: 2-col grid `1.05fr 0.95fr`, gap 48, vertically centered. `paddingTop:72 / paddingBottom:96`. Collapses to 1 col < 920px with the visual moved **above** the copy. Two soft radial glows (cobalt top-right, faint coral top-left).
- **Left column** (each line is a `Reveal` with staggered delay 0/70/130/190/250ms):
  - Pill badge: `KARIBU HEALTH` (mono, cobalt on `cobaltSoft`) + "Two apps. One mission."
  - **H1**: "Clinical software for Uganda, built from the first step." — `clamp(40px, 5vw, 64px)`, weight 600, letter-spacing −0.035em, line-height 1.02, color `ink`.
  - **Sub**: "Karibu EHR runs your clinic. Karibu Learn trains the people in it. Both made for how care actually happens here — on the phones you already carry, at the pace you already work." `clamp(16px,1.4vw,19px)`, line-height 1.6, max-width 520.
  - **Buttons**: primary "Explore Karibu EHR" (cobalt, → `#ehr`) + ghost "Try Karibu Learn — free" (coral text/border, → `#learn`).
  - **Mini trust row**: `Runs on any Android · Works offline · Aligned to UCG 2023` (icon + label).
- **Right column**: `HeroEHR` (`kh-visuals.jsx`) — an Android phone mock showing voice dictation: a live animated **waveform**, plus two floating cards ("AI structuring…" in amber, "Note saved" in green) that gently float (`kh-float-a/b`).

### 3. Trust strip (`kh-hero.jsx` → `TrustStrip`)
- 4-col grid, hairline dividers between, `26px` vertical padding, white bg, top+bottom 1px borders. Each cell: mono uppercase label (muted) + 16px/600 value. Content: "Built with / Ugandan clinicians", "Designed for / HC II – HC IV", "Documentation in / minutes, not hours", "Patient data / never leaves the record". → 2 cols < 920px.

### 4. Two-app split (`kh-hero.jsx` → `ProductSplit`)
- Centered header: eyebrow "Two apps, one roof", H2 "One umbrella. Two ways in."
- 2-col grid, gap 22 (→ 1 col < 920px). Two cards, 20px radius, 30px pad, hover lift (`translateY(-3px)` + colored shadow), corner radial glow in the accent.
  - **EHR card** — accent **cobalt**; badge `PER CLINIC`; lockup `Karibu.health`; H3 "The EHR that keeps up with your clinic."; 3 checks; primary CTA "Explore Karibu EHR" → `#ehr`.
  - **Learn card** — accent **coral**; badge `FREE`; lockup `Karibu.learn`; H3 "Free training that feels like the real thing."; 3 checks; CTA "Try Karibu Learn" → `#learn`.

### 5. Karibu EHR deep-dive (`kh-features.jsx` → `EHRSection`, anchor `#ehr`)
Editorial alternating rows (each a `FeatureRow`, image/copy sides flip via `.kh-feat-copy-flip`):
- **Dictate → SOAP**: copy + a visual of a spoken line transforming into a structured SOAP note.
- **Any Android, any scale**: device-scale visual — phone → tablet → laptop (`DeviceScale` in `kh-visuals2.jsx`).
- **A continuous record**: a vertical patient **timeline** of visits (the continuity story).
- **Essentials strip** (editorial, hairline-divided 3-col — NOT cards): `Offline-first` · `Receipts at discharge` · `Guideline-aligned`, each with a 22px cobalt icon, 17px/600 title, 14px body. → stacks, removes left borders < 920px.

### 6. ⭐ Roles showcase — CENTERPIECE (`kh-roles.jsx` → `RolesShowcase`, anchor `#platform`)
The most important and most novel section. **Build its interactivity carefully.**
- **Header**: eyebrow "The whole clinic" (cobalt), H2 "One clinic. One record. Every role.", paragraph about a visit flowing to lab/pharmacy/billing/maternity with nothing re-entered.
- **Flow rail**: 5 evenly-spaced role buttons across a horizontal line — `Clinician · Lab · Pharmacy · Billing · Maternity`. Behind them: a static 2px line plus an animated **"comet"** gradient sweep (`.kh-flow-comet`, 3.4s loop). Each button = a 54×54 rounded-square icon tile + label + a 30×3 progress bar.
  - **Active** tile: filled with that role's `tone`, white icon, colored shadow, `scale(1.06)`; label bolds to `ink`; its progress bar fills over 4.2s (`.kh-rolebar`).
  - Inactive: white tile, muted icon, hairline border.
- **Detail area**: 2-col grid `0.82fr 1.18fr`, gap 44 (→ 1 col < 920px).
  - **Left**: role icon chip + mono role label + H3 headline + body paragraph. Re-animates (`.kh-rolecopy`, fade+rise 460ms) on each change.
  - **Right**: a product-surface "app window" (`Surface`) per role; only the active one is `opacity:1`, others `opacity:0` absolutely-stacked → **crossfade** (opacity+translateY+scale, 460ms).
- **Per-role surface content** (each is a small, realistic product screen — see the panel components in `kh-roles.jsx`):
  - **Clinician** (`tone cobalt`): patient header "Nakato Sarah · 34F", assessment "Uncomplicated malaria · B54", action tiles (Order lab / Prescribe / Refer), an amber AI note ("AI drafted the note and suggested code B54").
  - **Lab** (`tone slate`): "Lab worklist" — 3 specimens with status dots (Malaria RDT → Ready/POSITIVE, Blood sugar → Running, Urinalysis → Received); footer chips "Ordered from the clinician's app" + "Result → phone".
  - **Pharmacy** (`tone green`): "Scripts received" — 3 scripts (AL 24 tabs Dispensed; Paracetamol & ORS To dispense); footer "Sent from the visit" + live stock "AL · 138 left".
  - **Billing** (`tone cobaltDeep`): "Visit charges" — line items (Consultation 5,000 / RDT 4,000 / AL 8,000), **Total UGX 17,000**, plus a mini weekly clinic bar-chart ("tracked daily").
  - **Maternity** (`tone green`): "Inpatient & delivery" ward board — Bed 1 in active labour (6 cm, FHR 142) with a partograph-style mini bar track + next-round timer; Bed 2 post-partum overnight obs; footer "2 mothers admitted · Overnight care".
- **Auto-rotation**: advances every **4200ms**. **Pauses on hover** of the module, and **pauses when offscreen** (the prototype uses IntersectionObserver; in React use whatever the codebase prefers, e.g. `react-intersection-observer`). Clicking a role selects it.

### 7. Impact / "Why it matters" (`kh-impact.jsx` → `ImpactBand`, anchor `#impact`)
- 2-col grid `0.95fr 1.05fr`, gap 56 (→ 1 col < 920px).
- **Left**: eyebrow "Why it matters" (slate), H2 "Software that makes every shilling of care go further.", paragraph, then a 2×2 **stat grid** (1px gridlines, 16px radius) that **counts up when scrolled into view**:
  - **5** — "clinical roles on one shared record"
  - **0** — "computers needed to run a clinic" (the 0 is intentional and rhetorical — keep it)
  - **100%** — "of visits feed HMIS 105 reporting"
  - **1** — "continuous record per patient, for life"
  - Numbers: 38px/600, color cobalt. **These are honest structural facts, not outcome claims — flagged with the client as placeholders to swap for real reach/outcome data.**
- **Right**: 3 stacked **funder pillars** (icon tile + title + body): "Reach, not hardware", "Continuity becomes outcomes", "Every visit becomes data".
- **Count-up implementation note**: the prototype drives the tween with a wall-clock `setInterval` (not `requestAnimationFrame`) plus a visibility check and a failsafe, specifically so the number never sticks at 0 when the tab is throttled/offscreen. Preserve that robustness — ensure SSR/hydration shows the final value or animates reliably; never ship a "0 clinical roles" flash to a funder.

### 8. Karibu Learn section (`kh-features.jsx` → `LearnSection`, anchor `#learn`)
- Coral-themed counterpart to the EHR section. Coral lockup, a coral phone mock of a case (from the Learn app vocabulary), copy on free CME, "feels like the real EHR", "no account needed", CME credit. Primary CTA in coral.

### 9. Dark mission band (`kh-features.jsx` → `MissionBand`, anchor `#why`)
- Full-bleed `cobaltInk` (#0B1452) background, white text, 96px vertical padding. Subtle **dot-grid texture** (radial-gradient dots, 26px tile, masked to fade) + a large cobalt radial glow. Headline about being built in Uganda for Ugandan care, with a 4-column stat row.

### 10. Apply / final CTA (`kh-features.jsx` → `FinalCTA`, anchor `#apply`)
- 2-col `apply` grid (→ 1 col < 920px): persuasive copy on the left; a **form card** on the right (clinic name, district, role, phone). Submitting swaps to a **success state** ("Application received"). This is the page's single conversion point for clinics.

### 11. Footer (`kh-features.jsx` → `Footer`)
- Dark multi-column footer: brand lockup + columns of links (Products, Company, Resources) + fine print. → 2 cols < 920px.

---

## Interactions & Behavior
- **Scroll reveals**: most blocks fade/rise in on scroll (`Reveal` in `kh-ui.jsx`), staggered by a `delay` prop. Reveals are **visible-by-default** if JS/observer doesn't fire (no content is hidden behind animation).
- **Roles module**: click-to-select + 4.2s auto-advance + pause-on-hover + pause-offscreen; comet sweep on the rail; per-role progress bar; copy fade-rise; surface crossfade. (Full spec in §6.)
- **Count-ups**: animate once on first scroll-into-view; robust to throttling (§7).
- **Hover**: app-split cards lift + colored shadow; buttons brighten; nav links underline/ә color shift.
- **Smooth scroll**: anchor nav uses `scroll-behavior: smooth`.
- **Apply form**: local submit → success state (no real backend in the prototype; wire to the real endpoint).
- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` disables waveform, float, comet, role bars, copy animation, and smooth scroll. **Preserve this.**
- **Responsive**: single breakpoint at **920px** collapses all multi-col grids to 1 col, hides nav links + sign-in, reorders hero visual above copy, flattens the essentials strip. (See the `@media (max-width: 920px)` block in the HTML `<style>`.)

---

## State Management
Minimal, all local/UI state:
- `RolesShowcase`: `active` (0–4 index), `paused` (bool, hover), `inView` (bool, observer).
- `CountUp` (×4): internal `val` + "started" guard.
- `FinalCTA` form: field values + `submitted` (bool) for the success swap.
- No global state, no data fetching in the design. In production, the apply form posts to a real endpoint; stats may come from a CMS/config rather than hard-coded.

---

## Design Tokens
Use the codebase's existing tokens (`tokens/globals.css`, RGB-triple vars like `--kh-cobalt`). Hex reference (`tokens/colors_and_type.css` / `KH` in `kh-brand.jsx`):

**Brand**
- Cobalt (umbrella + EHR): `#1F36C7` · deep `#15259A` · soft `#E8ECFB` · ink `#0B1452`
- Coral (Karibu Learn): `#FB4D5B` · deep `#E12E4E` · bright `#FF7E54` · soft `#FFE7EA` · wash `#FFF5F4`
  - Coral gradient: `linear-gradient(135deg, #FF8253 0%, #FB4D5B 48%, #E5305F 100%)`
- Slate (secondary chrome): `#28617A` · deep `#1B4659` · soft `#E5EEF2`

**Reserved signals (do not reuse for decoration)**
- Amber = **AI only**: `#F5A524` · soft `#FDF1D8` · ink `#7A4A00`
- Red = **clinical critical only**: `#C8362B` · soft `#FBE5E2`
- Green = success/dispense: `#0E8A5F` · soft `#DCF1E7`

**Neutrals**: ink `#0E1530` · body `#3A4256` · muted `#6B7385` · line `#E5E7EE` · lineSoft `#EFF1F6` · bg `#F7F8FB` · surface `#FFFFFF` · page `#FBFCFE`

**Type**: Inter (400/500/600/700) for everything; **Geist Mono** (400/500/600) for eyebrows, labels, IDs, stats-meta. Headlines weight 600, tight tracking (−0.02 to −0.035em). Fluid sizing via `clamp()`.

**Radius**: buttons/pills 999 or 10–11px; cards 14–20px; icon tiles 7–15px.
**Shadows**: soft and cool — e.g. cards `0 1px 2px rgba(11,20,82,.05), 0 24px 60px rgba(11,20,82,.10)`; hover lifts add a tinted `${accent}1f–33`.
**Breakpoint**: 920px.
**Motion timings**: reveals 460–600ms; role auto-advance 4200ms; crossfade 460ms; comet 3.4s; float 5–6s.

---

## Assets
- **Logo / k+ mark**: drawn inline as SVG in `kh-brand.jsx` (`KMark`/`KWordmark`/`KLockup`) — recolourable (cobalt for EHR/umbrella, coral for Learn). Geometry matches the design system's app icon. Production should use the canonical mark from the design system if available.
- **Icons**: inline 24×24, 1.8px-stroke, `currentColor` SVGs in `kh-ui.jsx` (`Icon` by name: stethoscope, flask, pill, receipt, heart, bed, phone, wifi, shield, trending, refer, droplet, users, box, sparkle, check, arrow, learn, pulse, layers, globe…). Map to the codebase's icon library (e.g. lucide) where equivalents exist; keep the reserved-color rules.
- **Fonts**: Inter + Geist Mono via Google Fonts in the prototype; use the app's existing font pipeline.
- No external raster images — all product mocks are HTML/CSS/SVG.

---

## Files in this bundle
```
design_handoff_landing/
├── README.md                                  ← this file
├── reference/
│   └── Karibu-Health-Landing.bundled.html     ← open this to see the finished design (all motion)
├── source/                                    ← editable prototype (spec for logic + copy)
│   ├── Karibu Health Landing.html             ← host; lists module load order
│   ├── kh-brand.jsx                           ← KH tokens + k+ marks
│   ├── kh-ui.jsx                              ← Container, Eyebrow, Btn, Icon, Reveal, Pill
│   ├── kh-visuals.jsx / kh-visuals2.jsx        ← product mock visuals (phone, device-scale, timeline)
│   ├── kh-nav.jsx                             ← sticky glass nav
│   ├── kh-hero.jsx                            ← Hero, TrustStrip, ProductSplit
│   ├── kh-roles.jsx                           ← ⭐ RolesShowcase + 5 role surfaces
│   ├── kh-impact.jsx                          ← ImpactBand + CountUp
│   └── kh-features.jsx                        ← EHRSection, LearnSection, MissionBand, FinalCTA, Footer
└── tokens/
    ├── globals.css                            ← the app's real Tailwind token layer (wire to these)
    └── colors_and_type.css                    ← framework-agnostic hex/type reference
```

## Suggested build order in the monorepo
1. Confirm tokens: map every `KH.*` to the existing `--kh-*` vars; add any missing coral vars to the token layer.
2. Port shared primitives (`Container`, `Eyebrow`, `Btn`, `Icon`, `Reveal`) onto the codebase's equivalents.
3. Build top-to-bottom: Nav → Hero → TrustStrip → ProductSplit → EHRSection.
4. Build the **RolesShowcase** as a dedicated client component (it owns the only real interactivity) — get the crossfade + auto-rotate + pause-offscreen right against the bundled reference.
5. ImpactBand with a reliable count-up; then Learn, MissionBand, Apply (wire the form), Footer.
6. QA against the bundled HTML at desktop + < 920px, and with reduced-motion on.
