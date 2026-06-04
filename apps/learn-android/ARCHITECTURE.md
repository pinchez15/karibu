# Karibu Learn Android Architecture

Karibu Learn is a child product of Karibu EHR.

It should inherit the same design DNA, chart interaction patterns, clinical vocabulary, and workflow feel from Karibu EHR. A healthcare worker should recognize the Karibu clinical environment immediately.

Karibu Learn must not share EHR data.

## Relationship to Karibu EHR

Karibu EHR is the parent clinical product. It defines the mature clinical workflow patterns:

- patient chart structure
- clinical timeline patterns
- vitals presentation
- note and assessment card patterns
- citation and AI-assist visual language
- calm, precise clinical interface density

Karibu Learn should reuse those patterns for simulated cases so the educational environment feels like a realistic Karibu chart.

This is shared product DNA, not shared clinical data.

## Hard Separation Rules

Karibu Learn must not import or depend on:

- EHR Room databases, entities, DAOs, or migrations
- EHR Supabase clients, DTOs, RPCs, edge functions, or migrations
- EHR sync queues, outbox logic, reconciliation logic, or offline patient-record code
- EHR PHI models or patient identifiers
- EHR clinical records such as real patients, visits, provider notes, patient notes, vitals, labs, payments, or pharmacy records

Karibu Learn may depend on:

- shared design tokens
- shared clinical UI presentation contracts
- simulated chart models
- learning content schemas
- its own Supabase project or schema
- its own authentication strategy

## Data Model Boundary

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

## Supabase Boundary

Karibu Learn should have its own Supabase ownership boundary.

Recommendation:

- Use a separate Supabase project for Karibu Learn if operationally practical.
- At minimum, use separate Learn-owned tables, policies, functions, buckets, and credentials.
- Do not point the Learn app at the EHR Supabase database.

Reasoning:

- Karibu Learn has a much larger expected user base than Karibu EHR.
- Karibu Learn does not handle PHI.
- Karibu Learn access patterns are content download and learner progress, not clinical operations.
- Separate infrastructure reduces the risk of accidental cross-product access.

Scale assumption:

- Karibu Learn may reach 100,000 users.
- Karibu EHR may have around 1,000 users.

Those products need different operational and security defaults.

## Auth Recommendation

Karibu EHR should continue to use its stronger clinical auth posture.

Karibu Learn should seriously consider Supabase Auth instead of Clerk.

### Argument for Supabase Auth for Karibu Learn

- Karibu Learn is free and educational, so auth should be low-friction.
- Learn does not handle PHI, so 2FA is less critical than in EHR.
- Supabase Auth is tightly integrated with Supabase row-level security, storage, and learner-progress tables.
- It avoids paying for or operating an enterprise identity layer for a much larger free user base.
- It keeps Learn usernames and identities separate from EHR identities by default.
- It is simpler for anonymous-to-authenticated learning flows if the app later supports guest progress.

### Argument for Clerk for Karibu Learn

- Shared auth vendor could simplify developer familiarity.
- Clerk has mature session, organization, and account-management UX.
- If Learn later needs enterprise cohorts, institutions, or organization-level administration, Clerk may be useful.

### Recommendation

Use Supabase Auth for Karibu Learn unless a specific product requirement emerges for Clerk-managed organizations or enterprise identity.

Keep usernames different between Karibu EHR and Karibu Learn.

Karibu Learn accounts should not imply access to Karibu EHR, and Karibu EHR accounts should not automatically become Karibu Learn accounts.

## Package Layout

```text
apps/learn-android/src/main/java/com/karibuhealth/learn/
├── auth/              # Learn-specific auth abstraction
├── caseengine/        # Case state-machine and answer/progress flow
├── data/
│   ├── packs/         # Offline learning-pack import/index/read logic
│   └── supabase/      # Learn Supabase clients and DTOs only
├── domain/            # Learn domain models
├── navigation/        # Learn app navigation graph
└── ui/                # Learn UI surfaces and adapters
```

## Development Rule

When adapting an EHR pattern for Learn, copy the interaction pattern and extract product-neutral UI where appropriate. Do not import EHR data or workflow code directly.

