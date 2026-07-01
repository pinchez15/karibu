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

Self-guided EHR training on **interactive mock screens** with step-by-step coach copy (paper bridges + tips). Every staff member completes **all six role modules** regardless of assigned role.

- **Web:** `/onboarding` — `EhrOnboardingClient` + `ehr-modules.ts` + `mock-screens.tsx`
- **Android:** `OnboardingRoot` → `EhrGuidedModuleScreen` + `EhrOnboardingModules.kt` + `EhrMockScreens.kt`
- **Shared:** module IDs, Supabase progress (`staff_onboarding_progress`), completion gate on `rpc_create_patient`

Legacy KaribuLearn `WalkthroughScreen` / `fever-headache` case playback is **no longer** used for EHR onboarding (still used by in-app KaribuLearn CME if enabled).

## Content

Module catalog: `content/onboarding/manifest.json` (hub titles; bundled to Android assets and `apps/web/public/onboarding/`).

**Step copy source of truth:** `apps/web/src/app/onboarding/ehr-modules.ts` and `apps/android/.../ehr/EhrOnboardingModules.kt` (keep in sync).

## Completion gate

- `staff.onboarding_completed_at` — set when all required modules are done.
- `staff_onboarding_progress` — per-module scores.
- `rpc_create_patient` calls `assert_onboarding_complete()` (server enforcement).
- Android blocks **New patient** and **Check-in** routes when onboarding incomplete.
- Web `OnboardingGuard` redirects to `/onboarding`.

Existing staff are grandfathered on migration (`onboarding_completed_at = now()`). Only **new** staff rows must train.

## Cross-device progress

Module completion is stored in **`staff_onboarding_progress`** on EHR Supabase, keyed by Clerk identity (same staff row on web and Android).

- Complete a module on **web** → Android hub refreshes on foreground / when opening training (polls `rpc_get_onboarding_status`).
- Complete a module on **Android** → web hub polls every 20s and on tab focus (`refreshOnboardingStatusAction`).
- When all modules finish, `staff.onboarding_completed_at` is set once; both surfaces unlock patient registration.

Staff may use their personal phone, a clinic tablet, or a laptop — any device signed into the same Clerk account shares one progress record.

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
