# Karibu Office: business tools for local partners

**Status:** Spec. Phase 0 and Phase 1 in progress on `feat/karibu-office` (started 2026-11-23).
**Owner:** Nate
**Working name:** "Karibu Office" (the app), "office" or "partner" (the business). Repo code already uses "local office". Keep that term.
**Architecture decisions:** `docs/architecture/adr-0002-local-offices.md` (rewritten 2026-11-23 to match this spec).
**Resolved decisions and open items:** Section 14, added 2026-11-23. Where Section 14 disagrees with the text above it, Section 14 wins.

---

## 0. Instructions for Claude Code

1. Read this whole document first. Then read `docs/karibu-local-office-pricing.md`, `packages/shared/src/pricing.ts`, `docs/karibu-ehr-onboarding.md`, `docs/platform-contract.md` and `CLAUDE.md`.
2. Run `plan-eng-review` on Section 6 (Architecture) before writing any code. Confirm the data-boundary decision (6.3) explicitly.
3. Build **Phase 1 only** (Section 10). Phases 2 and 3 are here so the Phase 1 data model doesn't paint us into a corner. They are not authorization to build them.
4. All writes go through `SECURITY DEFINER` RPCs, the same as the EHR.
5. Open questions in Section 12 marked **[blocks Phase 1]** must be answered by Nate before the affected module is built. Stub them; don't guess.

---

## 1. Why

Karibu is moving from **one entrepreneur serving one clinic** to **many local entrepreneurs, each running a business on the Karibu platform**. A partner (a "local office") finds clinics, onboards them, trains staff, supports them and bills them. Karibu (the Foundation) supplies the software, hosting, security, certification and pricing guidance. "You can't buy Karibu from Karibu."

To succeed, partners need business tools. Those tools should be built around the partner's **actual job**:

> Find clinics. Get them live with as few site visits as possible. Keep them running. Get paid. Then hire and grow.

This is **not** a general ERP or an Odoo for Africa. Anything generic (payroll, tax filing, full accounting) is linked out or exported, not rebuilt.

### What partners can't get anywhere else

Karibu already knows how heavily every clinic actually uses the EHR. No CRM or accounting tool has that data. Clinic health data, turned into "where do I go this week", is the core of this product.

### Target context

- Uganda first, starting in Masaka and then the southwest. Then other countries, such as Tanzania and South Africa.
- Partners are often nurses or clinical staff becoming entrepreneurs for the first time.
- The phone is the primary device: low-end Android, Chrome, expensive data, patchy signal.
- WhatsApp is the main communication and distribution channel. Professional WhatsApp communities, such as nursing groups, are a real recruiting channel.
- Clinics (HC IIIs and similar) are remote. Some have unreliable internet or none.

---

## 2. Decisions already made

| Decision | Detail |
|---|---|
| Separate web app | Not part of the Kotlin Android EHR. Lives in the monorepo as a new app. |
| Separate login | A clinic staff member uses the EHR login. A partner owner has a separate "owner" login to Karibu Office. One person may hold both, but they are separate roles and surfaces. |
| Partners pay Karibu | **$5/month per partner** (local currency equivalent via the country price book). The partner is a separate legal entity and a vendor of Karibu, **not** a grant recipient receiving a donation. |
| Offices bill clinics directly | The existing price book stands (Core $15 / Full $30 / Pro $60 per facility per month, plus setup). The office keeps clinic revenue. |
| Karibu never holds clinic-to-partner money | No payment intermediation in Phase 1 or 2. Phase 1 is read-only reconciliation. Phase 2 collection, if built, uses a licensed aggregator paying into the **partner's own** merchant account. |
| Usage data is the core | Clinic health from EHR telemetry drives the partner's pipeline, alerts and priorities. |
| Remote-first onboarding | Goal: a clinic goes live with **one site visit or none**. |
| Grants are separate from the fee | Foundation grants (up to $2,000 over ~18 months) are released on **platform-verified milestones**, not on activity reports. |

### Conflict to fix in Phase 0

`docs/karibu-local-office-pricing.md` §1 and the header comment in `packages/shared/src/pricing.ts` say "No revenue share with Karibu." That is still true for clinic revenue, but the office now pays a flat **$5/month partner fee**. Update both, and add the fee to the price book (USD plus country localization, under the same drift test).

---

## 3. Users and roles

| Role | Who | Surface |
|---|---|---|
| **Office owner** | The entrepreneur, e.g. Javis's business in Masaka | Karibu Office (web, mobile-first) |
| **Office staff** (Phase 3) | Salespeople, implementers, support staff hired by the owner | Karibu Office, with limited permissions |
| **Clinic champion** | One trained power user per clinic, the partner's eyes on site | EHR plus a lightweight champion view (readiness tasks, support requests) |
| **Clinic staff** | Records, nurses, COs, lab, pharmacy, cashier | EHR only. They never see Karibu Office. |
| **Karibu central** | Foundation staff and Nate | Foundation console inside Karibu Office (superadmin) |

Permissions are org-scoped. One office has many staff and many clinics. One clinic belongs to exactly one office at a time.

---

## 4. Design principles

1. **Features unlock by business stage.** No long menus and no hidden menus. A partner sees only what their current stage needs. The next unlock is visible as a clear "what's next" item, never buried in settings.

   | Stage | Trigger | Unlocks |
   |---|---|---|
   | 1. Getting started | Office account created | Profile, certification status, share assets, pipeline |
   | 2. First clinic | First clinic reaches "readiness cleared" | Onboarding tracker, kit tracking, clinic health, support inbox |
   | 3. Running a book | First clinic billed | Invoices, reconciliation, earnings view, renewals |
   | 4. First hire | Owner adds a staff member | Team, assignments, field visit log, 1:1s, commissions |
   | 5. Regional operator | e.g. 10+ live clinics or 3+ staff (configurable) | Territory analytics, multi-staff performance, coaching track |

   Stage is derived from data, not chosen. Karibu central can override it.

2. **The home screen is a to-do list, not a dashboard.** "Today: 2 clinics need you, 1 invoice overdue, 1 readiness check waiting." Every item is one tap from action.

3. **The AI assistant is a way in, not the only way.** Every action an AI can take also has a plain UI path. The assistant explains, drafts and suggests (Section 8). It never becomes the only way to do something.

4. **Low data, low-end phones.** Budget the page weight. Server-render. No heavy client bundles on core routes. Images compressed client-side before upload. A "low data mode" toggle disables non-essential images and AI streaming.

5. **WhatsApp is a channel, not a feature.** Anything a partner might send to a clinic or prospect (an invoice, a readiness link, an onboarding checklist, a referral flyer) gets a one-tap "Share to WhatsApp" with a short link plus a QR code.

6. **Languages.** English first. Design all strings for i18n from day one. Target Luganda and Runyankole next for clinic-facing and champion-facing surfaces and AI replies.

7. **Clinic patient data stays in the clinic.** Partners see operational metrics, not patient identities (6.3).

---

## 5. What already exists (reuse, don't rebuild)

| Asset | Location | Use it for |
|---|---|---|
| Local office registry (static, in code) | `packages/shared/src/pricing.ts` (`LocalOffice`) | Migrate to a DB table (`offices`). Keep a seed for Masaka. |
| Public office page | `apps/web/src/app/local/[office]`, `LocalOfficePage.tsx` | Becomes the office's public storefront. Add a lead-capture form that writes to the office pipeline. Note the open branch `cursor/local-uganda-landing-21a8`. |
| Price book plus FX localization plus drift test | `packages/shared/src/pricing.ts`, `pricing.test.ts` | Invoices, quotes, the partner fee |
| Required staff training plus completion gate | `docs/karibu-ehr-onboarding.md`, `staff_onboarding_progress`, `rpc_get_onboarding_status` | Onboarding tracker: show per-staff training completion to the partner, without patient data |
| Clinic creation and staff invites | `apps/web/src/app/dashboard/superadmin/actions.ts` (`createClinicAction`, `inviteStaffToClinic`) | Wrap as office-scoped RPCs so partners can provision clinics without superadmin |
| Stock / catalog import | `apps/web/src/app/dashboard/admin/stock-import` | Target for photo-to-catalog (Section 7.C) |
| Offline-first sync (Android) | `SyncWorker`, `sync_queue`, `PullSyncManager` | Source of device health telemetry (7.D) |
| Thermal printer setup | `docs/thermal-printer-setup.md` | Kit checklist |
| KaribuLearn case engine | `apps/learn-android`, `docs/karibu-learn-pack-schema.md` | Partner certification and management training content (7.J) |
| Inngest | `apps/web` dependency | Scheduled jobs: health scoring, alerts, invoice reminders |
| Clerk, Supabase, PostHog, Sentry | existing | Same stack |

No partner back-office code exists on any branch as of 2026-11-23.

---

## 6. Architecture

### 6.1 App

- New app: `apps/office` (Next.js, same versions and conventions as `apps/web`). Add it to `pnpm-workspace.yaml`.
- Shared UI from `packages/design-system`. Brand palette: primary `#2436C0`, navy `#0D144F`, amber `#DB9133`, surface `#F4F6FB`.
- Installable PWA, so partners can add it to their home screen. Field forms (visit log, readiness notes) queue offline and sync later.

### 6.2 Auth

- Clerk. Office owners and office staff are Clerk users with membership in an `office` org.
- EHR staff roles and office roles are separate. One Clerk identity may hold both, with role checks per surface.
- Karibu central uses the existing `superadmins` pattern.

### 6.3 Data boundary (confirm in plan-eng-review)

**Recommendation:** use the same Supabase project as the EHR, with a new `office` schema.

- Office tables live in `office.*`, with RLS by office membership.
- Partners **never** query EHR tables directly. They read clinic metrics only through `SECURITY DEFINER` RPCs that return **aggregates with no patient identifiers**: counts, rates, last-seen timestamps and staff training status (staff names are OK, since the partner trains them).
- Partners can provision a clinic, invite staff, and edit catalogs and prices for clinics they own, through RPCs that check office ownership.
- If the clinic changes partners or the partner exits, ownership transfers in one RPC, with an audit log entry. Clinic data stays with the clinic. A lapsed clinic drops to read-only per the existing pricing rule.
- Legal context: Uganda's Data Protection and Privacy Act. Confirm against `docs/KARIBU_LEGAL_COMPLIANCE_REPORT.md`.

The alternative is a separate Supabase project with a metrics export. It's cleaner isolation but means duplicate infrastructure and sync jobs. Reject it unless plan-eng-review finds a strong reason.

### 6.4 Data model sketch (Phase 1 tables in bold)

```
office.offices                 id, slug, name, country, territory, legal_name, status,
                               stage, certified_at, fee_status, created_at
office.office_members          office_id, clerk_user_id, role (owner|sales|implementer|support), active
office.territories             office_id, country, districts[]  (exclusivity rules: see open questions)
office.clinic_accounts         id, office_id, clinic_id (nullable until provisioned), name, district,
                               facility_level, contact_name, contact_phone, champion_staff_id,
                               stage (lead|contacted|demo|readiness|configured|trained|kit_delivered|
                                      live|steady|billed|churned), tier, source, assigned_member_id
office.clinic_stage_events     clinic_account_id, from, to, at, by    (milestone history; drives grants)
office.readiness_checks        clinic_account_id, power, devices, signal, staff_count, services[],
                               photos[], score, submitted_at, reviewed_by
office.tasks                   office_id, clinic_account_id?, kind, due_at, status, source (manual|alert|ai)
office.visits                  office_id, clinic_account_id, member_id, kind, notes, at, gps?
office.support_tickets         office_id, clinic_account_id, channel (whatsapp|app|phone), body,
                               attachments[], status, escalated_to_karibu, ai_triage
office.invoices                office_id, clinic_account_id, period, lines[], amount, currency,
                               status (draft|sent|part_paid|paid|overdue|void), sent_via
office.payments                office_id, invoice_id?, amount, currency, method (momo_mtn|airtel|cash|bank),
                               reference, raw_evidence (sms text / statement row), matched_by (manual|auto)
office.partner_fees            office_id, period, amount, currency, status         (office -> Karibu)
office.grants                  office_id, total, currency, start
office.grant_milestones        grant_id, milestone_key, amount, verified_at, released_at, evidence_ref
-- Phase 2+
office.devices                 id, clinic_id, enrolled_at, app_version, last_seen, last_sync,
                               queue_depth, battery, kit_id
office.kits                    id, office_id, clinic_account_id, contents[], status, shipped_via, tracking
office.referral_links          office_id, code, channel, clicks, signups
-- Phase 3
office.commissions             member_id, clinic_account_id, rule, amount, period
office.one_on_ones             office_id, manager_id, member_id, at, notes, actions[]
```

Clinic health metrics come from an RPC: `rpc_office_clinic_health(clinic_id)` returns active staff over 7 and 30 days, patients registered per day, visits per day, last sync per device, unsynced queue depth, training completion, paper fallback signals (such as visits per day dropping more than 50% against baseline), and a computed health score (green, amber or red).

---

## 7. Modules

Phase tags: **P1** = build now, **P2** / **P3** = later.

### A. Office account, certification and partner fee (P1)

- Office profile: legal name, territory, contact, payout details (for display on invoices only).
- Certification status: completed partner school (manual flag in P1, from KaribuLearn in P3).
- Partner fee: $5/month equivalent, shown on the price book. P1 records payments manually (Karibu central marks them paid against a MoMo reference). P2 uses aggregator collection into **Karibu's** account. This is Karibu billing for its own service, not intermediation.
- Fee lapse rule: the office loses the ability to provision **new** clinics. Existing clinics are never interrupted.

### B. Clinic pipeline: a light CRM (P1)

- One list of clinics with stages: `lead → contacted → demo → readiness → configured → trained → kit_delivered → live → steady → billed` (plus `churned`).
- Sources: manual entry, the public `/local/[office]` form, referral link (P2).
- Each clinic card shows its stage, next action, assigned member, last contact, and (once live) health.
- A lightweight district list can seed leads (e.g. a list of HC IIIs per district loaded by Karibu central). P1 is manual entry plus CSV import.
- Territory: a clinic can be claimed by only one office. A claim on a clinic another office holds is blocked and flagged to Karibu central.

### C. Remote onboarding: one visit or none (P1)

The core flow. A site visit does five jobs: trust, hardware, data setup, training and go-live support. Move everything except trust and hardware off-site.

1. **Readiness link.** The partner taps "Start onboarding" and a short link goes out over WhatsApp to the clinic champion. It opens a mobile form with no login (signed token, expires): power situation, devices on hand, a signal test (a lightweight speed test plus a signal-bars photo), staff list (name, role, phone), services and departments, and photos of the paper price list, drug list and staff roster.
2. **Photo to data.** AI extracts draft catalogs (services and prices, drugs and stock) and the staff list from the photos. The partner reviews and edits in a table, then approves. Approval writes through the existing stock-import path and the `inviteStaffToClinic` logic (office-scoped).
3. **Provisioning.** The partner creates the clinic and its departments through an office-scoped RPC. Staff get invites by SMS or WhatsApp.
4. **Training before go-live.** Staff complete the existing required training modules on their own phones. The partner sees completion per staff member and can nudge with one tap (WhatsApp message prefilled).
5. **Readiness score.** Computed from power, devices, signal, catalog approved, staff trained %, and champion named. A clear rule: nobody travels until the score is green. Show what's blocking it.
6. **Go-live.**
   - Default: one site visit (matches the one on-site training day already in the setup fee). The checklist for that day is generated from what's still open.
   - Remote option: a champion-led launch over a WhatsApp video call, with paper running in parallel during the first stretch. The checklist and a "first patient" milestone are auto-detected from EHR data.
7. **Milestones** are recorded in `clinic_stage_events` automatically where data allows (trained, first patient, 7 days steady, first invoice paid).

### D. Kit and devices (P2; data model in P1)

- **Karibu kit:** phone or tablet with the app installed, paired thermal printer, power bank or small solar unit, SIM with data bundle. Tracked per clinic, with dispatch by bus parcel and a tracking reference.
- **QR enrollment:** Android EHR gets "Enroll this device", which scans a QR from Karibu Office and binds the device to the clinic. Staff still sign in individually. Requires a change in `apps/android`.
- **Device heartbeat:** whenever online, the Android app reports app version, last successful sync, queue depth and battery (piggyback on `SyncWorker`). Requires a change in `apps/android`. P1 can approximate from server-side last-write timestamps per clinic.
- Who preconfigures kits (partner or Karibu central) is an open question.

### E. Clinic health and alerts (P1 basic, P2 automated)

- Health score per live clinic (green, amber or red) from `rpc_office_clinic_health`.
- Alert rules (Inngest scheduled job), creating `office.tasks`:
  - no sync from the clinic in X hours (default 48)
  - registrations or visits down more than 50% against the clinic's 14-day baseline
  - a staff member invited more than 7 days ago with training incomplete
  - a device on an old app version (P2)
  - a new staff member added at the clinic (training follow-up)
- The home screen to-do list is built from these tasks.
- P1: compute nightly and show it. P2: push via WhatsApp or SMS to the owner.

### F. Support desk (P1 intake, P2 WhatsApp and AI)

- Tickets come from clinic staff or the champion: an in-EHR "Get help" button (P1), and a WhatsApp number (P2, WhatsApp Business Platform / Cloud API).
- They accept text, photos and voice notes.
- AI triage (P2): answers how-to questions from Karibu docs, tags the category, and suggests a fix. Anything not resolved goes to the partner. Anything the partner can't resolve escalates to Karibu central (L2) with context attached.
- Privacy: warn users not to send patient details in screenshots. AI flags likely patient identifiers in attachments for the partner to redact.

### G. Invoicing and reconciliation (P1)

- Generate monthly invoices per clinic from the price book and tier, plus one-off setup and training lines. Local currency.
- Send as a PDF or link via WhatsApp or SMS. Clinic-facing invoices show the **office's** name and payout details, not Karibu's.
- **Reconciliation (read-only):** the partner records payments in one of three ways:
  - pastes or forwards the MTN MoMo or Airtel Money confirmation SMS (parsed for amount, sender, reference and date)
  - uploads a statement CSV
  - records cash manually

  Auto-match to open invoices by amount, payer phone and period, and the partner confirms.
- Overdue reminders (prefilled WhatsApp message).
- Earnings view: billed, collected, outstanding, by clinic and by month.
- Export to CSV for the accountant. Optionally export to QuickBooks or Xero in P3. Don't build accounting.
- **Not in scope:** Karibu holding or moving clinic-to-office money. P2 option: collection via a licensed aggregator into the **office's own** merchant account (see open questions).

### H. Growth and distribution (P1 basic, P2 attribution)

Two funnels. Keep them separate.

1. **Office → clinics** (the office's sales). Assets:
   - a shareable image or flyer per office with a QR code to `/local/[office]`
   - one-page clinic pitch with the local price book
   - "Share to WhatsApp" for each
   - P2: referral codes per office member, tracked through to clinic stage
2. **Karibu → new partners** (partner recruitment, run by Karibu central). This is the "nurse posts in a WhatsApp nursing group" flow. A shareable "Become a Karibu partner" image and link with the sharer's referral code goes to an application form, which lands in the Foundation console pipeline. An existing partner can share it too, and attribution is recorded.

### I. Team (P3; schema stubs only)

- Add members with roles: sales, implementer, support.
- Assign clinics or leads to members.
- Field visit log (GPS optional, offline-capable).
- 1:1s: a scheduled cadence per report, a short template (wins, blockers, metrics pulled automatically from that person's clinics, next actions), and action items that carry over.
- Commissions: simple rules (e.g. % of first N months, or a fixed amount per clinic reaching `steady`), calculated monthly and exported.
- **Not built:** payroll, PAYE or NSSF filing, contracts. Provide templates and links instead.

### J. Owner coaching and management training (P2 AI, P3 curriculum)

- **AI business assistant** (Section 8): "What should I do this week?", "Draft a message to this clinic", "Why is Kitanda HC III amber?", "How do I run my first 1:1?"
- **Management track:** short scenario-based lessons on running a business and managing people (pricing conversations, collections, hiring the first person, running 1:1s, giving feedback). Unlocked at stage 4. Runs on the KaribuLearn case-pack format, not a separate system.
- **Partner certification** (P3): the partner school curriculum, delivered and tracked the same way.

### K. Foundation console: Karibu central (P1 minimal)

- All offices: stage, live clinics, health mix, fee status, certification.
- Partner applications pipeline (from H.2).
- Partner fee ledger.
- **Grant milestones:** define milestone keys per grant (e.g. `first_clinic_live`, `first_clinic_steady_30d`, `three_clinics_billed`). Milestones verify automatically from `clinic_stage_events` and EHR data, and Karibu central approves the release in one tap. This gives donor reporting for free.
- Territory conflicts and ownership transfers.
- Escalated support tickets (L2).

---

## 8. AI assistant

- One chat entry point on every screen (a bottom sheet), plus inline "suggest" buttons on specific actions (draft a message, explain a score, extract from a photo).
- **Tools it can call** (all go through the same RPCs as the UI, with the user's permissions):
  - read pipeline, tasks, clinic health and invoices
  - draft messages and invoices
  - create a task
  - extract a catalog from a photo
  - summarize a clinic
- **Writes require confirmation.** The assistant proposes, and the user taps confirm.
- **No patient identifiers** ever enter the assistant context. Only aggregate metrics are available to it, as enforced by 6.3.
- **Cost and data:** concise responses, non-streaming in low data mode, and a token budget per office per month with graceful degradation. Use the existing OpenAI dependency unless plan-eng-review chooses otherwise. Keep the provider abstracted.
- **Languages:** reply in the user's language. Partner-facing English first. Champion and clinic-facing support in Luganda and Runyankole are targets for P2. Run evals in `packages/ai-evals`.
- **Coaching prompts** are grounded in the office's real data (stage, clinic health, overdue invoices), not generic business advice.

---

## 9. Non-functional requirements

- **Devices:** works well on a low-end Android phone in Chrome over 3G. Set a page weight budget per core route, and check it in CI if feasible.
- **Offline tolerance:** visit logs, notes and readiness reviews queue locally and sync later. Everything else may require a connection but must fail gracefully.
- **Security:** org-scoped RLS, all writes through `SECURITY DEFINER` RPCs, audit log for clinic provisioning, ownership transfer, catalog changes, invoice void and grant release.
- **Privacy:** no patient identifiers in Karibu Office. Signed, expiring tokens for login-free clinic forms.
- **Observability:** Sentry and PostHog, consistent with `apps/web`. Track the funnel per clinic stage.
- **i18n:** all strings externalized from day one.
- **Currency:** store amounts in minor units with an ISO currency code. Show local currency everywhere partner- or clinic-facing.

---

## 10. Phasing

### Phase 0: groundwork

- Update the pricing doc and `pricing.ts` for the $5/month partner fee (Section 2).
- Move `LocalOffice` from code to `office.offices` and seed Masaka.
- Scaffold `apps/office` with auth, the shell, the to-do home and stage gating.

### Phase 1: what one partner (Javis) needs now

- A. Office account, certification flag, manual partner fee ledger
- B. Clinic pipeline, with lead capture from `/local/[office]` and CSV import
- C. Remote onboarding: readiness link, photo-to-catalog with human review, office-scoped clinic provisioning and staff invites, training tracking, readiness score, go-live checklist, auto milestones
- E. Clinic health (nightly computed) and alert tasks on the home screen
- F. In-EHR "Get help" button creating a ticket for the clinic's office, plus escalation to Karibu central
- G. Invoices, WhatsApp share, read-only reconciliation (SMS paste, CSV, cash), earnings view, CSV export
- H.1 Office share assets (flyer with QR, Share to WhatsApp)
- K. Minimal Foundation console: offices, fee ledger, grant milestones with one-tap release, territory conflicts, L2 tickets

**Phase 1 acceptance criteria**

- A partner can take a clinic from `lead` to `live` without Karibu central touching anything except approving the office itself.
- A clinic can reach a green readiness score with zero site visits. Catalogs come from photos, approved by a human.
- The partner never sees a patient name, phone or ID anywhere in Karibu Office. Test this directly.
- Payment SMS from MTN MoMo and Airtel Money (Uganda formats) parse and match to invoices. Include fixtures of real message formats.
- `first_clinic_live` verifies automatically from EHR data and appears in the Foundation console for release.
- Core routes meet the page weight budget on a throttled 3G profile.

### Phase 2: scale the remote model

- D. Karibu kit tracking, QR device enrollment, device heartbeat (Android changes)
- E. Automated alert pushes via WhatsApp or SMS
- F. WhatsApp support line with AI triage
- H. Referral attribution for both funnels, and the partner application pipeline
- J. AI business assistant
- A. Partner fee collection via aggregator into Karibu's account
- G. Optional: collection via aggregator into the office's own merchant account (only if the open question resolves yes)
- Luganda and Runyankole for clinic-facing and champion surfaces

### Phase 3: offices that hire

- I. Team, assignments, visit logs, 1:1s, commissions
- J. Management track and partner certification on the KaribuLearn case engine
- Territory analytics and multi-country operation
- Accounting export integrations, if partners ask for them

---

## 11. Out of scope

- Karibu holding, moving or settling clinic-to-office money
- Payroll, tax filing, statutory deductions, employment contracts
- A general-purpose accounting ledger
- Any partner access to patient-level data
- Changes to clinical workflows in the EHR beyond: "Get help" button, device enrollment, heartbeat

---

## 12. Open questions

1. **[blocks Phase 1, module A]** How do partners pay the $5/month in P1? Manual MoMo to a Karibu number, recorded by Karibu central? Monthly or annual?
2. **[blocks Phase 1, module B]** Territory exclusivity: per district, per region, or first-claim per clinic? What happens when two offices want the same district?
3. **[blocks Phase 2, module D]** Who preconfigures and ships kits: Karibu central or the partner? Who owns the hardware, and is it in the setup fee or sold separately?
4. Does a clinic champion get a stipend, and is it paid by the office or out of the clinic's fee? (A business decision for each office, but the product may need to track it.)
5. Do offices need to issue URA EFRIS e-invoices? This depends on whether the office is VAT-registered. If so, P1 invoices need an EFRIS reference field and P2 may need integration.
6. Phase 2 payments: should collection run through a licensed aggregator into the office's own merchant account? Confirm the Bank of Uganda licensing position for that setup with counsel before building. Karibu itself should not hold funds.
7. Grant milestone definitions and amounts for the first cohort.
8. Stage 5 threshold (number of live clinics or staff).
9. Does a partner who stops paying the fee lose the office? What is the grace period, and how is clinic ownership transferred?
10. Brand on clinic-facing documents: "Karibu Masaka" (office-branded) vs. the office's legal name. Both?

---

## 13. Glossary

- **Office / partner:** an independent local business, certified by Karibu, that sells, onboards, supports and bills clinics in a territory.
- **Clinic champion:** one trained power user inside each clinic.
- **Karibu central:** the Karibu Health Foundation team. It provides software, hosting, certification and the price book.
- **Readiness score:** a computed go/no-go for go-live, from power, devices, signal, catalogs, training and champion.
- **Health score:** a computed green, amber or red status for a live clinic, from EHR usage and sync telemetry.
- **Karibu kit:** a preconfigured device bundle shipped to a clinic.

---

## 14. Resolved decisions and open items (2026-11-23)

Decided by Nate in the build session on 2026-11-23, unless marked as a default.

| Topic | Decision |
|---|---|
| Data boundary (6.3) | **Confirmed: same Supabase project, `office` schema.** In addition, the office app never holds the Supabase service-role key. It uses the anon key plus the signed-in user's Clerk JWT, so EHR data is reachable only through office-scoped `SECURITY DEFINER` RPCs. |
| First office | **Karibu Uganda** (slug `uganda`, territory Uganda). References to "Masaka" in Sections 1, 3, 5 and 10 are stale; `/local/masaka` redirects to `/local/uganda`. |
| Territory (open question 2) | **First claim per clinic.** No district exclusivity. A second office claiming a clinic that another office holds is blocked and flagged to Karibu central. An office's territory is descriptive. |
| Engineering review (Section 0, step 2) | `plan-eng-review` no longer exists as a skill. The review was done directly and is recorded in ADR-0002. |
| Older docs | This spec supersedes `docs/offices/office-platform-plan.md` and the 2026-11-13 version of ADR-0002 where they conflict (app path, two databases, free software, Request-to-Pay, redacted patient numbers, three roles, cash ledger, Gmail). |
| Stage gating (Section 4, principle 1) | **Reversed by Nate on 2026-11-24.** Nothing is hidden by stage. Every area (Today, Clinics, Support, Money) is always in the navigation and explains what it is for before it has data. The stage is still derived and is shown as progress, with the next step stated on Today and in the guide (`/o/[office]/guide`), which maps everything a partner can do. On a clinic's page, Health and Billing are always listed and say what has to happen first. |
| Desktop (Section 3, "mobile-first") | **Added 2026-11-24.** Phone stays the primary device, but Karibu Office also has a laptop layout: a sidebar instead of bottom tabs, tables and two-column pages. One codebase, responsive; the page weight budget still applies. |
| Offline web | `docs/platform-contract.md` rule 3 (no offline on web) applies to the EHR web app only. Karibu Office queues visit logs and notes offline. |
| Desktop first (Sections 1, 3, 4.2, 4.4) | **Decided by Nate on 2026-11-25. Reverses "the phone is the primary device" and the 2026-11-24 row above.** Karibu Office is designed for a laptop first and a phone second: a sidebar that follows the partner's job (Grow: Leads, Pipeline. Deliver: Onboarding, Clinics, Support. Business: Money, Cash flow, Analytics), a top bar with search and New, tables and multi-pane screens. The phone keeps five bottom tabs with the rest under More, and Home on a phone is still the to-do list first. The page weight budget still applies. |
| Home (Section 4.2) | Home is no longer only a to-do list. It opens with four business numbers (monthly recurring revenue, collected this month, live clinics by health, pipeline), then one ranked "needs you today" list that merges open to-dos, unconfirmed payments and overdue follow-ups. |
| Brand (Section 6.1) | **Decided by Nate on 2026-11-25.** Karibu Office uses the KaribuLearn coral and pill buttons, so it cannot be mistaken for the cobalt EHR. Kit: `docs/karibu-office-brand.md`. This replaces ADR-0002 decision 1's "existing Karibu Health tokens". |
| Scope pulled forward (Section 10) | **Authorized by Nate on 2026-11-25:** a pipeline board, a leads screen, a clinic console, a three-pane support inbox, a six-month cash flow forecast (migration 119: the partner's own costs and opening balance) and portfolio analytics. Karibu Office still never holds or moves money. |
| Analytics start and stop on their own | Each analytics panel decides whether it has enough data to show a trend (`apps/office/src/lib/analytics.ts`, thresholds in `NEED`). Below the threshold it says what it is waiting for and how far along it is; if recent data dries up it holds the trend back; the owner can pause any panel. The database returns counts only. |

**Partner fee (open question 1): not decided.** Nate wants owners to have skin in the game and to help the network and new entrepreneurs grow, and is undecided on whether the fee goes to the Foundation or stays local. Default built until he decides: the fee is paid to Karibu and ring-fenced into a per-country network fund for starting new offices; UGX 20,000 a month; billed monthly, several months payable at once; Karibu central marks periods paid against a MoMo reference. Each fee row carries a fund label so the destination can change without a schema change.

Still open: questions 3 to 10 in Section 12.

**Designed but not built (2026-11-25):** a searchable facility register for finding leads (needs the Ministry of Health list loaded by Karibu central); a "quote sent" clinic stage (stage ranks are compared numerically across migrations 115 to 118, so it needs its own migration); per-device status and "last printed" on the clinic console (needs the Phase 2 Android heartbeat); suggested fixes in the support inbox and the assistant (Phase 2). The design canvas for all of these is linked from the 2026-11-25 session.
