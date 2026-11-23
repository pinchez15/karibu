# Office platform: build plan

> **Superseded 2026-11-23** by `docs/karibu-office-spec.md` and the rewritten `docs/architecture/adr-0002-local-offices.md`. Kept for history. Where this plan differs (app path `apps/office-web`, a second Supabase project, MoMo Request-to-Pay, the cash ledger, Gmail, coaching rules), the spec wins.

**Date:** 2026-11-13
**Decisions:** `docs/architecture/adr-0002-local-offices.md`. Read it first.
**First user:** Javis, Karibu Uganda. Every phase ships to Javis's phone before it counts as done.

## Surfaces: what goes on the phone and what goes on the laptop

**Phone (on a motorcycle, a 1–5 minute check):**
- **Today:** clinics needing attention, ranked. The causes are sync red or stale, staff not logging in, throughput falling, an invoice overdue, or a visit overdue. Also shown: follow-ups due today and cash on hand.
- **Clinic card:** health, contacts, directions note, open issues, invoice status, last visit notes, and a "Log visit" button.
- **Actions:**
  - offline: log a visit, record a cash payment, add a lead, note an issue
  - online: send a MoMo or Airtel payment request, resend an invite, reset access
- **Coaching nudges** as one-line cards, which open the standard behind them.

**Laptop (desk work, 30–120 minutes):**
- onboarding wizard (lead → clinic → staff → catalogs → training plan)
- invoice runs
- ledger and statement reconciliation
- CRM pipeline
- materials
- team and settings
- the full standards library

The phone can do all of this too, with stacked layouts. Nothing is desktop-only except bulk statement import.

## Phases

Each phase is a slice small enough to demo. Push each branch as soon as it builds.

### Phase 0: done 2026-11-13
- [x] Renamed office `masaka` to `uganda` ("Karibu Uganda", territory "Uganda") in `packages/shared/src/pricing.ts`, its tests and the landing page. `/local/masaka` permanently redirects to `/local/uganda`.

### Phase 1: foundations, and proving offline on a real phone
- [ ] EHR migration:
  - `offices` (slug, name, country, territory, status)
  - `office_members` (office_id, clerk_user_id, role `owner|support|sales`, is_active)
  - `clinics.office_id`
  - `clinics.subscription_status` (`active|read_only`)
  - Seed Karibu Uganda and assign SSUNGA.
- [ ] `getOfficeScope()` in office-web, modelled on `getCoordinatorScope()` in `apps/web/src/lib/auth.ts`.
- [ ] `apps/office-web`: Next.js App Router, Clerk, Tailwind/shadcn, shared design system. PWA manifest, service worker, IndexedDB store, outbox, and a persistent-storage request.
- [ ] Offline spike: install on Javis's actual phone, go offline for a day, confirm the snapshot survives. **Go/no-go for the PWA decision.**
- [ ] Decide `office_*` RPC conventions: Clerk JWT, membership check, redaction helper, audit write.

### Phase 2: clinic health console, read-only
- [ ] **Prerequisite:** audit Sentry and PostHog payloads for PHI. Fix any that leak before offices can see errors.
- [ ] Confirm whether `sync_operations` gives last-sync per device. If not, add a small device heartbeat from Android: device id, staff, app version, last sync, outbox depth, last error code.
- [ ] RPCs:
  - `office_clinic_health`
  - `office_clinic_throughput` (daily counts)
  - `office_staff_logins`, joined with Clerk last-sign-in
  - `office_recent_errors`, with redacted patient numbers only
- [ ] Today screen, clinic card and field-pack sync.
- [ ] Test: every `office_*` RPC returns no PHI columns. It should be a SQL test asserting the column lists.

### Phase 3: access support
- [ ] Resend invite, send password-reset email, revoke sessions, deactivate or reactivate staff, all through the Clerk admin API and all audited.
- [ ] Bug report flow: clinic, device, redacted record ref, steps. It creates a ticket that Karibu sees, and links to reproducing the bug in the demo environment.

### Phase 4: billing and the cash ledger
- [ ] Office Supabase project: invoices, payments, ledger, expense categories, statement imports.
- [ ] Invoices are generated from the price book (monthly, or annual at 10 for 12).
- [ ] Statuses: current, due within 7 days, overdue, lapsed.
- [ ] MTN MoMo collections (Request-to-Pay) and Airtel Money collections, using the office's own merchant credentials. Sandbox first. Start the merchant KYC for Karibu Uganda **now**, because it reportedly takes days.
- [ ] Cash and bank payments recorded by hand, with a receipt number. Offline-capable.
- [ ] Ledger:
  - cash in and out
  - earned versus prepaid (unearned) money
  - runway
  - a 30/60/90-day collections forecast
  - CSV export
- [ ] Bank statement CSV import with line matching. PDF import if Javis's bank only gives PDFs.
- [ ] Lapse: after the grace period, the owner confirms, then the EHR RPC sets the clinic to `read_only`. The EHR shows a banner, and records stay readable.

### Phase 5: onboarding wizard (laptop-first)
- [ ] Lead → clinic (`office_create_clinic`) → invite staff → catalogs and pricing → book the training day → day 7, 30 and 90 check-ins created automatically.

### Phase 6: CRM and email
- [ ] Leads (facility type, location, owner contact, source), pipeline stages (prospect → visited → demo → trial → signed → live → churned), activities, next follow-up.
- [ ] Gmail send-only (`gmail.send`) with templates, logged to the lead or clinic. Use "compose in Gmail" plus BCC logging until Google verification clears.

### Phase 7: coaching
- [ ] Standards library pages, cached offline. Content comes from `docs/offices/coaching-rules-draft.md` once Nate has edited it.
- [ ] Rules as typed code with thresholds, evaluated against the ledger, CRM and clinic health. Nudges appear at decision points: add team member, sign clinic, weekly cash review, overdue invoice, lapse.

### Phase 8: marketing materials
- [ ] Co-branded templates ("Karibu Uganda" plus the lead's photo and contact): flyer, one-pager, price sheet, WhatsApp image. Filled in from the price book. English and Luganda. Printable PDF.

### Future: the office agent
- An agent that reads email and acts as coach, assistant, executive advisor, executive assistant and chief of staff, and does tasks.
- Needs:
  - Gmail restricted-scope review
  - a permission model for agent actions
  - the ledger, CRM and health data built above
- Gets its own ADR when phases 1–7 are live.

## Open questions

1. Grace period before a clinic lapses to read-only: 14 days or 30?
2. Does Karibu Uganda already have a registered business, a bank account and MoMo/Airtel merchant numbers? KYC needs them.
3. Which bank is Javis's business account at? This decides which statement format to support first.
4. Should Luganda materials be in phase 8, or does English cover the first clinics?
