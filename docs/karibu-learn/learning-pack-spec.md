# Karibu Learn `.kpack` Specification

`.kpack` is the planned downloadable offline learning-pack format for Karibu Learn.

## Container

A `.kpack` file is a versioned archive containing:

```text
manifest.json
cases/
assets/
citations/
checksums.json
```

## Manifest

`manifest.json` describes:

- pack ID
- title
- version
- schema version
- jurisdiction
- language
- case index
- asset index
- estimated offline size
- creation timestamp

## Versioning

Pack versions use semantic versioning:

```text
major.minor.patch
```

- Major: incompatible schema or content structure change.
- Minor: added cases or meaningful content revisions.
- Patch: typo, citation, asset, or metadata fixes.

Published versions are immutable.

## Case Files

Each case file must conform to `packages/content-schema/schemas/case.schema.json`.

Case files should contain simulated patient chart data, decision nodes, questions, answers, explanations, and citation references.

## Assets

Assets are optional and live under `assets/`.

Each asset must be referenced by the manifest and included in `checksums.json`.

## Citations

Citations may be embedded in case files or placed under `citations/` when shared across cases.

Every citation should include enough metadata to trace back to an approved corpus source.

## Integrity

`checksums.json` records checksums for all case files and assets. Android import should reject packs with missing or mismatched checksums.

