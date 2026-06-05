# Case Pipeline Specificity Refactor

Status: proposed implementation plan.

Purpose: raise all generated Karibu Learn cases to the same specificity, realism, and clinical-action threshold as the revised TB case. The pipeline should turn guideline facts into realistic HC III clinical reps, not generic summaries.

## Problem

The current Python generator can create realistic case shells, but many cases remain one or two turns too generic.

Examples of weak output:

- "Treat according to Uganda guidance."
- "ORS and zinc according to age and classification where appropriate."
- "Pre-referral treatment per local protocol if indicated."
- "Use available tests where relevant."
- "Vitals vary by scenario."

This is not good enough for Karibu Learn. The app should teach clinicians to make the next correct action for a concrete patient at a concrete facility level.

The TB review case is the current quality target because it does the right things:

- Uses the specific patient facts.
- Names the threshold: cough for three weeks plus night sweats and weight loss equals presumptive TB.
- Names the facility workflow: separate from crowded queue, cough etiquette, ventilation.
- Names the diagnostic action: collect sputum today for district GeneXpert via sample transport.
- Names the HIV integration step.
- Names what not to do: do not give only cough medicine or antibiotics and send away.

## Target Standard

Every case should answer:

1. What exact guideline threshold is met?
2. What classification does this patient fall into?
3. What is the first safe HC III action?
4. What treatment, test, referral, or counseling step is expected today?
5. What should not be done?
6. What changes the pathway?
7. What should be documented?
8. What should a clinician reviewer confirm?

## Required Data Model Changes

Update `pipelines/case-generation/src/karibu_case_generation/models.py`.

Add structured fields under `ClinicalTruth` instead of relying only on free-text `management`.

Recommended additions:

```python
classification: str
classification_rationale: list[str]
guideline_actions: list[GuidelineAction]
contraindication_checks: list[str]
do_not_do: list[str]
documentation_requirements: list[str]
reviewer_questions: list[str]
```

Add new dataclasses:

```python
@dataclass(frozen=True)
class GuidelineAction:
    category: Literal[
        "triage",
        "ipc",
        "test",
        "treatment",
        "medicine",
        "dose",
        "referral",
        "counseling",
        "follow_up",
        "documentation",
    ]
    action: str
    rationale: str
    source_document_id: str
    source_section: str | None = None
    confidence: Literal["source_verified", "needs_clinician_confirmation"]
```

Why this matters:

- The app can show concrete action cards.
- The narrative exporter can write useful review prose.
- Validators can reject vague cases.
- Clinician review can focus on specific claims rather than guessing what the case meant.

## Required Schema Changes

Update:

- `packages/content-schema/schemas/canonical-case.schema.json`
- Any TypeScript types exported by `packages/content-schema`

Add schema support for:

- `classification`
- `classificationRationale`
- `guidelineActions`
- `contraindicationChecks`
- `doNotDo`
- `documentationRequirements`
- `reviewerQuestions`

The schema should allow `confidence: "needs_clinician_confirmation"` so we can be explicit when a case needs local protocol review instead of hiding uncertainty in vague language.

## Required Source-Knowledge Layer

Add a source-backed action layer under:

```text
pipelines/case-generation/src/karibu_case_generation/clinical_actions/
```

Suggested files:

```text
clinical_actions/
  __init__.py
  malaria.py
  diarrhoea.py
  maternal_hypertension.py
  tb.py
  ebola_vhf.py
  child_cough.py
  registry.py
```

Each module should expose topic-specific functions that transform case facts into guideline actions.

Examples:

```python
classify_child_diarrhoea(age_months, weight_kg, signs) -> CaseActionBundle
classify_tb_screen(cough_duration_weeks, symptoms, facility_workflow) -> CaseActionBundle
classify_malaria(age_years, weight_kg, rdt_result, danger_signs, pregnancy_status) -> CaseActionBundle
classify_anc_hypertension(gestational_age_weeks, bp_readings, symptoms, urine_protein) -> CaseActionBundle
classify_ebola_screen(symptoms, exposure_history, outbreak_context) -> CaseActionBundle
```

Each action bundle should include:

- classification
- rationale
- immediate actions
- treatment/test/referral steps
- do-not-do items
- documentation requirements
- reviewer questions

## Required Generator Changes

Update `pipelines/case-generation/src/karibu_case_generation/generate/draft_cases.py`.

Current issue:

- Early hand-written cases and compact cases pass strings directly into `ClinicalTruth`.
- Compact cases especially lack enough structured facts to derive a high-quality management plan.

Required changes:

1. Replace generic management strings with action bundles.
2. Make each case specify enough facts to classify the patient.
3. Split ambiguous branches into separate cases or level variants.
4. Stop using placeholders such as `"varies"` or `"if available"` in canonical truth.
5. Keep uncertainty as `reviewerQuestions`, not as vague management text.

Example rewrite direction:

```python
truth=ClinicalTruth(
    ...
    classification="Some dehydration",
    classification_rationale=[
        "Restless and irritable",
        "Sunken eyes",
        "Drinks eagerly",
        "Skin pinch returns slowly",
        "Not lethargic or unconscious",
    ],
    guideline_actions=[
        GuidelineAction(
            category="treatment",
            action="Give ORS 75 ml/kg over 4 hours: 750 ml for this 10 kg child.",
            rationale="IMNCI Plan B for some dehydration.",
            source_document_id="who-imnci-chart-booklet",
            confidence="source_verified",
        ),
        GuidelineAction(
            category="medicine",
            action="Give zinc 20 mg once daily for 10-14 days.",
            rationale="Child is older than 6 months.",
            source_document_id="who-imnci-chart-booklet",
            confidence="source_verified",
        ),
    ],
)
```

## Required Validation Changes

Update `pipelines/case-generation/src/karibu_case_generation/review/validators.py`.

Add a specificity validator that rejects generic cases before human review.

Reject phrases like:

- `according to guidance`
- `according to local guidance`
- `where appropriate`
- `if clinically appropriate`
- `if indicated and available`
- `varies`
- `scenario-dependent`
- `use available tests where relevant`
- `treat per protocol`

Allow protocol uncertainty only when:

- the action is specific,
- `confidence == "needs_clinician_confirmation"`,
- and a reviewer question names exactly what must be confirmed.

Add validation rules:

- Each case must have `classification`.
- Each case must have at least one `guidelineAction`.
- Each case must have at least one `doNotDo`.
- Each case must have at least one `documentationRequirement`.
- Each medicine action must include dose or explicitly require clinician confirmation.
- Each referral action must include the threshold met by this patient.
- Any `vitals` value equal to `"varies"` should fail.
- Any case with a child under 5 must include age/weight where dosing or classification depends on it.
- Any outbreak case must include immediate IPC/isolation action before ordinary exam/testing.

## Required Narrative Exporter

Add:

```text
pipelines/case-generation/src/karibu_case_generation/export/review_narratives.py
```

This should generate clinician-review prose from canonical cases.

Output location:

```text
content/learn/review_packets/
```

The review narrative should include:

- case story
- patient facts
- classification
- rationale
- expected actions
- do-not-do items
- documentation requirements
- reviewer sign-off block

This prevents hand-written review docs from drifting away from the canonical JSON.

## Required CLI Changes

Update `pipelines/case-generation/src/karibu_case_generation/cli.py`.

Add commands:

```sh
generate-review-narratives
validate-specificity
```

Suggested use:

```sh
PYTHONPATH=pipelines/case-generation/src \
  python -m karibu_case_generation.cli validate-specificity \
  --pack content/learn/generated/hc3-core-draft-v0.1.0
```

```sh
PYTHONPATH=pipelines/case-generation/src \
  python -m karibu_case_generation.cli generate-review-narratives \
  --pack content/learn/generated/hc3-core-draft-v0.1.0 \
  --output content/learn/review_packets/hc3-core-draft-v0.1.0.md
```

## Required Tests

Add or update tests under:

```text
pipelines/case-generation/tests/
```

Required test cases:

- Generic language fails validation.
- TB case passes specificity validation.
- Diarrhoea case includes classification, ORS volume, zinc dose, and reassessment step.
- Ebola/VHF case fails if isolation/IPC is not the first action.
- ANC hypertension case includes repeat BP, urine protein, referral threshold, and reviewer question for MgSO4/antihypertensive protocol.
- Review narrative exporter includes classification, actions, do-not-do items, and sign-off block.
- Generated 100-case pack has no `"varies"` vitals and no generic management phrases.

## Required Case Rework Strategy

Do not manually rewrite all 100 cases as prose first.

Recommended order:

1. Add structured action fields and validators.
2. Implement action modules for the highest-priority chapters:
   - TB
   - diarrhoea/dehydration
   - malaria
   - ANC hypertension/pre-eclampsia
   - Ebola/VHF screening
3. Convert the five sample cases into structured action bundles.
4. Regenerate the five narrative review cases from JSON.
5. Expand action modules chapter by chapter until all 100 cases pass specificity validation.
6. Only then regenerate the full 100-case pack and review packet.

## Impacted Files

Core Python:

- `pipelines/case-generation/src/karibu_case_generation/models.py`
- `pipelines/case-generation/src/karibu_case_generation/generate/draft_cases.py`
- `pipelines/case-generation/src/karibu_case_generation/review/validators.py`
- `pipelines/case-generation/src/karibu_case_generation/cli.py`
- `pipelines/case-generation/src/karibu_case_generation/export/kpack.py`
- `pipelines/case-generation/src/karibu_case_generation/export/review_narratives.py`
- `pipelines/case-generation/src/karibu_case_generation/clinical_actions/*`

Schemas:

- `packages/content-schema/schemas/canonical-case.schema.json`
- Type exports in `packages/content-schema/src/*`

Generated content:

- `content/learn/generated/hc3-core-draft-v0.1.0`
- `Codex Cases/hc3-core-draft-v0.1.0`
- `content/learn/review_packets/*`

Docs:

- `docs/karibu-learn/clinician-review-sample-cases.md`
- `docs/karibu-learn/case-content-strategy.md`
- `docs/karibu-learn/content-pipeline.md`

Tests:

- `pipelines/case-generation/tests/test_case_models.py`
- `pipelines/case-generation/tests/test_draft_generation.py`
- new `pipelines/case-generation/tests/test_specificity_validation.py`
- new `pipelines/case-generation/tests/test_review_narratives.py`

## Definition of Done

The full 100-case pack is ready for volunteer clinical review only when:

- every case has a concrete classification,
- every case has source-linked guideline actions,
- every case has at least one do-not-do item,
- every case has documentation requirements,
- no case contains generic management placeholders,
- no case has placeholder vitals,
- review narratives are generated from canonical JSON,
- tests enforce the specificity threshold,
- and reviewer questions identify only true local-protocol or clinical-confirmation points.

