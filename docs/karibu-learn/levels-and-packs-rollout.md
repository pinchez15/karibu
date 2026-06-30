# Karibu Learn — Levels 1–3 and 300-case rollout

Status: tester rollout plan (June 2026).

## Level definitions

Each **canonical case** (100 planned for HC III core curriculum) ships as **three playable variants**:

| Level | What the learner sees | What they must do |
|-------|----------------------|-------------------|
| **1 — Core practice** | Vitals, history, and exam are given | Recognition and next-step decisions |
| **2 — Guided reasoning** | Vitals visible; one management-changing history item hidden | Ask for the missing history + document the next step |
| **3 — Challenge** | Chief complaint only | Enter/request vitals, focused history, and referral decision (full EHR-like tasks) |

Authoritative product copy: [`case-content-strategy.md`](case-content-strategy.md) (lines 146–162) and [`curriculum.md`](curriculum.md) (lines 207–219).

Corpus today: `content/learn/generated/hc3-core-draft-v0.1.0/` — **100 canonical cases × 3 levels = 300 variants** (draft; specificity/clinical review still in progress).

## Export per level

From repo root, after Python env for `pipelines/case-generation`:

```bash
# Level 1 pack (default)
uv run karibu-casegen export-app-kpack \
  --input content/learn/generated/hc3-core-draft-v0.1.0 \
  --output content/learn/published/hc3-core-l1.kpack \
  --pack-id hc3-core-l1 \
  --title "HC III Core — Level 1" \
  --level 1

# Level 2
uv run karibu-casegen export-app-kpack ... --level 2 --pack-id hc3-core-l2 --output content/learn/published/hc3-core-l2.kpack

# Level 3
uv run karibu-casegen export-app-kpack ... --level 3 --pack-id hc3-core-l3 --output content/learn/published/hc3-core-l3.kpack
```

Use `--limit N` while smoke-testing. Use `--stubs-only` for catalog entries without walkable steps.

## App download strategy

**Now:** `core-opd.kpack` is bundled (3 walkable cases). **39 downloadable packs** (13 chapters × levels 1–3, 300 case slots) are exported to `content/learn/published/chapters/` and listed in `apps/learn-android/.../manifest.json` with Supabase Storage URLs.

### Publish to Storage

1. Run `migrations/003_learn_storage_buckets.sql` in KaribuLearn Supabase.
2. `pnpm learn:export-packs` → `pnpm learn:sync-manifest` → `pnpm learn:upload-packs` (see `packages/learn-supabase/README.md`).

Object path: `learn-packs/v1/{chapter-id}-l{level}.kpack`

## EHR-first decisions

Decision steps can set `"ehr_order": "Malaria RDT"` on the question. Ordering that test in the chart auto-answers the step — no duplicate radio tap. Pipeline should emit `ehr_order` / future `ehr_select` fields for investigation and HMIS steps.

## Community corrections (tester queue)

Instead of pre-reviewing all 300 cases before launch:

1. Nurse finishes case → **Corrections** box on complete screen.
2. Submission → `case_corrections` table via `rpc_submit_case_correction` (migration `002_case_corrections.sql`).
3. Clinician triage in Supabase (`status`: pending → accepted / rejected / duplicate).
4. Accepted fixes update canonical case JSON → re-export packs.

Run migration `002` in KaribuLearn Supabase before testing corrections in the app.

## Recommended tester phases

1. **v0.1.x** — Bundled malaria + 2 stubs; corrections + EHR-order flow; sign-in + CME sync.
2. **v0.2** — Download Level 1 chapter 1 (Fever/IMNCI) ~8 cases; corrections queue reviewed weekly.
3. **v0.3** — Level 2 + 3 for same chapter; expand chapter by chapter.
4. **v1.0** — Full 300 after specificity pass + spot clinician review driven by correction volume.
