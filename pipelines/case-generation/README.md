# Karibu Learn Case Generation Pipeline

This is the standalone Python subsystem for Karibu Learn educational content generation.

The pipeline starts from authoritative source material, builds complete canonical cases as the clinical source of truth, and then transforms those cases into playable levels or quests for the app.

## Intended Workflow

1. `ingest`: read approved medical corpus sources and metadata.
2. `generate`: produce draft simulated patient cases from approved source material.
3. `review`: prepare cases for clinical, educational, and safety review.
4. `export`: package reviewed content into downloadable `.kpack` learning packs.
5. `tests`: validate pipeline behavior, schema compatibility, and pack integrity.

## Core Data Flow

```text
source registry
→ clinical anchors
→ canonical case
→ playable variants / quests
→ automated validation
→ human review
→ .kpack export
```

## Canonical Case vs Playable Variant

A canonical case is the complete simulated clinical encounter and answer key. It contains all vitals, history, exam findings, management, referral thresholds, teaching points, and guideline citations.

A playable variant is the game layer. It controls what the learner sees first, what they must ask for, what they must enter into EHR-like forms, and how the case is scored. One canonical case can produce multiple variants across levels.

## Commands

Validate the source registry and local source checksums:

```sh
PYTHONPATH=pipelines/case-generation/src \
  python -m karibu_case_generation.cli validate-registry
```

Generate a draft pack of 100 canonical cases plus 300 playable variants:

```sh
PYTHONPATH=pipelines/case-generation/src \
  python -m karibu_case_generation.cli generate-drafts \
  --count 100 \
  --output content/learn/generated/hc3-core-draft-v0.1.0
```

Generated output is draft-only. It must not be moved to `reviewed` or `published` until clinical review approves correctness, HC III realism, and citations.

## Boundary Rules

- Generated cases must be simulated and must not contain real patient data.
- The pipeline reads from `content/medical-corpus` and content source folders.
- The pipeline validates against `packages/content-schema`.
- The pipeline exports to `content/learn/generated`, `content/learn/reviewed`, and `content/learn/published` as content moves through review.
