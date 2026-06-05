# AI clinical assist — product spec (locked)

**Status:** Authoritative for AI notes, Learn (CME), and Consult.  
**Supersedes:** Post-sign AI review as a clinician-facing surface (see §2).  
**Related:** `docs/ehr-pivot-implementation.md` §6.4, `ai_review_suggestions`, evidence library (`/library`).

---

## 1. Three surfaces, one app

| Surface | User label | AI? | Patient chart? |
|---------|------------|-----|----------------|
| In-visit prompts | **AI notes** | Yes (RAG + rules; Uganda MOH corpus when available) | Yes — active unsigned visit only |
| Continuing education | **Learn** | **No** | No |
| Second opinion | **Consult** | Yes (frontier model, redacted bundle only) | Entry from chart; thread is de-identified in UI |

Clinical roles (CO, doctor, nurse, midwife, nursing assistant, admin) see **Patients**, **Learn**, and **Consult** in primary navigation. Non-clinical roles (records, lab, pharmacy) do not see Consult or Learn unless explicitly granted later.

---

## 2. AI notes (chart assist)

### 2.1 Philosophy

- **Under-fire, not over-fire.** Assume the clinician is usually correct; the common gap is **documentation timing** (“you may want to capture X before you move on”), not “you missed the diagnosis.”
- **While the patient is still in the building.** Prompts run during open documentation and when new labs arrive — **not** after the note is signed. Post-sign AI review is **deprecated** for clinician UX (legacy `post_sign` rows may exist; do not enqueue new ones).

### 2.2 When AI notes are generated

| Trigger | Condition | Phase (`ai_review_suggestions.phase`) |
|---------|-----------|----------------------------------------|
| **Mid-note** | Unsigned visit; debounced autosave / draft assist RPC | `draft` |
| **After labs** | New lab result synced to visit while visit still unsigned | `lab` |
| **Never** | `documentation_complete` / note signed | — |

Lab-triggered notes use the **same** collapsed timeline UI and count toward the same per-visit cap.

### 2.3 Hard cap and lifecycle

- **Maximum 3** active AI notes per visit (unanswered, `clinician_response IS NULL`).
- If a fourth would be generated, **drop the lowest-priority candidate** (never bump interruptive; see §2.5).
- **After sign:** hide all AI notes for that visit; do not enqueue new generation; do not resurface dismissed items.

### 2.4 Placement and presentation

- **Default:** collapsed row(s) in the **visit timeline header** (not a modal, not a bottom sheet over the keyboard).
- **Collapsed (only default state):** the **question** line only + expand affordance. Label in UI: **AI note** (never “Attending notes”).
- **Expanded:** short rationale (2–3 sentences), link(s) to Karibu library / MOH chunks when `citation_ids` present, explicit line when **MOH silent** (“No Uganda guideline on file — general clinical suggestion”), then actions.

### 2.5 Interruptive header (critical data only)

Rare exception to “quiet timeline”:

- **Deterministic rules v1** (code + `workflow_config.critical_alert_rules` JSON when added). Examples: infant fever above threshold, incompatible vitals + age band.
- **UI:** full-width **interruptive** banner at top of timeline (not the same chip as AI notes). Copy pattern: confirm data entry (“Was this temperature entered correctly?”) → if confirmed, consider documented pathway (e.g. meningitis workup) with MOH link.
- **Does not consume** one of the 3 AI-note slots (separate `display_tier = interruptive` or dedicated `visit_critical_alerts` table in implementation).
- v1 rules are **maintained in repo**; superadmin rule editor is a follow-up.

### 2.6 Clinician actions

| Action | Meaning | Maps to `clinician_response` |
|--------|---------|--------------------------------|
| **Dismiss** | Not relevant for this visit | `dismissed` |
| **Acknowledge** | Considered; no chart change | `considered_proceeded` |
| **Incorporate** | Only when `suggestion_type` supports it (`ask_lab`, `ask_med`, `ask_dx`, `ask_history`, `ask_red_flag`) — opens picker or note section | `reopened_note` (or future `incorporated` if split for analytics) |

Swipe-to-act may remain on Android where it already exists; web uses explicit buttons.

### 2.7 Content and citations

- Medical questions only; **Uganda HC III** context in system prompts (limited diagnostics, formulary/stock, syndromic care).
- When corpus chunks exist: require `citation_ids ⊆ retrieved chunks` (existing hallucination guard).
- When MOH is silent: allow constrained general suggestion with **visible disclaimer** in expanded view (not styled as a warning/error).

### 2.8 Platform parity

- **Android:** v1 target (visit timeline + dictation flow).
- **Web:** same AI notes on clinician visit chart / dictation within **one release** after Android v1 (shared `ai_review_suggestions` + draft/lab triggers).

### 2.9 Implementation notes (existing schema)

- Retire clinician-facing **post_sign** enqueue in Inngest / `note.dictated` → review queue for new visits.
- Add phase value **`lab`** to `ai_review_suggestions.phase` check constraint (migration).
- Add **`display_tier`** `timeline` | `interruptive` (column or parallel alert table).
- Deprecate visit queue keyed on `documentation_complete` + `ai_review_status` for **new** AI note generation (keep status fields for migration/metrics until removed).

---

## 3. Learn (CME) — no AI

### 3.1 Purpose

Optional continuing education: refresh knowledge before or after hard cases (e.g. malaria treatment module). **No LLM** — all content is editorial, stored in Supabase, fetched when online.

### 3.2 Content model (v1)

- **Modules** by topic (IMCI, malaria, ANC, pharmacy, lab limitations, etc.).
- **Lessons** per module: markdown/HTML body, links to library slugs.
- **Optional quizzes:** multiple-choice per module; scores stored for the clinician only (no leaderboard v1).
- **Offline:** not required v1; show clear “connect to load modules” when offline.

### 3.3 UX

- **Learn** tab: module list → lesson reader → optional quiz.
- No connection to patient id or visit id.
- Flashcards v1 = structured Q/A pairs in Supabase rendered as flip cards (still no AI generation).

### 3.4 Schema (to implement)

`cme_modules`, `cme_lessons`, `cme_flashcards`, `cme_quiz_questions`, `cme_quiz_attempts` — clinic-agnostic content; attempts keyed by `staff_id`.

---

## 4. Consult (second opinion)

### 4.1 Purpose

Difficult cases: conversational review with a **frontier** cloud model. Full clinical picture **without identifiers** in the model prompt.

### 4.2 Entry flow

1. Top of patient record / visit chart: **Send to consult**.
2. Second step (required): **Confirm consult request** — prevents accidental send.
3. Server builds **redacted clinical bundle** from visit data (age band, sex, symptoms, vitals, labs, meds, progression, stock/capability flags). **Strip** name, phone, national ID, address, exact DOB (use age band), photos, and any other direct identifiers.
4. If **offline** (`NET_CAPABILITY_VALIDATED` false on Android; equivalent on web): **block** with message; do not queue.

### 4.3 Threading

- **One thread per `visit_id`.** First confirm creates the thread; further messages on the same unsigned visit append. **New visit → new thread.** Signed visit: consult read-only or hidden (v1: allow read-only thread if consult was opened before sign; no new messages after sign).

### 4.4 Privacy and storage

| Stored server-side | Sent to frontier model |
|--------------------|-------------------------|
| `visit_id`, `clinic_id`, `staff_id`, timestamps | Redacted bundle JSON only |
| `patient_id` allowed for **audit** (RLS clinic-scoped); never in prompt | No images (feature disabled v1) |
| Full redacted bundle in `consult_threads.redacted_snapshot` | No raw transcript with names |

Consult UI shows **“Case”** + short local label (e.g. “Visit today”) — never patient name in the consult header.

### 4.5 Roles and limits

- Available to same clinical roles as AI notes.
- Disclaimer on first use per device: not a substitute for supervisor, referral, or emergency escalation.

### 4.6 Schema (to implement)

`consult_threads` (`visit_id`, `clinic_id`, `created_by`, `redacted_snapshot`, `status`), `consult_messages` (`role`, `content`, `created_at`). Edge function: `consult-chat` with server-side redaction + rate limits.

---

## 5. Navigation (locked)

**Android (clinical home):** bottom navigation

- **Patients** — OPD list, chart, dictation, AI notes on timeline.
- **Learn** — CME modules (online).
- **Consult** — list of open threads + entry from chart.

**Web:** same three destinations in clinician app shell (sidebar or top nav).

---

## 6. Connectivity

| Surface | Offline behavior |
|---------|------------------|
| AI notes | Draft/lab generation **skipped** when offline or “poor” for AI (existing `isGoodForAi` pattern on Android); no user-facing error spam. |
| Learn | Block with “Connect to load courses.” |
| Consult | Hard block. |

---

## 7. Naming and copy (locked)

- UI: **AI note** / **AI notes** — not “Attending,” not “AI suggestion banner.”
- **Learn** — not “CME” in primary nav (subtitle OK: “Clinical learning”).
- **Consult** — subtitle OK: “Second opinion.”

---

## 8. Decision log (final answers)

| Question | Decision |
|----------|----------|
| Thread scope | One thread per **`visit_id`** |
| Consult audit | Store **`visit_id`** + optional **`patient_id`** server-side; only **redacted** payload to model |
| Lab-triggered notes | Yes; same UI; counts toward **3** cap |
| Critical alerts | **Deterministic rules** v1 in code/config; not model-detected |
| Nav | **Patients \| Learn \| Consult** for clinical roles |
| Web parity | Same AI notes on web within one release after Android v1 |
| Incorporate | **Keep** for actionable `suggestion_type`s only |
| Post-sign AI | **Off** for new clinician-facing behavior |
| CME AI | **None** |
| Consult images | **Not allowed** v1 |
| Consult offline | **Blocked** |

---

## 9. Migration from current build

1. Stop enqueueing **post_sign** suggestions on `note.dictated` / documentation-complete queue.
2. Wire **lab result sync** → `phase = lab` assist (respect cap).
3. Replace expanded-by-default cards with **collapsed timeline** AI notes + interruptive tier.
4. Rename strings to **AI notes**.
5. Add Learn + Consult surfaces and tables per §3.4 and §4.6.
