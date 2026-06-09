# Karibu Learn Android Architecture

Karibu Learn is a **standalone Android application**, sibling to Karibu EHR — not a module inside the EHR app.

It mirrors the same design DNA, chart interaction patterns, clinical vocabulary, and workflow feel as Karibu EHR so learners can pre-onboard before their clinic signs up for EHR. That mirroring is intentional product design; it is **not** shared runtime data, auth, or navigation.

**Product boundary (locked):** [`docs/karibu-learn/product-boundary.md`](../../docs/karibu-learn/product-boundary.md)

## Relationship to Karibu EHR (monorepo only)

Karibu EHR and Karibu Learn live in one monorepo so presentation patterns and content pipelines stay aligned. Karibu EHR defines the mature clinical workflow patterns Learn simulates:

- patient chart structure
- clinical timeline patterns
- vitals presentation
- note and assessment card patterns
- citation and AI-assist visual language
- calm, precise clinical interface density

Karibu Learn reuses those **patterns** for simulated cases. This is shared product DNA, not shared clinical data. Learn must not be launched from EHR, and EHR must not be launched from Learn.

## Hard separation rules

Karibu Learn must not import or depend on:

- EHR Room databases, entities, DAOs, or migrations
- EHR Supabase clients, DTOs, RPCs, edge functions, or migrations
- EHR sync queues, outbox logic, reconciliation logic, or offline patient-record code
- EHR PHI models or patient identifiers
- EHR clinical records such as real patients, visits, provider notes, patient notes, vitals, labs, payments, or pharmacy records
- Clerk or EHR identity/session code

Karibu Learn may depend on:

- shared design tokens
- shared clinical UI presentation contracts
- simulated chart models
- learning content schemas
- its own Supabase project (learners, progress, pack distribution)
- Supabase Auth (separate from EHR Clerk)

## Data model boundary

Karibu Learn uses simulated patients only.

Learn data may include:

- learner profile
- learning pack catalog
- downloaded pack metadata
- case progress
- question attempts
- scores
- local offline content indexes

Learn data must not include:

- real patient names
- real clinic visit records
- PHI
- EHR patient IDs
- EHR clinic IDs
- EHR staff IDs as clinical actors
- EHR sync state

## Supabase boundary

Karibu Learn has its **own** Supabase project (separate from EHR).

- Learn-owned tables, policies, functions, storage buckets, and credentials only.
- Do not point the Learn app at the EHR Supabase database.

Reasoning:

- Karibu Learn has a much larger expected user base than Karibu EHR.
- Karibu Learn does not handle PHI.
- Learn access patterns are content download and learner progress, not clinical operations.
- Separate infrastructure prevents accidental cross-product access.

Scale assumption:

- Karibu Learn may reach 100,000 users.
- Karibu EHR may have around 1,000 users.

## Auth

| Product | Auth |
|---------|------|
| Karibu EHR | Clerk |
| Karibu Learn | Supabase Auth |

Learn accounts and EHR accounts are unrelated. Learn usernames and sessions must not imply clinic EHR access.

## Package layout

```text
apps/learn-android/src/main/java/com/karibuhealth/learn/
├── auth/              # Learn-specific auth (Supabase Auth)
├── caseengine/        # Case state-machine and answer/progress flow
├── data/
│   ├── packs/         # Offline learning-pack import/index/read logic
│   └── supabase/      # Learn Supabase clients and DTOs only
├── domain/            # Learn domain models
├── navigation/        # Learn app navigation graph (root is Learn only)
└── ui/                # Learn UI surfaces and adapters
```

## Development rule

When adapting an EHR pattern for Learn, copy the interaction pattern and extract product-neutral UI where appropriate. Do not import EHR data or workflow code directly. Do not add EHR navigation routes that open Learn.

## Transitional code

Learn UI and pack loading currently also exist under `apps/android/app/src/main/java/com/karibuhealth/app/ui/learn` as migration staging. That code is **not** part of the EHR product surface and must not be registered in EHR `NavHost`. Target home: this module (`apps/learn-android`).
