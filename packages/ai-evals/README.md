# @karibu/ai-evals

Evaluation harness for the clinician-note AI review pipeline (WP5 Part B). Runs synthetic HC III golden cases through the same prompt and validation logic as `review-clinician-note.ts`, using **mocked corpus chunks** so CI does not need Supabase or a live medical corpus.

## Usage

From the repo root:

```bash
OPENAI_API_KEY=sk-... pnpm --filter @karibu/ai-evals eval
```

Or via the root shortcut:

```bash
OPENAI_API_KEY=sk-... pnpm ai:eval
```

Run a single case:

```bash
OPENAI_API_KEY=sk-... pnpm --filter @karibu/ai-evals eval -- --case malaria-act-without-rdt
```

If `OPENAI_API_KEY` is unset, the harness prints a skip message and exits **0** (safe for CI without secrets).

## What it checks

- ~18 synthetic golden cases covering malaria (RDT-before-ACT), pneumonia (fast breathing / danger signs), dehydration escalation, and no-suggestion controls (simple URI, well-child visit).
- Asserts **suggestion type** matches expected classes — not exact wording.
- Validates citations against mock chunk ids 1–5 (same rules as production: hallucinated citations are dropped).
- Uses **gpt-4o-mini** by default (`OPENAI_STRUCTURING_MODEL` overrides).

## Layout

| File | Purpose |
|------|---------|
| `src/golden-cases.ts` | Fixture notes + expected outcomes |
| `src/validate-suggestion.ts` | Shared validation (types, citations, dedupe) |
| `src/mock-corpus.ts` | Static guideline chunks ids 1–5 |
| `src/evaluate-case.ts` | Single-case OpenAI call + assertions |
| `src/run-eval.ts` | CLI entrypoint |

Exit **1** on any failure; **0** on pass or skip (no API key).
