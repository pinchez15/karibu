# ADR-0001 — Split Karibu into per-subdomain apps

- **Status:** Proposed
- **Date:** 2026-06-05
- **Deciders:** Nate (founder), engineering
- **Supersedes:** the implicit "one Next app at `karibu.health` with `/learn`, `/dashboard`, … paths" structure

## Context

Karibu is becoming three (plus one) distinct products that share design DNA but
**nothing else** — not auth, not data, not trust boundary, not scale profile:

| Product | Audience | Auth | PHI? | Scale |
|---|---|---|---|---|
| **Karibu EHR** | HC III clinicians, per-clinic, paid | Clerk | Yes (clinical) | ~1,000 users |
| **KaribuLearn** | Any clinician in Uganda, free | Supabase Auth | No (simulated only) | ~100,000 users |
| **Investors / funders** | Foundations + individual philanthropists | Own auth | No (aggregate only) | tens–hundreds |
| **Marketing (apex)** | The public | None | No | open |

Two facts already point this way:

1. **`apps/learn-android`** is now a standalone app (`com.karibuhealth.learn`)
   with `ARCHITECTURE.md` mandating *hard* separation from the EHR (no shared
   Room/Supabase/sync/PHI), its own Supabase project, and **Supabase Auth, not
   Clerk**. KaribuLearn is no longer "a tab in the EHR app."
2. The KaribuLearn **web** mirror (`apps/web/src/app/learn/`) was built with zero
   imports outside its own folder — it is already extraction-ready.

The forcing function the founder named is **login**: each space needs a
different sign-in, against a different identity realm, with a different security
posture. A single app at `karibu.health/<path>` forces one middleware + one
auth/cookie context across all of them — the exact coupling we are removing from
KaribuLearn (it must have no Clerk in its tree).

## Decision

**Each space is its own deployable app on its own subdomain.** Not route groups
under one domain.

| Subdomain | App | Auth | Visibility |
|---|---|---|---|
| `ehr.karibu.health` | Karibu EHR web (`apps/web`, unchanged) | Clerk (per-clinic) | Protected |
| `learn.karibu.health` | KaribuLearn web (`apps/learn-web`, new) | Supabase Auth (optional) | Public; login-free browsing |
| `investors.karibu.health` | Investor portal (`apps/investors-web`, new) | Supabase Auth (own realm) | Public landing + gated portal; `noindex` on portal |
| `karibu.health` (apex) | Marketing front door (`apps/site`, new or static) | None | Public |

`apps/web` keeps its directory name; only its **deploy domain** changes to
`ehr.karibu.health` (directory name ≠ domain; renaming would churn CI/Vercel for
no benefit). The apex `karibu.health` becomes the marketing front door and the
shared entry point ("Learn for free" → `learn`, "For your clinic" → apply →
`ehr` onboarding, "Support Karibu" → `investors`).

### Why separate apps, not paths

- **Independent auth realms.** Clerk (EHR) / Supabase Auth (Learn) / Supabase
  Auth (Investors) never share a session, cookie scope, or middleware. A Learn
  account must not imply EHR access, and vice-versa.
- **Blast radius.** A Learn traffic spike (100k learners) or an investor-portal
  incident cannot touch the clinical EHR.
- **Security posture per surface.** EHR keeps the strong clinical posture; Learn
  optimizes for low-friction free access; Investors is a small private board.
- **Independent deploys + scaling + env/secrets.** Different release cadences,
  different Supabase projects, different rate limits.

## Monorepo layout (target)

```
apps/
  web/            → Karibu EHR web (Clerk)            → ehr.karibu.health        [keep name]
  android/        → Karibu EHR Android (Clerk)        → Play Store               [keep]
  learn-web/      → KaribuLearn web (Supabase)        → learn.karibu.health      [NEW: lift from web/src/app/learn]
  learn-android/  → KaribuLearn Android (Supabase)    → Play Store (separate)    [EXISTS]
  investors-web/  → Investor portal (Supabase)        → investors.karibu.health  [NEW]
  site/           → Marketing front door              → karibu.health            [NEW, optional/static]
packages/
  shared/         → existing TS types/constants (EHR)
  supabase/       → EHR migrations + edge functions
  brand/          → shared design tokens (KH cobalt + KL coral), KMark, fonts   [extract later, see below]
```

> Note: KaribuLearn now lives in `apps/learn-android` + `apps/learn-web`. The
> earlier **embedded** version (`apps/android/.../ui/learn`, launched from the
> EHR's Learn tab) is superseded by the standalone apps and should be retired or
> migrated into `learn-android` once the standalone reaches parity, so there is
> one canonical KaribuLearn per platform.

## Per-space specifications

### `ehr.karibu.health` — Karibu EHR (unchanged)
- Stays `apps/web` with Clerk auth and the existing Supabase backend / RLS.
- Only change: deploy domain → `ehr.karibu.health`; **remove the `/learn` route**
  (it moves to `learn-web`) and any KaribuLearn assets from `public/`.
- The root `ClerkProvider` stays here — it is correct for the clinical app.

### `learn.karibu.health` — KaribuLearn web (new `apps/learn-web`)
- Lift `apps/web/src/app/learn/**` + `apps/web/public/learn/**` + the `klshim`
  keyframe + the Inter/Geist-Mono `next/font` wiring into a fresh Next app.
- **Root layout has no `ClerkProvider`.** Browsing is public and login-free.
- **Supabase Auth** for the optional account (CME certificates, saved progress),
  against KaribuLearn's **own Supabase project** — never the EHR's. Mirrors the
  `learn-android` boundaries in `apps/learn-android/ARCHITECTURE.md`.
- Serves `.kpack`s from its own `public/learn` or a CDN; manifest `download_url`s
  switch from the `bundled-remote://` dev scheme to real https.
- Shares the exact case schema (`docs/karibu-learn-pack-schema.md`) with Android,
  so the Python pipeline feeds both surfaces unchanged.

### `investors.karibu.health` — Investor portal (new `apps/investors-web`)

This is the space whose scope grew the most. It is **two tiers**:

**1. Public landing (no auth).** A solid, public-facing page: mission, the
problem, the product across EHR + Learn, headline traction/impact, and the deck
(from the design bundle's `slides/`). A single "Support Karibu" CTA → sign in /
request access. `noindex` is *not* applied here (this is meant to be found).

**2. Donor / board portal (authed).** Treat donors like VC capital; this is
their board page. Behind Supabase Auth (own realm), `noindex`:
- **Give (one-click).** Post–501(c)(3): one-click recurring/one-off donation via
  a payment provider (Stripe nonprofit recommended). **Pre–501(c)(3):** no
  tax-deductible giving yet — collect *pledges / commitments* and intent, show a
  clear "tax-deductible giving opens when our 501(c)(3) is filed" state. The UI
  is built now; the live charge path is gated on the 501(c)(3) flag.
- **My contributions.** Each donor sees their own giving history, receipts, and
  (post-501c3) tax documents. Private to that donor.
- **The board view (near-real-time).** Three panels:
  - *Strategic direction* — roadmap / OKRs / current focus (curated, updated by
    the team).
  - *Capital activities* — "donations as VC capital": raises, total committed vs
    received, runway, and **allocation of capital** (where the money is going).
  - *Impact metrics* — updated in relatively real time: clinics live, visits
    documented, HMIS 105 reports generated, KaribuLearn learners + cases
    completed, etc.

**Hard constraint — PHI safety.** The investor portal shows **aggregate,
de-identified rollups only**. It must never read raw clinical tables or expose a
single patient/visit/clinic-identifying record. Impact metrics are served from a
dedicated **aggregation layer** (a metrics view / RPC / scheduled rollup table)
that the EHR and Learn publish into — the investor app does not touch the EHR
Supabase directly. This keeps the trust boundary intact even though the metrics
"feel real-time."

Indicative data model (investor Supabase): `donors`, `contributions` /
`pledges`, `capital_allocations`, `board_updates` (strategic direction),
`impact_snapshots` (aggregate metrics over time). Detailed product spec to follow
in its own doc once this ADR is accepted.

### `karibu.health` (apex) — Marketing
- Public front door. Routes visitors to the right space (Learn / apply for EHR /
  Support). Can start as a single static page and grow. No auth.

## Auth strategy

Three **independent identity realms**, no implied cross-access:
- **EHR:** Clerk (strong clinical posture, orgs = clinics, retained).
- **Learn:** Supabase Auth, own project, low-friction, anonymous→authenticated
  progress supported later.
- **Investors:** Supabase Auth, own project/realm, small allowlist + invite.

A person may exist in more than one realm with separate identities; that is
intentional. Do not auto-provision one from another.

## Shared brand

All four use the Karibu design system (cobalt EHR / coral Learn / brand marks /
Inter + Geist Mono). Strategy: **per-app tokens now, extract `packages/brand`
once a second app needs the same component.** KaribuLearn web already carries
self-contained tokens; duplicating ~2 files is cheaper than a premature shared
package. Extract when the marketing site + investor portal both need the marks
and type — then `packages/brand` holds tokens, `KMark`, the `.learn`/`.health`
wordmarks, and the font wiring.

## Deployment

- **One Vercel project per app**, each with its subdomain as the production
  domain. Separate env/secrets per project (separate Supabase projects for Learn
  and Investors; EHR keeps its own).
- **DNS:** `CNAME` records for `ehr`, `learn`, `investors` → Vercel; apex via the
  host's apex/ALIAS support. TLS auto-provisioned.
- **`noindex`** on the investor portal (and any authed surface); marketing +
  Learn are indexable.
- CI builds each app independently; a change in Learn never rebuilds the EHR.

## Sequencing (phased; no big-bang)

1. **EHR domain move** — point `ehr.karibu.health` at `apps/web`; keep
   `karibu.health` working during transition.
2. **Extract `learn-web`** — standalone app, Supabase Auth stub, packs, go live
   at `learn.karibu.health`; remove `/learn` from `apps/web`.
3. **Apex marketing** — minimal front door at `karibu.health`.
4. **Investor portal** — public landing + deck first; then the authed board
   portal + the aggregation/metrics layer; then the live giving path gated on
   501(c)(3).
5. **Retire the embedded Android Learn** in favor of `apps/learn-android`.
6. **Extract `packages/brand`** when the third app needs the marks.

## Consequences

**Positive:** clean trust boundaries; independent scaling (100k learners can't
hurt the EHR); per-surface security; independent releases; KaribuLearn is finally
Clerk-free; investor data stays PHI-safe by construction.

**Negative / to manage:** more deploy targets and DNS to operate; brand
duplication until `packages/brand`; an aggregation layer must exist before the
investor board can show live metrics; auth is now three systems to reason about;
the embedded Android Learn must be retired to avoid two KaribuLearns.

## Open questions

- Apex (`karibu.health`): standalone marketing app, or does it live with one of
  the others? (Recommend its own minimal app.)
- Payment provider + flow for donations (Stripe nonprofit vs a donation
  platform), and exactly what the pre-501(c)(3) "pledge" state captures.
- Who owns/updates the board content (strategic direction, capital allocation),
  and the cadence + source of impact-metric rollups.
- Shared Supabase org vs fully separate Supabase accounts for Learn vs Investors.
```
