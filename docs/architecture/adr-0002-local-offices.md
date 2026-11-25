# ADR-0002: Karibu Office, business tools for local offices

- **Status:** Accepted (rewritten 2026-11-23; first proposed 2026-11-13)
- **Deciders:** Nate
- **Builds on:** ADR-0001 (per-subdomain apps), `docs/karibu-local-office-pricing.md`
- **Spec:** `docs/karibu-office-spec.md`. Read it first. Section 14 records the decisions made on 2026-11-23.
- **Supersedes:** the 2026-11-13 version of this ADR and `docs/offices/office-platform-plan.md`, where they conflict with the spec.

## Context

Karibu is sold and supported by **local offices**: independent partners who find clinics, onboard them, train staff, support them and bill them. The first is Karibu Uganda (Javis). Karibu supplies the software, hosting, certification and the price book.

Offices need tools built around their actual job: find clinics, get them live with as few site visits as possible, keep them running, get paid. The one thing no CRM or accounting tool can give them is what Karibu already knows: how heavily each clinic uses the EHR.

The hard constraint is that **an office must never see patient data**, while the office tools need to read clinic activity, create clinics and invite clinic staff.

## Decisions

### 1. One new app in the monorepo: `apps/office`

Next.js, same versions and conventions as `apps/web`. Deployed at `office.karibu.health`. It contains the partner surface (`/o/[office]/…`), the Foundation console for Karibu central (`/foundation`), and two login-free pages a clinic opens from WhatsApp (`/r/[token]` readiness form, `/i/[token]` invoice).

Brand: the existing Karibu Health tokens (cobalt `#1F36C7` and the rest of `packages/design-system`), copied per app as ADR-0001 prescribes. The hex values in spec §6.1 do not exist anywhere in the repo and were not adopted.

### 2. Same Supabase project, `office` schema, and no service-role key in the app

Confirmed by Nate on 2026-11-23. The earlier version of this ADR chose a second Supabase project. That was reversed because every Phase 1 feature joins office data to clinic data (readiness score, automatic milestones, health, provisioning), and two projects would turn each of those into a cross-project call plus a second migration chain and demo seed.

The isolation the second project was meant to give is kept by three locks instead:

| Lock | What it does |
|---|---|
| The `office` schema is not exposed through the API and no API role has `USAGE` on it | Office tables cannot be queried at all, with any key. RLS is enabled with no policies as a second layer. |
| `apps/office` holds the anon key plus the signed-in user's Clerk token. It has **no** `SUPABASE_SECRET_KEY`. | The app cannot read EHR tables even if its own code is wrong. The only way in is the `public.office_*` RPCs. |
| Every `office_*` RPC is `SECURITY DEFINER`, checks office membership first, and returns counts, rates, timestamps and staff names only | The database, not the UI, decides what an office sees. |

Two tests hold this in place (`packages/supabase/tests/office_operations.sql`):

- a **behavioural** one: a clinic with a distinctively named patient is loaded through every office and central RPC, and the combined output is searched for the patient's name, phone, national ID, village and row id;
- a **structural** one: no function in `office.*` or `public.office_*` may reference a patient-identifying or clinical column at all. Counting patient rows is allowed; selecting `first_name` is a test failure.

The earlier ADR allowed redacted patient numbers in support conversations. The spec does not, and they are not returned.

### 3. Grants on functions are explicit, every migration

Functions are executable by `PUBLIC` when created, and `ALTER DEFAULT PRIVILEGES IN SCHEMA … REVOKE … FROM PUBLIC` does not change that. So every office migration ends with `office.apply_rpc_grants(p_anon, p_service_only)`, which closes every `public.office_*` function to `PUBLIC` and `anon`, opens it to `authenticated` and `service_role`, then applies two exception lists.

- **Open to `anon`** (a deliberate exception to migration 063's "anon has no application functions"): the readiness form RPCs, the public invoice RPC, the public storefront profile, and the Storage write check. Each is gated by an opaque random token that expires, or returns only public marketing data.
- **Service role only:** `office_capture_lead` (called by the EHR web server for the public form) and `office_run_nightly`.

**Found while building this, and not fixed here:** the same default applies to the EHR's own functions. In a local replay of migrations 001–114, 82 of 189 `SECURITY DEFINER` functions in `public` are executable by `anon`, because migration 063's default-privilege revoke has no effect on functions created after it. Most fail closed inside (the identity helpers raise without a `sub`), but this should be checked against production and closed the same way.

### 4. Identity: the EHR's Clerk instance, gated by `office.office_members`

- Office roles (`owner`, `sales`, `implementer`, `support`) live in `office.office_members`, not in Clerk organizations. Clerk organizations in this instance mean clinics, and the EHR's webhook turns every organization member into a clinic `staff` row.
- A person joins an office with a **one-time join link** shared over WhatsApp (`/join/[token]`): Karibu central creates the link, the person signs in and accepts, and the membership is bound to that login. No email matching, no Clerk admin call.
- Karibu central is the existing `superadmins` table.
- One Clerk identity may be both an EHR staff member and an office member. They are checked separately per surface.

### 5. Provisioning a clinic must not make the partner a clinic member

The superadmin flow creates the clinic's Clerk organization with `createdBy` set to the acting user, which makes that user an org admin and, through the webhook, a clinic `staff` row with full chart access. The office flow creates the organization with **no creator** (`apps/office/src/lib/clinic-signin.ts`), then calls `office_clinic_provision`.

- If the Clerk `organization.created` webhook inserted a bare clinic row first, the RPC adopts it, but only when the row is under 15 minutes old, has no staff, no patients and no office. An established clinic cannot be claimed by passing its organization id.
- `staff.clerk_user_id` is unique, so a person works at one clinic. `office_staff_invite_record` refuses an email that is active staff at a clinic the office does not hold.
- A lapsed partner fee blocks provisioning **new** clinics only (`office.assert_can_provision`). Nothing else checks the fee, so existing clinics are never interrupted.

**Residual risk, by design of the spec:** an office invites clinic staff, including clinic admins. Nothing technical stops a partner inviting an email address they control. Every invite is written to `office.audit_events`; the control is the audit trail plus the data processing agreement each office signs.

### 6. First claim per clinic

Decided 2026-11-23. No district exclusivity. A unique index on (country, normalized district, normalized name) across all offices makes the first office to add a clinic its holder. A second office's claim is refused, recorded in `office.claim_conflicts` and shown to Karibu central, who rules "same clinic" (first claim stands) or "different clinic" (the second office gets its own account). The claiming office is not told who holds the clinic. `office.territories` exists and is descriptive only.

Normalization folds case, punctuation, "Health Centre" → "HC" and roman numerals, so "Kitanda Health Centre III" and "kitanda HC 3" are the same claim. It will not catch every spelling; the conflict queue is the backstop.

### 7. Stages are derived, and three clinic stages are platform-only

- **Office stage (1–5)** is computed by `office.derive_stage` from data. Central can pin it.
- **Clinic stage:** people move a clinic through `lead … kit_delivered`. `live`, `steady` and `billed` are set only by the platform from what it observes (first patient registered; visits on 5 of every 7 days after a week live; first invoice paid). Each event is stored with `source = 'auto' | 'manual'`.
- **Grant milestones verify only from `auto` events.** There is no "mark verified". Central releases a verified milestone in one step; an unverified one cannot be released.

One deviation from spec §4.1: the table unlocks Invoices when the "first clinic is billed", which cannot happen without invoices. Stage 3 is therefore reached when the **first invoice is issued**, and a "New invoice" action is available on any clinic that is set up or readiness-cleared, at any stage.

### 8. Money is recorded, never moved

Karibu Office records that a payment arrived: a pasted MTN MoMo or Airtel Money SMS, a statement CSV, or cash. It suggests the invoice (same open balance, then payer phone), and a suggestion counts only when the partner confirms it. There is no collection, no Request-to-Pay and no merchant credentials. This replaces the earlier ADR's phase-4 MoMo collection; aggregator collection into the office's own account is a Phase 2 question for counsel (spec §12.6).

Clinic-facing invoices name the office as seller (public name and registered name) with the office's own payout details. Karibu appears in the footer as the software.

Amounts are `BIGINT` minor units with an ISO 4217 code. UGX has no minor unit.

### 9. The partner fee is a labelled ledger row

$5 a month, localized in the price book (UGX 20,000) under the existing drift test. One row per office per month in `office.partner_fees`; central marks months paid against a MoMo reference, oldest first, and several months can be covered by one transfer.

**Where the fee goes is not decided** (spec §14). Each row carries a `fund` label, defaulting to `network_fund:<country>`, so the destination can change as data.

### 10. Scheduled work runs where the service role already is

The nightly job is one SQL function, `office_run_nightly()` (health scores, alert to-dos, automatic milestones, overdue invoices, grant verification). It is triggered by an Inngest cron in `apps/web`, which already has Inngest and the service role. `apps/office` has neither.

### 11. Offline is narrow, and only in this app

`docs/platform-contract.md` rule 3 (no offline on web) is about the EHR web app and now says so. Karibu Office is installable, keeps already-opened office pages readable with no signal, and queues the field visit log on the phone (idempotent on a client-generated id). Everything else needs a connection and says so. It is not an offline copy of the app. Whether this holds up on the phones offices carry is still to be tested on Javis's.

### 12. Low data

- System fonts, no webfont download. Server-rendered pages; forms post to server actions and work without client JavaScript. Client components exist only for the visit log, photo upload, the signal test and print.
- The login-free pages have their own root layout without the sign-in library.
- `scripts/check-page-weight.mjs` fails the build if a core route's JS + CSS exceeds its budget (gzip): 215 KB signed in, 160 KB login-free. Measured on 2026-11-23: 194 KB and 150 KB. About 135 KB of that is Next.js and React.
- Photos are resized to 1600 px JPEG on the phone before upload.

### 13. AI drafts, a person approves

Photo-to-catalog uses a vision model behind a small provider interface (OpenAI, per `platform-contract.md` §6). Output becomes a **draft** the partner edits row by row. Nothing reaches a clinic until `office_catalog_draft_approve`. The prompt tells the model to ignore patient names; the staff roster is not sent to the model in Phase 1 (the clinic types its staff list in the form).

### 14. Cash flow inputs and analytics are counts, with the judgement in the app

Added 2026-11-25 (migration 119).

- `office.costs` and `office.office_prefs` hold what the partner types in: their own costs and the balance they say is in their accounts. Nothing reads a bank or a wallet, and decision 8 stands: money is recorded, never moved. The six-month forecast is arithmetic in `apps/office/src/lib/cashflow.ts`.
- `office_analytics` returns raw counts across the office's live clinics: weekly visit counts, staff totals from the nightly health snapshot, the lead-to-live funnel, payment timing and support load. It selects no patient or clinical column; the structural test covers it.
- Whether a panel has enough data to show a rate or a trend is decided in `apps/office/src/lib/analytics.ts`, not in SQL, so the thresholds are unit tested and can change without a migration. A panel is `collecting`, `ready`, `stale` or `paused`. The owner's pauses are stored in `office.office_prefs.analytics_paused`.
- Brand: decision 1's "existing Karibu Health tokens" is superseded. Office uses the KaribuLearn coral (`docs/karibu-office-brand.md`).

## What is not built

- Phase 2 and 3 modules. Their tables exist as stubs: `office.kits`, `devices`, `referral_links`, `commissions`, `one_on_ones`.
- The Android "Get help" button. The RPC accepts an Android staff token; only the web button exists.
- Support attachments (photos, voice notes). Phase 1 intake is text.
- Enforcing read-only for a lapsed clinic. The pricing rule stands; nothing in Phase 1 lapses a clinic.
- A per-clinic price list for services in the EHR. The EHR has one consultation fee per clinic and prices drugs per stock item, so other service prices stay on the office's draft and are reported as not applied.

## Consequences

- **Good:** one database, one migration chain, and the no-patient-data rule is enforced by the database and by tests, not by review.
- **Cost:** the office app's correctness depends on Clerk session tokens being accepted by Supabase (already true for Android). A Clerk outage takes Karibu Office down with the EHR.
- **Risk:** EHR schema changes can break office RPCs that read `visits`, `patients`, `staff` and `sync_operations`. The office SQL tests run against the full replayed EHR schema to catch that.
- **Risk:** "last sync" is approximated from server-side writes until the Phase 2 device heartbeat, so a clinic working offline for two days looks the same as a clinic that stopped using Karibu.
