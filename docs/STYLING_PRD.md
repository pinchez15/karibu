# Karibu Health - Styling & Design System PRD

## Overview
Mobile-first clinical patient record interface optimized for Android smartphones in Uganda (low-bandwidth, WhatsApp integration context).

## Core Principles

### Design Philosophy
- **Medical record aesthetic**: Clean, data-forward, high information density
- **Mobile-first**: Optimized for Android smartphones, touch interactions
- **Performance-focused**: Budget Android devices, slow 3G connections
- **Accessibility**: WCAG AA minimum contrast ratios

### Technical Constraints
- Use **Tailwind CSS only** (no additional UI libraries)
- Inline critical styles where possible
- Lazy load non-critical content
- Design for frequent app-switching (maintain state)

---

## Typography

### Font Families
| Use Case | Font | Tailwind Class |
|----------|------|----------------|
| Body text, UI | Roboto | `font-sans` |
| Data, measurements, IDs | Roboto Mono | `font-mono` |

### Font Sizes
- **Base font size**: 16px minimum for readability
- Use Tailwind's default scale: `text-sm` (14px), `text-base` (16px), `text-lg` (18px), etc.
- Never go below `text-sm` for readable content

### Font Weights
- Regular (400): Body text
- Medium (500): Labels, buttons, emphasis
- Bold (700): Headings, important data

---

## Color Palette

### Primary Colors
| Name | Hex | Tailwind | Usage |
|------|-----|----------|-------|
| Clinical Blue | `#0369A1` | `primary` / `sky-700` | Primary actions, links |
| White | `#FFFFFF` | `white` | Card backgrounds |
| Slate 50 | `#F8FAFC` | `slate-50` | Page backgrounds |

### Text Colors
| Name | Hex | Tailwind | Usage |
|------|-----|----------|-------|
| Primary | `#1E293B` | `slate-800` | Headings, important text |
| Secondary | `#334155` | `slate-700` | Body text |
| Muted | `#64748B` | `slate-500` | Labels, hints, timestamps |

### Semantic Colors
| Name | Hex | Tailwind | Usage |
|------|-----|----------|-------|
| Success | `#059669` | `success` / `emerald-600` | Completed, positive |
| Warning | `#D97706` | `warning` / `amber-600` | Alerts, pending |
| Error | `#DC2626` | `error` / `red-600` | Errors, destructive |

### Status Colors (Queue/Visit)
```
waiting:          amber-100 / amber-700
with_nurse:       blue-100 / blue-700
ready_for_doctor: green-100 / green-700
with_doctor:      purple-100 / purple-700
completed:        slate-100 / slate-700
error:            red-100 / red-700
```

---

## Touch Targets

### Minimum Sizes
- **All interactive elements**: 48x48px minimum (`min-h-touch min-w-touch`)
- **Buttons**: Full width on mobile, or minimum 48px height
- **List items**: Minimum 48px height for tappable rows

### Spacing
- Generous spacing between interactive elements (minimum 8px gap)
- Use `gap-3` or `gap-4` between buttons
- Use `space-y-4` between form fields

---

## Components

### Buttons
```html
<!-- Primary action -->
<button class="btn-primary">Save Notes</button>

<!-- Secondary action -->
<button class="btn-secondary">Cancel</button>

<!-- Success action -->
<button class="btn-success">Send WhatsApp</button>

<!-- Danger action -->
<button class="btn-danger">Delete</button>
```

### Cards
```html
<div class="card">
  <h3 class="text-lg font-semibold text-slate-800 mb-4">Section Title</h3>
  <!-- Card content -->
</div>
```

Use subtle borders (`border border-slate-200`), not heavy shadows.

### Data Display (Key-Value)
```html
<div>
  <p class="data-label">Blood Pressure</p>
  <p class="data-value-mono">120/80 mmHg</p>
</div>

<div>
  <p class="data-label">Patient Name</p>
  <p class="data-value">Grace Nakamya</p>
</div>
```

### Sticky Headers
For scrollable content, use sticky headers:
```html
<div class="sticky top-0 bg-white border-b border-slate-200 p-4 z-10">
  <div class="flex items-center justify-between">
    <span class="font-mono text-sm text-slate-500">ID: PAT-001234</span>
    <span class="text-sm text-slate-500">Updated 5m ago</span>
  </div>
</div>
```

### Loading States
Prefer skeleton screens over spinners:
```html
<!-- Skeleton for text -->
<div class="skeleton h-4 w-32"></div>

<!-- Skeleton for card -->
<div class="card">
  <div class="skeleton h-6 w-48 mb-4"></div>
  <div class="skeleton h-4 w-full mb-2"></div>
  <div class="skeleton h-4 w-3/4"></div>
</div>
```

---

## Layout Patterns

### Mobile Screen Structure
```
┌─────────────────────────┐
│  Sticky Header (48px+)  │
├─────────────────────────┤
│                         │
│   Scrollable Content    │
│                         │
│   - Card 1              │
│   - Card 2              │
│   - Card 3              │
│                         │
├─────────────────────────┤
│  Fixed Bottom Actions   │
│  (48px+ buttons)        │
└─────────────────────────┘
```

### Card Layout
- Single column on mobile
- `space-y-4` between cards
- `p-4` padding inside cards

---

## Performance Guidelines

### Do
- Use Tailwind's built-in classes
- Lazy load images and non-critical content
- Use skeleton screens for loading states
- Keep animations minimal (`transition-colors duration-150`)

### Don't
- Don't use heavy shadows (`shadow-lg`, `shadow-xl`)
- Don't use complex animations or transitions
- Don't load external font weights you don't need
- Don't use client-side rendering for critical content

---

## Accessibility

### Contrast Ratios
All text must meet WCAG AA standards:
- Normal text: 4.5:1 minimum
- Large text (18px+): 3:1 minimum

### Focus States
All interactive elements need visible focus:
```html
focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary
```

### Touch Accessibility
- 48x48px minimum touch targets
- Adequate spacing between targets
- Clear visual feedback on press

---

## Implementation Checklist

When creating new components, verify:

- [ ] Font family: Roboto (sans) or Roboto Mono (data)
- [ ] Base font size: 16px minimum
- [ ] Touch targets: 48x48px minimum
- [ ] Colors: Using approved palette
- [ ] Contrast: WCAG AA compliant
- [ ] Cards: Subtle borders, no heavy shadows
- [ ] Loading: Skeleton screens, not spinners
- [ ] Mobile: Works on 320px width
