# WP5 — AI note review: web parity + hardening

**Priority:** P1 · **Platforms:** web (parity), pipeline (hardening) · Tier A-ON
**Spec:** `docs/ai-clinical-assist.md` (read end-to-end first; it is authoritative).
**Locked decision:** **OpenAI is the AI platform** (chat `gpt-4o-mini` + embeddings
`text-embedding-3-small`) — update stale Gemini references in the spec while here. No
provider migration without the eval harness (below) in place first.

---

## Current state (verified audit)

Android and web share one backend: autosave/lab triggers → gate RPCs
(`rpc_request_draft_ai_assist` / `rpc_request_lab_ai_assist`, 049) → Inngest
`review-clinician-note.ts` → OpenAI + `match_medical_corpus` RAG (UCG 2023 corpus) →
`ai_review_suggestions` (max 3 unanswered/visit, phases `draft`|`lab`, citation-
constrained, high-confidence only) → collapsed "AI notes" timeline cards → Dismiss /
Acknowledge / Incorporate via `rpc_record_review_response`. Deterministic
`visit_critical_alerts` (vitals rules) work on BOTH platforms and don't consume slots.
Legacy post-sign path is correctly retired for AI notes (poller now feeds patient
receipt + HMIS coding only).

**Web has the skeleton, Android has the product.** Web gaps:

| # | Gap | Evidence |
|---|-----|----------|
| 1 | **Lab-triggered AI notes never fire on web** — `recordLabTestResult` (`lab/actions.ts` ~L60–91) never requests lab assist; Android does (`LabHomeViewModel` ~L75–85) | trigger missing |
| 2 | **No live refresh** — visit page loads suggestions SSR-once; a card generated 20s after autosave is invisible until manual reload (`visits/[id]/page.tsx` ~L49–56; no polling/realtime on suggestions) | display stale |
| 3 | **Incorporate is half-built** — records `reopened_note` but doesn't open the editor with prefill (comment `review-actions.ts` ~L60–62); Android navigates to dictation prefilled | action incomplete |
| 4 | **No MOH-silent disclaimer** on web expanded cards when `citation_ids` empty (Android: `AiNotesTimeline.kt` ~L126–131) | spec §2.7 |
| 5 | **Silent failure modes** — missing `INNGEST_EVENT_KEY` or empty `medical_corpus` yield zero cards with no signal | ops blind |
| 6 | **Once-per-session trigger** on both platforms (`draftAiQueuedRef` / `draftAiQueuedForVisit`) — later substantive edits never re-trigger | under-delivery |

## Deliverables

### Part A — Web parity (spec §2.8 commitment)

1. **Lab trigger:** in web `recordLabTestResult`, after successful write call
   `rpc_request_lab_ai_assist` + send `note.lab-ai-assist` Inngest event (mirror the
   draft path in `note-actions.ts` `queueDraftAiAssist` ~L154–201). Respect gate result
   (`queued:false` → no event).
2. **Live suggestions:** poll `ai_review_suggestions` for the open visit (~20–30s while
   page visible and visit unsigned), or subscribe via the existing
   `clinic-refresh:{clinicId}` broadcast + targeted refetch. New cards appear without
   reload. Keep it lightweight — do NOT add a full router.refresh loop (see WP6).
3. **Incorporate opens the editor:** scroll/focus the note editor (or open
   `PendingDictationCard` edit mode) with the suggestion's target section prefilled,
   matching Android's `incorporationFor()` behavior.
4. **MOH-silent disclaimer:** expanded card without citations renders "No Uganda
   guideline on file — general clinical suggestion" (spec copy, not error styling).

### Part B — Hardening (MVP → product)

5. **Evaluation harness (the big one):** `packages/ai-evals/` (or
   `apps/web/src/inngest/__evals__/`) with ~30 golden synthetic HC III notes + expected
   suggestion classes (malaria RDT-before-ACT, pneumonia fast-breathing thresholds,
   danger-sign escalation, no-suggestion-expected controls). Runs the real pipeline
   (retrieval + prompt + model) against a seeded corpus; asserts question type + citation
   presence, NOT exact wording. CI job (can be nightly/manual to control cost). Any
   prompt/model change must pass evals before merge.
6. **Response analytics:** SQL view + admin page — dismissal/acknowledge/incorporate
   rates by `suggestion_type` and phase. High dismissal = over-firing (violates the
   under-fire philosophy, spec §2.1) → prompt tuning input.
7. **Silence alerting:** daily per-clinic count of suggestions generated (Inngest cron
   or SQL); zero on a working day with signed visits = pipeline down → surface on the
   observability dashboard (see `docs/ehr-pivot-observability.md`) and log loudly when
   Inngest keys are missing (upgrade the existing console warning to an error metric).
8. **Corpus versioning:** stamp each suggestion with the corpus/document edition it
   cited (add `corpus_version` or resolve via `medical_documents` metadata). When UCG
   2024 lands, re-embed and retain the historical audit trail of which edition backed
   which prompt.
9. **Re-arm trigger on substantive change:** reset the once-per-session guard when
   medications or diagnosis sections change materially after the first pass (both
   platforms), still respecting the 3-cap and gate RPC.

### Cleanup (fold in)

10. Delete the stale "Inngest poller ~60s" comment in `VisitDetailClient.tsx`
    (~L251–254 / L460); remove the redundant `draft-ai-assist.ts` re-export or register
    it properly; decide fate of the withdrawn `cme_*` tables seeded in 049 (spec §3 says
    withdrawn — write the drop migration or document retention).

## Acceptance

- Web clinician: types a note → AI note card appears on the open page without reload →
  lab tech results an abnormal test → a `lab`-phase card appears on the still-open
  unsigned visit → Incorporate lands the clinician in the editor at the right section.
- Expanded card without citations shows the MOH-silent line on both platforms.
- Eval suite green in CI; a deliberately broken prompt fails it.
- Admin can see per-type dismissal rates; ops can see a clinic whose generation went to
  zero.
