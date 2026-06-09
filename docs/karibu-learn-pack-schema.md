# KaribuLearn case-pack schema

Karibu Learn is the free CME **standalone app** (`apps/learn-android`): a coral
learning shell around a faithful cobalt Karibu EHR **simulation**. Clinicians
work pre-written cases — **all patient data is generated, never real PHI**.

Karibu Learn and Karibu EHR are separate applications (different auth and user
databases; neither reachable from the other). They share this monorepo so Learn
can mirror EHR chart UX. See **`docs/karibu-learn/product-boundary.md`**.

This document is the contract the **case-authoring pipeline** writes to. The
Learn Android app renders whatever the pipeline emits in this shape; no app
change is needed to add cases — only valid JSON. Pack assets ship under
`apps/learn-android` (target); transitional copies may exist under
`apps/android/app/src/main/assets/learn/` until the port completes.

For the wider product direction (canonical→variant model, source types, scoring
gates, sharing, CPD readiness) see **`docs/karibu-learn/case-content-strategy.md`**;
this file is the concrete on-device schema that strategy serialises to.

## Packs are the unit of download

Ugandan clinicians are data-conscious, so cases ship in small **packs** (a few
MB each) rather than one large app. The core pack is bundled in the APK; the
rest are pulled on demand and cached on device.

Published packs are immutable **`.kpack`** files (JSON content; the extension
marks a reviewed, versioned learning pack — see the strategy doc's publish
stage).

```
apps/android/app/src/main/assets/learn/
  manifest.json            # lists every pack (bundled + downloadable)
  packs/core-opd.kpack     # a bundled pack (ships in the APK)
  remote/<id>.kpack        # demo bodies for "downloadable" packs
```

### `manifest.json`

```jsonc
{
  "packs": [
    {
      "id": "core-opd",              // stable pack id
      "title": "Everyday OPD",
      "subtitle": "One-line description shown on the pack card.",
      "topic": "General OPD",
      "case_count": 3,
      "approx_size_kb": 90,          // shown as the download size
      "bundled": true,               // true → ships in APK at asset_path
      "asset_path": "learn/packs/core-opd.json",
      "version": 1
    },
    {
      "id": "ncd-essentials",
      "bundled": false,              // false → downloaded from download_url
      "download_url": "https://cdn.example/ncd-essentials.json",
      "case_count": 2,
      "approx_size_kb": 1850,
      "version": 1
      // ...title/subtitle/topic as above
    }
  ]
}
```

`download_url` is normally an `https` URL the pipeline publishes to (CDN /
Supabase Storage). The custom scheme `bundled-remote://<asset-path>` is a
**dev-only** convenience that copies from a packaged asset so the download flow
is demonstrable offline — production packs use real URLs.

## A pack file

```jsonc
{ "id": "core-opd", "title": "Everyday OPD", "cases": [ /* LearnCase[] */ ] }
```

## `LearnCase`

```jsonc
{
  "id": "fever-headache",
  "ready": true,                     // false → a catalog stub ("COMING SOON")
  "title": "Fever and headache, 3 days",
  "topic": "Febrile illness",
  "difficulty": "Core",              // Core | Intermediate | Advanced
  "mins": 12,
  "credit": 0.25,                    // CME credit
  "setting": "Susunga HC III · OPD",
  "patient": { "name": "Nakato Sarah", "id": "PT-100015", "age": "34F", "sex": "Female" },
  "blurb": "Shown on the case-landing screen.",
  "objectives": ["…"],               // 3–4 learning objectives
  "skills": ["Malaria", "HMIS coding"],
  "takeaways": ["…"],                // shown on the completion screen
  "citations": ["Uganda Clinical Guidelines 2023"],
  "dose_calc": { /* DoseCalcSpec, optional */ },
  "steps": [ /* CaseStep[] — required when ready=true */ ],

  // ── content-strategy fields (all optional) ──
  "source_type": "Guideline Practice",   // | "Challenge" | "Case Conference" | "From the Literature"
  "mode": "Core Practice",               // | "Challenge Cases" | "Case Conference"
  "level": 1,                            // playable difficulty 1–5 (canonical→variant model)
  "share": { /* ShareMeta */ },
  "meta": { /* CaseMeta — provenance, review, scores */ }
}
```

A `LearnCase` is a **playable variant** of a canonical case. `source_type`/
`mode` are framing labels (no "real vs generated" hierarchy); `level` is the
variant's difficulty (how much is given vs requested/entered).

### `ShareMeta` — WhatsApp-style sharing

```jsonc
{
  "share_title": "Fever and headache, 3 days — what would you do?",
  "share_prompt": "A 34-year-old woman: fever 3 days, headache, T 38.4 °C. Test or treat?",
  "share_summary": "A test-before-treat malaria case for HC III.",
  "share_url": "https://learn.karibu.health/c/fever-headache",
  "evidence_card": "UCG 2023: parasitological confirmation before antimalarials.",
  "discussion_question": "When is presumptive antimalarial treatment ever justified at HC III?"
}
```

Shared text is plain (no emoji) and **never includes learner progress**.

### `CaseMeta` — provenance / review / scores (built now, used later)

```jsonc
{
  "complexity_score": 0.35, "clinical_correctness_score": 0.98,
  "hc3_reality_score": 0.95, "learning_value_score": 0.88,
  "source_guideline_ids": ["ucg-2023-malaria"],
  "original_citation": null, "license_status": "guideline-derived",
  "adaptation_notes": null,
  "review_status": "approved", "reviewed_by": "…", "reviewed_at": "2026-06-03",
  "case_version": "1.0.0"
}
```

These carry CPD-readiness data; no accreditation workflow is built against them
yet.

A **stub** (`ready: false`) needs only the metadata above (no `steps`); it shows
in the library as "COMING SOON" and on its landing screen as a preview.

## `CaseStep`

Each step pairs a cobalt **EHR chart** (left/top) with a coral **coach** panel
(right/bottom). `story` steps narrate; `decision` steps grade a choice.

```jsonc
{
  "kind": "decision",                // "story" | "decision"
  "chart": { /* ChartSpec, optional */ },
  "coach": {
    "eyebrow": "Decision · triage",
    "title": "Her vitals are in. What concerns you most?",
    "body": "…",
    "quote": "“optional patient quote”",
    "teach": { "label": "…", "text": "…" }   // optional teaching aside (story steps)
  },
  "question": {                      // required when kind == "decision"
    "prompt": "Which single finding most changes your urgency?",
    "calculator": false,             // surface the dose calculator on this step
    "options": [ { "text": "…", "correct": true }, { "text": "…", "correct": false } ],
    "right": "Explanation shown when the answer is correct.",
    "wrong": "Explanation shown when the answer is wrong."
  }
}
```

## `ChartSpec` — the cobalt EHR chart

```jsonc
{ "tag": "VITALS", "sections": [ /* ChartSection[] */ ] }
```

A section's fields are interpreted by its `type`. The `revealed` state (story
steps are always revealed; decision steps reveal after the learner answers)
toggles each section's before/after content.

| `type`           | Fields used |
|------------------|-------------|
| `chiefComplaint` | `text`, `chips[]` |
| `keyValues`      | `title`, `rows[]` (`{label,value}`) |
| `vitals`         | `title`, `right_label`, `vitals[]` (`{label,value,hot}`), `critical{title,body,count}` |
| `subjective`     | `title`, `text`, `reveal_text` |
| `dangerScreen`   | `title`, `danger_signs[]`, `reveal_note` |
| `assessment`     | `title`, `text`, `emphasis` |
| `investigations` | `title`, `orders[]` (`{name,sub,reveal_sub,status,reveal_status}`; status = `order`\|`pending`\|`done`) |
| `result`         | `title`, `right_label`, `result_label`, `result_value`, `badge`, `ai{headline,sub}` |
| `prescription`   | `title`, `calculator`, `drug`, `detail`, `reveal_detail`, `confirmed_on_reveal`, `counselling[]` |
| `diagnosis`      | `title`, `codes[]` (`{code,name,confidence,primary}`), `receipt` |

Reserved colours inside the chart, exactly as in the real EHR: **amber = AI**
(`ai{}` banner, `confidence` chips), **brick-red = clinical critical**
(`critical{}`, `badge`). Never decorate with them.

## `DoseCalcSpec`

A weight-based calculator opened from a prescribe step. Bands are WHO weight
bands; total = `tabs × doses_per_day × days`.

```jsonc
{
  "drug": "Artemether-Lumefantrine 20/120",
  "drug_sub": "AL · BD × 3 days",
  "source_label": "Uganda Clinical Guidelines 2023",
  "start_weight": 62.4,
  "min_weight": 5.0,                 // below this → "refer" state
  "doses_per_day": 2,
  "days": 3,
  "bands": [
    { "lo": 5.0,  "hi": 14.0, "tabs": 1, "label": "5–14" },
    { "lo": 15.0, "hi": 24.0, "tabs": 2, "label": "15–24" },
    { "lo": 25.0, "hi": 34.0, "tabs": 3, "label": "25–34" },
    { "lo": 35.0, "hi": null, "tabs": 4, "label": "≥35" }   // null hi = open-ended
  ]
}
```

## Authoring rules (from the design system)

- **Generated data only.** Never a real patient, never real PHI. Say so on the
  landing screen ("Generated patient — invented for teaching").
- **Sentence case** for titles/buttons; mono eyebrows/captions are uppercased.
- **Numbers, units, timestamps inline:** `T 38.4°C`, `BP 128/82`, `09:42`.
- **Calm, precise, spare.** Status, not warnings. No emoji. Unicode like
  `·  →  °C  SpO₂  ≥  —` is used freely.
- The AI assistant **proposes; the clinician disposes** — it never apologises
  or asks "are you sure?".

## Reference fixture

`assets/learn/packs/core-opd.json` contains the fully-authored
**fever → malaria** case (`fever-headache`). Use it as the canonical example of
every step kind, section type, and the dose calculator wired end-to-end.
