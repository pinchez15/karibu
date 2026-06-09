# Karibu Platform Architecture

Status: proposed target architecture. This document describes how the current Karibu EHR repository should evolve into a Karibu platform monorepo with separate applications, shared clinical UI, shared content schemas, and a first-class Python learning-content pipeline.

## Current-State Assessment

The repository is already a monorepo, but it is still organized around a single primary product: Karibu EHR.

Current structure:

```text
karibu_health/
├── apps/
│   ├── android/              # Single Gradle project, currently one :app module
│   └── web/                  # Next.js dashboard
├── packages/
│   ├── shared/               # Shared TypeScript types/constants
│   └── supabase/             # Supabase migrations, edge functions, tests, scripts
├── Medical Corpus/           # Source guideline PDFs
├── karibu_design_files/      # Existing design exports/files
├── KaribuLearn/              # Untracked Learn/design staging folder
└── docs/                     # Architecture and product documentation
```

Important observations:

- Android is a single Gradle `:app` module under `apps/android`, with domain models, Room entities, repositories, sync, Supabase clients, auth, and Compose UI all in `com.karibuhealth.app`.
- Shared Compose components already exist inside the EHR app at `apps/android/app/src/main/java/com/karibuhealth/app/ui/components`, but they are coupled to the EHR app package and can accidentally depend on EHR state.
- Design tokens already exist in Android theme files and web/Tailwind files, but there is no product-neutral token package.
- `packages/shared` contains TypeScript types, but those types are EHR database-centric and should not become the canonical content-schema boundary for Karibu Learn.
- `packages/supabase` owns production EHR persistence, clinical AI edge functions, corpus embedding scripts, migrations, and tests.
- The medical source corpus is currently a root folder with PDFs. It is source material, not generated content, and should be treated separately from generated learning packs.
- Existing docs already push the EHR toward patient-centered, offline-first records. Karibu Learn should reuse the clinical chart mental model without sharing patient-data storage or PHI code paths.
- **Product boundary (locked):** [`docs/karibu-learn/product-boundary.md`](docs/karibu-learn/product-boundary.md) — Learn and EHR are separate apps (different auth and user DBs; not reachable from each other). The monorepo exists so Learn can mirror EHR UI for pre-onboarding.

## Target-State Principles

The platform should support multiple Karibu products without blurring their data responsibilities.

1. `apps/*` contains deployable products.
2. `packages/*` contains shared code or infrastructure that is product-neutral or explicitly scoped.
3. Karibu EHR and Karibu Learn are **separate Android applications** with separate application IDs, release pipelines, and user-facing entry points.
4. Neither app launches or embeds the other. No shared navigation, deep links, or single sign-on between Learn and EHR.
5. Shared Android UI modules must not depend on EHR repositories, Room databases, Supabase tables, or PHI models.
6. Learn content uses simulated patients only. No real patient identifiers, EHR visit IDs, EHR clinic IDs, or EHR sync queues should exist in Learn packs.
7. Source medical corpus, content schemas, generation pipeline, generated packs, and delivery infrastructure are separate concepts.
8. **Auth and databases are per product:** EHR uses Clerk + clinical Supabase; Learn uses Supabase Auth + Learn Supabase. No shared user tables or credentials.
9. **Monorepo rationale:** co-locate Learn and EHR so Learn can mirror EHR chart/workflow UX and share design tokens and content schemas — not to share runtime data.

## Recommended Target Architecture

```text
karibu_health/
├── apps/
│   ├── android/
│   │   ├── settings.gradle.kts
│   │   ├── gradle/
│   │   ├── apps/
│   │   │   ├── ehr/                         # Karibu EHR Android application
│   │   │   └── learn/                       # Karibu Learn Android application
│   │   ├── core/
│   │   │   ├── design-system/               # Compose theme, tokens, typography
│   │   │   ├── clinical-ui/                 # Reusable chart/workflow components
│   │   │   ├── auth-clerk/                  # Clerk Android integration wrappers
│   │   │   ├── network/                     # Shared HTTP primitives, no product DTOs
│   │   │   └── observability/               # Analytics/logging abstractions
│   │   ├── ehr/
│   │   │   ├── domain/                      # EHR domain models/use cases
│   │   │   ├── data-room/                   # EHR Room DB, entities, DAOs
│   │   │   ├── data-supabase/               # EHR Supabase DTOs/repositories
│   │   │   └── sync/                        # EHR offline sync/outbox
│   │   └── learn/
│   │       ├── domain/                      # Case, learner, attempt, rationale models
│   │       ├── data-packs/                  # Pack reader, local index, validation
│   │       ├── data-supabase/               # Pack catalog/download/progress sync
│   │       └── case-engine/                 # Interactive case state machine
│   ├── web/                                # Existing EHR/admin web app
│   └── learn-admin/                        # Optional future content/admin web surface
├── packages/
│   ├── design-tokens/                      # Product-neutral token source
│   ├── clinical-schemas/                   # Shared clinical/content schemas
│   ├── content-pipeline/                   # Python case-generation subsystem
│   ├── generated-learning-packs/           # Versioned generated artifacts
│   ├── medical-corpus/                     # Source corpus metadata/manifests
│   ├── shared/                             # Existing TS shared package
│   └── supabase/                           # Supabase project, split by domain folders
├── corpus/
│   └── source/                             # Canonical source PDFs/docs
└── docs/
```

## Package Boundaries

### Product Apps

`apps/android/apps/ehr`

- Owns the installable Karibu EHR Android app.
- Depends on shared design and clinical UI.
- Depends on EHR data/domain modules.
- May access PHI, EHR Room tables, EHR Supabase RPCs, and EHR sync.

`apps/android/apps/learn`

- Owns the installable Karibu Learn Android app.
- Depends on shared design and clinical UI.
- Depends on Learn domain, case engine, and learning-pack data modules.
- Must not depend on EHR Room, EHR sync, EHR PHI repositories, or EHR Supabase DTOs.

`apps/web`

- Continues to own EHR web workflows: dashboard, review, print, admin, Inngest.
- Should not become the Learn content authoring surface by default.

`apps/learn-admin`

- Optional future app for internal content review, pack publishing, and learning analytics.
- Keep separate from EHR dashboard to avoid mixing patient operations with education content.

### Shared Platform Packages

`packages/design-tokens`

- Canonical brand colors, typography, spacing, elevation, radii, semantic statuses, and clinical severity colors.
- Outputs generated adapters for Android Compose and web/Tailwind.
- Should be product-neutral: `KaribuTheme`, not `KaribuHealthTheme`.

`apps/android/core/design-system`

- Compose implementation of `packages/design-tokens`.
- Provides Material 3 theme, type scale, icons, common controls, and product-neutral surfaces.
- No EHR models, Supabase models, Room models, or business workflows.

`apps/android/core/clinical-ui`

- Reusable simulated/real chart UI components:
  - patient header shell
  - vitals cards/chips
  - clinical timeline
  - problem/assessment panels
  - orders/labs/medications sections
  - AI/citation banners
  - note/status pills
  - chart navigation patterns
- Accepts plain presentation models, not EHR entities.
- Must be usable by Learn with simulated patients and by EHR with real patients.

`packages/clinical-schemas`

- Canonical schemas for educational and clinical-content data:
  - case pack manifest
  - simulated patient chart
  - encounter timeline
  - vitals/lab/medication/order content
  - decision prompts
  - scoring/rubric
  - evidence citations
  - pack metadata/versioning
- Use a schema system that can generate or validate both TypeScript and Python. JSON Schema is the lowest-friction interchange format; Zod can be used as a TypeScript authoring layer if JSON Schema is emitted.
- EHR database types should remain separate from these schemas.

`packages/content-pipeline`

- First-class Python subsystem for generating, validating, reviewing, and packaging CME cases.
- Owns prompt templates, extraction/transformation logic, pack builders, validators, and CLI commands.
- Reads from `corpus/source` and `packages/medical-corpus`.
- Writes generated output to `packages/generated-learning-packs`.
- Should include tests and deterministic fixtures.

`packages/generated-learning-packs`

- Stores generated, versioned, non-PHI learning packs.
- Recommended structure:

```text
packages/generated-learning-packs/
├── README.md
├── index.json
├── malaria/
│   └── ug-hc3-malaria-basics/
│       ├── pack.json
│       ├── cases/
│       ├── media/
│       └── checksums.json
└── maternal-anc/
```

- Packs should be immutable once published. Revisions create new versions.
- Large binary artifacts may eventually move to object storage, but the manifest and test fixtures should stay in git.

## Android Module Strategy

Move from a single Android `:app` module to a multi-module Gradle project in phases.

Recommended final module layout:

```text
:apps:ehr
:apps:learn

:core:design-system
:core:clinical-ui
:core:auth-clerk
:core:network
:core:observability

:ehr:domain
:ehr:data-room
:ehr:data-supabase
:ehr:sync

:learn:domain
:learn:case-engine
:learn:data-packs
:learn:data-supabase
```

Dependency direction:

```text
:apps:ehr
  -> :ehr:domain
  -> :ehr:data-room
  -> :ehr:data-supabase
  -> :ehr:sync
  -> :core:design-system
  -> :core:clinical-ui

:apps:learn
  -> :learn:domain
  -> :learn:case-engine
  -> :learn:data-packs
  -> :learn:data-supabase
  -> :core:design-system
  -> :core:clinical-ui
```

Rules:

- `:core:*` modules cannot depend on `:ehr:*` or `:learn:*`.
- `:learn:*` modules cannot depend on `:ehr:*`.
- `:ehr:*` modules cannot depend on `:learn:*`.
- `:core:clinical-ui` accepts display models and callbacks only.
- Product apps wire dependencies, navigation, DI, and permissions.

The existing `apps/android/app` module should first be renamed or moved to `apps/android/apps/ehr`, after shared code extraction stabilizes. Avoid creating Karibu Learn inside the current EHR `:app` module; that would preserve the wrong boundaries.

## Karibu Learn Location

Recommended location:

```text
apps/android/apps/learn
```

Rationale:

- Learn is a standalone Android application and should live next to the EHR Android app in the same Gradle build.
- It can share Android-only modules without forcing Kotlin/Compose code into the Node package workspace.
- It makes product boundaries visible in Gradle dependency graphs.
- It avoids the current ambiguous `KaribuLearn/` root staging folder becoming a second source of truth.

The existing `KaribuLearn/karibu_design_files` content should be migrated later into either:

- `design/karibu-learn` if it is product design source material, or
- `karibu_design_files` if it is shared Karibu visual identity material.

Do not put application source under root `KaribuLearn/`.

## Python Case-Generation Pipeline Location

Recommended location:

```text
packages/content-pipeline
```

Recommended internal structure:

```text
packages/content-pipeline/
├── pyproject.toml
├── README.md
├── src/karibu_content_pipeline/
│   ├── corpus/
│   ├── generation/
│   ├── validation/
│   ├── packaging/
│   ├── review/
│   └── cli.py
├── tests/
├── fixtures/
└── prompts/
```

Responsibilities:

- Normalize and index source documents.
- Generate simulated patient cases from approved source material.
- Validate generated packs against `packages/clinical-schemas`.
- Produce pack manifests, checksums, and offline bundle artifacts.
- Emit provenance and citations for every case.
- Enforce "no real patient data" checks before pack publishing.

This should not live under `packages/supabase/scripts`. Supabase scripts can publish or embed content, but case generation is a broader product subsystem.

## Shared Compose UI Components

Recommended location:

```text
apps/android/core/clinical-ui
```

Initial extraction candidates from the current EHR app:

- `KhVitalCard`
- `KhVitalChip`
- `KhStatusPill`
- `KhMetaText`
- `KhStepIndicator`
- `OfflineBanner`
- `AiReviewBanner`
- `AiNotesTimeline`
- chart shell patterns from `ui/clinical`

Extraction requirements:

- Rename `Kh*` only if the names become confusing; otherwise preserve names during migration to reduce churn.
- Replace EHR entity parameters with presentation models.
- Keep content labels and business rules out of shared UI unless they are universal clinical UI semantics.
- Put EHR-specific wrappers in `:ehr:*` modules and Learn-specific wrappers in `:learn:*` modules.

## Shared Design Tokens

Recommended source location:

```text
packages/design-tokens
```

Recommended generated consumers:

```text
apps/android/core/design-system
apps/web/src/styles/generated
```

Token categories:

- brand colors
- semantic colors: critical, warning, success, neutral, AI/citation
- clinical severity colors
- typography scale
- spacing scale
- radii
- elevation/shadow
- icon sizing
- component density

The current Android `Color.kt` and `Theme.kt` should become generated or adapted output, not the long-term canonical token source.

## Content Schemas and Validation Logic

Recommended location:

```text
packages/clinical-schemas
```

Recommended structure:

```text
packages/clinical-schemas/
├── schemas/
│   ├── learning-pack.schema.json
│   ├── case.schema.json
│   ├── simulated-chart.schema.json
│   ├── citation.schema.json
│   └── rubric.schema.json
├── src/
│   ├── index.ts
│   └── validate.ts
├── python/
│   └── karibu_clinical_schemas/
└── tests/
```

Ownership:

- `packages/clinical-schemas` defines structure and validation.
- `packages/content-pipeline` generates content that conforms to those schemas.
- Android Learn reads validated packs and may run client-side validation before import.
- Supabase may validate uploaded pack metadata, but it should not be the only validator.

## Generated Learning Packs

Recommended location:

```text
packages/generated-learning-packs
```

Policy:

- Generated packs contain no PHI and no real patient data.
- Packs are treated as build artifacts plus reviewable content.
- Draft packs can be committed under `drafts/` if useful for review.
- Published packs should be immutable and addressed by semantic version or content hash.
- The Learn Android app should be able to consume packs from local assets during development and from Supabase Storage/CDN in production.

## Supabase Ownership Boundaries

Keep one Supabase package for now, but split its internal ownership so product boundaries are visible.

Recommended structure:

```text
packages/supabase/
├── migrations/
│   ├── ehr/                         # Future migration grouping, if tooling permits
│   ├── corpus/
│   ├── learn/
│   └── shared/
├── functions/
│   ├── ehr/
│   │   ├── dictate/
│   │   ├── submit-dictation/
│   │   ├── approve-dictation/
│   │   └── request-draft-ai-assist/
│   ├── corpus/
│   ├── learn/
│   │   ├── list-learning-packs/
│   │   ├── download-learning-pack/
│   │   └── sync-learning-progress/
│   └── _shared/
├── tests/
│   ├── ehr/
│   ├── corpus/
│   └── learn/
└── scripts/
    ├── corpus/
    ├── ehr/
    └── learn/
```

Logical ownership:

- EHR owns real patients, visits, provider notes, patient notes, vitals, payments, lab/pharmacy workflows, sync queue, and PHI-related RLS/RPCs.
- Corpus owns source document metadata, chunks, embeddings, citations, public library visibility, and retrieval RPCs.
- Learn owns pack catalog metadata, pack storage references, learner progress, attempts, scores, and download entitlements.
- Shared owns Clerk identity mappings, organization/product access, audit primitives, and shared utility functions.

Data-separation rule:

- Learn tables should never reference EHR `patients`, `visits`, `provider_notes`, `patient_notes`, or `sync_queue`.
- EHR tables should never reference generated learning-pack case IDs as clinical facts.
- Shared corpus citations may be referenced by both EHR AI assistance and Learn cases.

## Migration Plan

### Phase 0: Documentation and Naming

- Adopt this architecture as the platform direction.
- Rename docs and README language from "Karibu Health single product" toward "Karibu platform" where appropriate.
- Decide canonical names:
  - Karibu EHR
  - Karibu Learn
  - Karibu platform

### Phase 1: Android Boundary Preparation

- Add Gradle module conventions for app/library modules.
- Create empty `:core:design-system` and `:core:clinical-ui` modules.
- Move product-neutral theme and components behind stable APIs.
- Keep existing `:app` working during extraction.

### Phase 2: EHR App Isolation

- Move current `:app` to `:apps:ehr`.
- Move EHR-specific domain/data/sync code into `:ehr:*` modules.
- Enforce dependency rules with Gradle checks or lint conventions.

### Phase 3: Learn App Skeleton

- Create `:apps:learn` with its own application ID, launcher, Clerk configuration, analytics key, and local storage.
- Depend only on `:core:*` and `:learn:*`.
- Build a simulated chart shell using `:core:clinical-ui`.

### Phase 4: Content Foundation

- Create `packages/clinical-schemas`.
- Create `packages/content-pipeline`.
- Move source PDFs from `Medical Corpus/` to `corpus/source/` with metadata manifests.
- Generate a small validated sample pack.

### Phase 5: Learning Pack Delivery

- Add Learn Supabase tables/functions/storage policies.
- Add offline pack import in `:learn:data-packs`.
- Add pack catalog/download flow in Learn app.

### Phase 6: Scale and Governance

- Add content review workflow.
- Add pack signing/checksums.
- Add CI validation for schemas, generated packs, and Android dependency boundaries.
- Add automated checks for PHI leakage in generated content.

## Risks

- Shared clinical UI could become a backdoor dependency on EHR concepts if presentation models are not enforced.
- A single Supabase project can still blur product boundaries unless migrations, functions, tests, and RLS policies are grouped and reviewed by domain.
- Generated learning packs may grow too large for git; the repo needs a policy for what stays in git versus object storage.
- Schema generation across TypeScript, Python, and Kotlin can become complex. Start with JSON Schema as the interchange layer and add generated adapters only when needed.
- Moving Android modules too early could slow feature work. Extract stable components first, then move the app.
- Keeping root folders with spaces such as `Medical Corpus/` creates tooling friction for CI and scripts.

## Technical Tradeoffs

- Keeping all Android products in one Gradle build improves shared Compose reuse and dependency enforcement, but Gradle configuration time may increase. This is acceptable if modules stay small and build cache is used.
- Keeping one Supabase package avoids operational overhead now, but requires strong folder and naming discipline. A separate Supabase project for Learn can be considered later if product compliance or scaling requires it.
- Storing generated packs in git improves reviewability and reproducibility, but large media should move to storage once pack size grows.
- A shared design-token package adds build complexity, but avoids Android/web/Learn visual drift.
- A separate Python package for content generation adds another toolchain, but it is the correct boundary for a first-class generation pipeline.

