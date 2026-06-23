# Karibu Learn and Karibu EHR — product boundary

**Status:** Locked for KaribuLearn vs EHR data/auth. KaribuEHR Onboarding is a separate EHR feature (see [`karibu-ehr-onboarding.md`](../karibu-ehr-onboarding.md)).

## Two CME / training products

| | Karibu EHR | KaribuLearn | KaribuEHR Onboarding |
|---|------------|-------------|----------------------|
| **Purpose** | Clinical record for signed-up clinics | Free CME: clinical reasoning | Required staff training on the product |
| **Android** | `apps/android` (`com.karibuhealth.app`) | `apps/learn-android` (`com.karibuhealth.learn`) | Inside `apps/android` (Clerk) |
| **Web** | Clinic dashboard / chart | **None** (Android only) | `/onboarding` (Clerk) |
| **Auth** | Clerk | Supabase Auth (separate project) | Clerk |
| **Database** | EHR Supabase (PHI) | Learn Supabase (no PHI) | EHR Supabase (progress only) |
| **Patient data** | Real clinic patients | Simulated `.kpack` only | Simulated cases — no real writes |

**KaribuLearn** and **Karibu EHR** are separate apps: different auth, different user databases, no cross-launch. **KaribuEHR Onboarding** lives inside EHR and uses Clerk.

KaribuLearn does not grant EHR access. KaribuLearn accounts do not use Clerk.

## KaribuLearn (free CME)

- Android-only distribution (`apps/learn-android`).
- Teaches medicine; familiarity with mobile chart UX is a side benefit.
- No web app, no EHR integration, no Clerk.

## KaribuEHR Onboarding

- Required before registering real patients (`onboarding_completed_at`, migration 079).
- Cross-role modules for every new staff member.
- Reuses case fixtures from the Learn content pipeline; coach copy focuses on software literacy.
- Android-primary; web adds desk-wide bonus context.

## Why both live in this monorepo

- Learn and Onboarding can **mirror** EHR interaction patterns (chart layout, vitals, notes) using shared design tokens and `.kpack` schema.
- Engineering velocity: one case pipeline feeds KaribuLearn (medicine) and Onboarding (product training).

Monorepo co-location is for **UI and content parity** — not shared auth or PHI.

## Implementation rules

- **KaribuLearn:** `apps/learn-android` only. Do not import EHR Room, Clerk, or EHR Supabase.
- **Onboarding:** `apps/android/.../ui/onboarding` and `apps/web/src/app/onboarding`. May reuse Learn walkthrough composables and `.kpack` assets bundled in EHR; must not import Learn Supabase.
- **EHR:** Do not embed KaribuLearn app or public CME routes in EHR navigation.
- Legacy `apps/android/.../ui/learn` and `apps/web/src/app/learn` are transitional; Onboarding supersedes in-EHR use of those paths.

## Related docs

- Vision: [`vision.md`](vision.md)
- EHR Onboarding: [`../karibu-ehr-onboarding.md`](../karibu-ehr-onboarding.md)
- Learn Android: [`../../apps/learn-android/ARCHITECTURE.md`](../../apps/learn-android/ARCHITECTURE.md)
- Case packs: [`../karibu-learn-pack-schema.md`](../karibu-learn-pack-schema.md)
