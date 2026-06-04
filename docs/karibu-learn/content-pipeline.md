# Karibu Learn Content Pipeline

The content pipeline is a first-class subsystem under `pipelines/case-generation`.

## Intended Stages

1. Ingest approved source corpus material.
2. Generate draft simulated cases.
3. Validate draft cases against `packages/content-schema`.
4. Prepare cases for clinical and educational review.
5. Export reviewed cases into `.kpack` learning packs.
6. Publish immutable packs to `content/learn/published` and, later, storage-backed distribution.

## Safety Rules

- Do not use real patient data.
- Preserve source provenance and citations.
- Validate every generated case before review.
- Validate every reviewed pack before publication.
- Keep generated drafts separate from reviewed and published content.

