# KaribuEHR Onboarding

**Status:** In development (migration `079_staff_onboarding.sql`).

KaribuEHR Onboarding is **required staff training** inside Karibu EHR. It is not KaribuLearn.

| | KaribuLearn | KaribuEHR Onboarding |
|---|---|---|
| Product | Free CME | Required EHR staff training |
| Surface | Android only (`apps/learn-android`) | EHR Android + web (`/onboarding`) |
| Auth | Supabase Auth (future) | Clerk |
| Teaches | Clinical reasoning | Software workflows across all roles |
| Patient data | Simulated `.kpack` cases | Simulated cases only — no writes to real charts |
| Gate | None | Must complete before `rpc_create_patient` |

## Experience

Gamified walkthrough — same interaction pattern as KaribuLearn (coral coach + cobalt chart simulation on the left), reframed for **where to tap in KaribuEHR**. Every new staff member completes **all role modules** (records, nurse, clinician, lab, pharmacy, billing) regardless of their assigned role.

- **Android-first:** primary training surface; matches how HC III staff use Karibu in the field.
- **Web bonus:** `/onboarding` mirrors modules on laptop; manifest `web_bonus` copy highlights desk-wide views (lab batch, pharmacy inventory, billing receipts).

## Content

Module catalog: `content/onboarding/manifest.json` (bundled to Android assets and `apps/web/public/onboarding/`).

Cases reuse KaribuLearn `.kpack` fixtures (e.g. `core-opd` / `fever-headache`) with onboarding-specific coach intros. Long-term: dedicated `onboarding_steps` per module in the pack schema.

## Completion gate

- `staff.onboarding_completed_at` — set when all required modules are done.
- `staff_onboarding_progress` — per-module scores.
- `rpc_create_patient` calls `assert_onboarding_complete()` (server enforcement).
- Android blocks **New patient** and **Check-in** routes when onboarding incomplete.
- Web `OnboardingGuard` redirects to `/onboarding`.

Existing staff are grandfathered on migration (`onboarding_completed_at = now()`). Only **new** staff rows must train.

## RPCs

- `rpc_get_onboarding_status()`
- `rpc_complete_onboarding_module(p_module_id, p_score, p_total)`

## Code map

```
content/onboarding/manifest.json     Module catalog (source of truth)
apps/android/.../ui/onboarding/      Android training UI + gate
apps/web/src/app/onboarding/         Web training UI
packages/supabase/migrations/079_*   Schema + RPCs
```

## Related

- Product split: [`karibu-learn/product-boundary.md`](karibu-learn/product-boundary.md)
- Case schema (shared fixtures): [`karibu-learn-pack-schema.md`](../karibu-learn-pack-schema.md)
