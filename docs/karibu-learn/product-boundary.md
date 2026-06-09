# Karibu Learn and Karibu EHR — product boundary

**Status:** Locked. Supersedes any doc that describes Learn as an EHR screen, tab, or shared user base.

## Two applications

| | Karibu EHR | Karibu Learn |
|---|------------|--------------|
| **Purpose** | Clinical record for signed-up clinics | Free CME: simulated cases that teach the Karibu chart |
| **Android app** | `apps/android` (`com.karibuhealth.app`) | `apps/learn-android` (`com.karibuhealth.learn`) |
| **Web** | Clinic dashboard / chart | `learn.karibu.health` (and `apps/web/src/app/learn` during development) |
| **Auth** | Clerk | Supabase Auth (separate project) |
| **Database** | EHR Supabase (PHI, visits, sync) | Learn Supabase (learners, progress, pack catalog — no PHI) |
| **Patient data** | Real clinic patients | Simulated patients in `.kpack` content only |

Karibu Learn and Karibu EHR are **completely separate apps**. They do not share user databases, auth providers, or runtime data. A Learn account does not grant EHR access; an EHR account does not grant Learn access.

## Not reachable from each other

- Karibu EHR must **not** launch, deep-link to, or embed Karibu Learn.
- Karibu Learn must **not** launch, deep-link to, or embed Karibu EHR.
- There is no “open Learn from clinic” or “open chart from Learn” product flow.

Marketing copy may mention that clinics can later adopt Karibu EHR; that is positioning only, not a technical integration.

## Why both live in this monorepo

The repository is a **platform monorepo**, not a single-product app repo. Karibu Learn and Karibu EHR live together so that:

- Learn can **mirror** EHR interaction patterns (chart layout, vitals, notes, coach vs chart chrome) for **pre-onboarding**: staff practice on simulated cases before their facility signs up for EHR.
- Shared **design tokens**, clinical presentation models, and content schemas can evolve in one place without copying repos.
- The case-generation pipeline and `.kpack` format stay next to the apps that consume them.

Monorepo co-location is for **UI and workflow parity** and engineering velocity — not for shared auth, shared Supabase, or cross-app navigation.

## Implementation rules

- Learn code lives under `apps/learn-android` and Learn-owned packages. Transitional Learn UI under `apps/android/.../ui/learn` is legacy staging until ported; it must not be wired into EHR navigation.
- Do not import EHR Room, sync, PHI models, Clerk, or EHR Supabase clients into Learn.
- Do not import Learn learner progress or Learn Supabase into EHR.

## Related docs

- Vision: [`vision.md`](vision.md)
- Learn Android architecture: [`../../apps/learn-android/ARCHITECTURE.md`](../../apps/learn-android/ARCHITECTURE.md)
- Case packs: [`../karibu-learn-pack-schema.md`](../karibu-learn-pack-schema.md)
- Platform layout: [`../../architecture.md`](../../architecture.md)
