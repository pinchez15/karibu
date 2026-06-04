# Monorepo Recommendation

Status: proposed repository organization plan for evolving Karibu from a single-product EHR codebase into a platform monorepo that supports Karibu EHR, Karibu Learn, shared clinical UI, shared content schemas, and future products.

## Recommendation Summary

Keep one monorepo. Do not create a separate Karibu Learn repository.

Recommended high-level layout:

```text
karibu_health/
├── apps/                         # Deployable applications
├── packages/                     # Shared packages and platform subsystems
├── corpus/                       # Source medical corpus
├── design/                       # Source design files and design-system references
├── docs/                         # Architecture, product, compliance docs
└── scripts/                      # Repo-level scripts only
```

Recommended immediate product layout:

```text
apps/
├── android/
│   ├── apps/
│   │   ├── ehr/
│   │   └── learn/
│   ├── core/
│   ├── ehr/
│   └── learn/
└── web/
```

Recommended shared package layout:

```text
packages/
├── clinical-schemas/
├── content-pipeline/
├── design-tokens/
├── generated-learning-packs/
├── medical-corpus/
├── shared/
└── supabase/
```

## Current-State Assessment

The repository already has useful monorepo foundations:

- Root `package.json` and `pnpm-workspace.yaml`.
- `apps/web` as a separate Next.js app.
- `apps/android` as a separate Android Gradle project.
- `packages/shared` for shared TypeScript.
- `packages/supabase` for database migrations, edge functions, tests, and Supabase scripts.
- Existing architecture docs under `docs`.

The main problem is not that the repo is disorganized; it is that the current boundaries reflect one product.

Current pressure points:

- Android has one `:app` module, so EHR UI, EHR data access, EHR sync, auth, design tokens, and reusable Compose components live together.
- The current package name `com.karibuhealth.app` and theme name `KaribuHealthTheme` are product-specific, even for code that should become platform-level.
- Web and Android duplicate design language rather than consume a shared token source.
- The current `packages/shared` package is TypeScript-only and EHR database-oriented.
- The source medical corpus is at the repo root as `Medical Corpus/`, while Supabase has corpus embedding scripts. That makes the corpus feel like an implementation detail instead of platform source material.
- `KaribuLearn/` exists as an untracked staging area. It should not become the application root.

## Recommended Folder Structure

Target:

```text
karibu_health/
├── apps/
│   ├── android/
│   │   ├── apps/
│   │   │   ├── ehr/
│   │   │   │   ├── build.gradle.kts
│   │   │   │   └── src/main/java/com/karibuhealth/ehr/
│   │   │   └── learn/
│   │   │       ├── build.gradle.kts
│   │   │       └── src/main/java/com/karibuhealth/learn/
│   │   ├── core/
│   │   │   ├── design-system/
│   │   │   ├── clinical-ui/
│   │   │   ├── auth-clerk/
│   │   │   ├── network/
│   │   │   └── observability/
│   │   ├── ehr/
│   │   │   ├── domain/
│   │   │   ├── data-room/
│   │   │   ├── data-supabase/
│   │   │   └── sync/
│   │   ├── learn/
│   │   │   ├── domain/
│   │   │   ├── case-engine/
│   │   │   ├── data-packs/
│   │   │   └── data-supabase/
│   │   ├── build-logic/
│   │   ├── gradle/
│   │   └── settings.gradle.kts
│   ├── web/
│   └── learn-admin/
├── packages/
│   ├── clinical-schemas/
│   ├── content-pipeline/
│   ├── design-tokens/
│   ├── generated-learning-packs/
│   ├── medical-corpus/
│   ├── shared/
│   └── supabase/
├── corpus/
│   └── source/
├── design/
│   ├── brand/
│   ├── ehr/
│   └── learn/
└── docs/
```

Near-term pragmatic layout:

- Keep current `apps/android/app` until shared extraction is underway.
- Add new modules beside it instead of moving everything at once.
- Move root `KaribuLearn/karibu_design_files` into `design/learn` or delete it after confirming it duplicates `karibu_design_files`.
- Move `Medical Corpus/` to `corpus/source/` after updating scripts that reference it.

## Recommended Package Boundaries

Use package names to encode ownership.

TypeScript/package workspace:

- `@karibu/shared`: shared TypeScript utilities and legacy shared EHR/web types.
- `@karibu/design-tokens`: canonical cross-platform design tokens.
- `@karibu/clinical-schemas`: learning pack and simulated chart schemas.
- `@karibu/supabase`: Supabase migrations, functions, tests, and deployment scripts.

Python:

- `karibu-content-pipeline`: Python package in `packages/content-pipeline`.
- It should not be hidden under Supabase scripts because content generation is product logic, not only infrastructure glue.

Android/Kotlin:

- `com.karibuhealth.core.design`
- `com.karibuhealth.core.clinicalui`
- `com.karibuhealth.core.auth`
- `com.karibuhealth.ehr.*`
- `com.karibuhealth.learn.*`

Boundary rules:

- EHR code can depend on core packages.
- Learn code can depend on core packages.
- Core packages cannot depend on EHR or Learn packages.
- Learn code cannot import EHR Room entities, EHR Supabase DTOs, or EHR repositories.
- Shared schemas can describe simulated charts and clinical concepts, but not production patient rows.

## Recommended Android Module Strategy

Final Gradle modules:

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

Recommended order:

1. Create `:core:design-system` and move/adapt theme code.
2. Create `:core:clinical-ui` and extract the safest visual-only components.
3. Create `:learn:domain`, `:learn:case-engine`, and `:learn:data-packs`.
4. Create `:apps:learn`.
5. Move current `:app` to `:apps:ehr` once the first shared modules are stable.
6. Extract EHR data/domain/sync modules only after app migration is stable.

Do not start by splitting every EHR package into modules. The first useful extraction is shared design and shared clinical presentation UI.

## Recommended Location for Karibu Learn

Use:

```text
apps/android/apps/learn
```

Not:

```text
KaribuLearn/
apps/web/src/app/dashboard/learn
apps/android/app/src/main/java/com/karibuhealth/app/ui/learn
```

Reasoning:

- Karibu Learn is a standalone Android app, not an EHR screen.
- It should have its own application ID, auth configuration, navigation root, local storage, analytics, release pipeline, and permissions.
- It should share UI through modules, not by living inside the EHR app.

Recommended app identity:

- Package/application ID: `com.karibuhealth.learn`
- Display name: `Karibu Learn`
- EHR package remains separate, for example `com.karibuhealth.ehr` in a future rename. The current `com.karibuhealth.app` can remain temporarily for release continuity.

## Recommended Location for the Python Case-Generation Pipeline

Use:

```text
packages/content-pipeline
```

This package should own:

- corpus ingestion helpers
- prompt templates
- case generation
- simulated patient chart generation
- validators
- pack builders
- review reports
- provenance/citation output
- PHI leakage checks

It should read:

```text
corpus/source
packages/medical-corpus
packages/clinical-schemas
```

It should write:

```text
packages/generated-learning-packs
```

## Recommended Location for Shared Compose UI Components

Use:

```text
apps/android/core/clinical-ui
```

Shared Compose components should be extracted into product-neutral APIs.

Good shared candidates:

- chart shell
- patient summary/header display
- vitals display
- clinical timeline
- note preview
- problem list display
- medication/lab/order summary rows
- status/severity/citation banners
- empty/loading/error states

Poor shared candidates:

- EHR navigation destinations
- EHR repositories or ViewModels
- Room entities
- Supabase DTOs
- payment, print, or PHI-specific workflow components
- Learn scoring or case-attempt business logic

## Recommended Location for Shared Design Tokens

Use:

```text
packages/design-tokens
```

This package should be the source of truth for:

- colors
- typography
- spacing
- density
- radii
- elevation
- semantic clinical statuses
- AI/citation styling

Generated/adapted outputs:

```text
apps/android/core/design-system/src/main/java/com/karibuhealth/core/design/
apps/web/src/styles/generated/
```

Avoid keeping separate manually maintained token definitions in Android and web over the long term.

## Recommended Location for Content Schemas and Validation Logic

Use:

```text
packages/clinical-schemas
```

This should include:

- JSON Schemas for learning packs, cases, simulated charts, evidence citations, and rubrics.
- TypeScript validators for web/admin tooling.
- Python validation bindings for `packages/content-pipeline`.
- Optional Kotlin generated models later, once the schema stabilizes.

Keep this separate from:

- `packages/shared`, which currently contains TypeScript/EHR-facing types.
- `packages/supabase`, which should enforce storage and access policy but should not be the canonical schema authoring package.

## Recommended Location for Generated Learning Packs

Use:

```text
packages/generated-learning-packs
```

Suggested structure:

```text
packages/generated-learning-packs/
├── index.json
├── drafts/
├── published/
│   ├── uganda-hc3-malaria-v1/
│   │   ├── pack.json
│   │   ├── cases/
│   │   ├── media/
│   │   └── checksums.json
│   └── uganda-imnci-fever-v1/
└── fixtures/
```

Guidelines:

- `fixtures/` should stay small and be used for automated tests.
- `drafts/` can contain review artifacts.
- `published/` packs should be immutable.
- Large media can later be moved to Supabase Storage or another object store, referenced by manifest and checksums.

## Recommended Supabase Ownership Boundaries

Keep `packages/supabase` as the deployable Supabase package, but split code by domain.

Ownership map:

| Domain | Owns | Must not own |
| --- | --- | --- |
| `ehr` | patients, visits, provider notes, patient notes, vitals, lab/pharmacy/payment, sync queue, PHI RLS/RPCs | learning cases or simulated patient records |
| `corpus` | medical documents, chunks, embeddings, public library, citation retrieval | EHR patient workflows or learner progress |
| `learn` | pack catalog, downloads, learner progress, attempts, scores, content entitlements | EHR patients, visits, provider notes, sync queue |
| `shared` | Clerk identity mapping, product access, audit utilities, common auth helpers | product-specific business tables |

Suggested future folder grouping:

```text
packages/supabase/
├── migrations/
├── functions/
│   ├── ehr/
│   ├── corpus/
│   ├── learn/
│   └── _shared/
├── tests/
│   ├── ehr/
│   ├── corpus/
│   └── learn/
└── scripts/
    ├── ehr/
    ├── corpus/
    └── learn/
```

Supabase table guidance for Learn:

- `learning_packs`
- `learning_pack_versions`
- `learning_pack_assets`
- `learner_profiles`
- `learner_pack_downloads`
- `case_attempts`
- `case_attempt_events`
- `case_scores`

These tables should reference Clerk users and pack IDs, not EHR patient IDs.

## Migration Plan

### Step 1: Document and Freeze Boundaries

- Add architecture docs.
- Mark `apps/android/app/src/main/java/com/karibuhealth/app/ui/learn` as temporary or remove it during later implementation.
- Decide that root `KaribuLearn/` is not an app root.

### Step 2: Create Shared Android Foundations

- Create `:core:design-system`.
- Create `:core:clinical-ui`.
- Extract visual-only components first.
- Keep the EHR app compiling after each extraction.

### Step 3: Create Learn Foundation

- Add `:learn:domain`.
- Add `:learn:case-engine`.
- Add `:learn:data-packs`.
- Add `:apps:learn`.
- Use local fixture packs before adding Supabase download/sync.

### Step 4: Establish Content Toolchain

- Add `packages/clinical-schemas`.
- Add `packages/content-pipeline`.
- Add a tiny generated fixture pack.
- Add CI validation for schema and pack integrity.

### Step 5: Reorganize Corpus

- Move `Medical Corpus/` to `corpus/source/`.
- Add source metadata in `packages/medical-corpus`.
- Update Supabase corpus embedding scripts to read the new location.

### Step 6: Split Supabase Domains

- Group functions/tests/scripts by domain.
- Add Learn tables and RLS only after the app has a clear pack/progress model.
- Keep EHR PHI tables isolated from Learn data.

### Step 7: Rename and Polish Platform Language

- Update README and docs to describe the Karibu platform.
- Rename Android theme APIs from product-specific names to platform-level names only after module extraction is stable.
- Avoid package/application ID churn until release risk is understood.

## Risks

- Android module churn can destabilize the EHR app if done before shared UI boundaries are clear.
- Learn could accidentally inherit PHI concepts if it reuses EHR data models instead of presentation models and content schemas.
- The content pipeline could become unreproducible if generated packs are not versioned with manifests, checksums, prompts, and source provenance.
- Supabase migrations are currently sequential flat files; domain grouping may require naming conventions rather than physical subfolders depending on CLI constraints.
- Cross-platform design tokens can become too abstract. Keep them concrete and generated into each platform.

## Technical Tradeoffs

- A single monorepo gives the best reuse and governance, but requires stricter boundaries than separate repositories.
- A single Android Gradle build allows shared Compose modules, but needs dependency rules to prevent product coupling.
- A separate `packages/content-pipeline` package adds Python tooling to a TypeScript/Kotlin repo, but it correctly treats educational content generation as a first-class subsystem.
- JSON Schema is less ergonomic than pure Zod or Pydantic, but it is the safest interchange format across TypeScript, Python, Kotlin, and pack validation.
- Keeping Learn in the same Supabase project is operationally simpler at first, but strong RLS and domain ownership are mandatory. A separate project remains an option if product risk or compliance needs change.

