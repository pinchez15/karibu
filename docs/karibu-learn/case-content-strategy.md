# Karibu Learn Case Content Strategy

Status: strategic direction for Karibu Learn case content and the Python generation pipeline.

Karibu Learn should provide valuable, realistic, important clinical reasoning practice for healthcare workers in Sub-Saharan Africa. It should augment existing CPD habits such as hospital seminars, Ministry of Health guideline learning, peer discussion, and WhatsApp-based case sharing.

Karibu Learn inherits design DNA and clinical workflow feel from Karibu EHR, but it is not an EHR product. It uses simulated cases only and does not share PHI, EHR clinical data, EHR Room storage, EHR sync code, or the EHR Supabase backend.

## Product Positioning

Karibu Learn should feel like:

> Daily realistic cases from Uganda clinical practice, with guideline-backed feedback, peer-shareable discussion, and progression toward harder clinical reasoning.

It should not feel like:

> A static Western CME quiz library.

The product should be practical, mobile-first, lightly gamified, and clinically serious.

## Strategic Goals

Karibu Learn case content should be:

- clinically correct according to Uganda Ministry of Health guidance
- realistic for HC III clinicians
- useful for clinical reasoning practice
- fun enough to encourage repeat use
- shareable in existing WhatsApp learning patterns
- structured for future CPD accreditation, without overbuilding accreditation now

## Case Source Strategy

Karibu Learn should support three case source types.

### 1. Guideline-Generated Cases

These are the backbone of the product.

They are generated from Uganda MoH guidance and approved source material, then validated and reviewed.

Use for:

- common HC III presentations
- core practice
- progression foundation
- high-volume case libraries

Examples:

- uncomplicated malaria
- severe malaria danger signs
- childhood fever using IMNCI
- pneumonia danger signs
- ANC hypertension / pre-eclampsia screening
- HIV testing and ART continuity scenarios

### 2. Reviewer-Authored Local Cases

These should become the highest-value content source over time.

They can reflect local clinical experience, but must be simulated, de-identified, normalized, and reviewed.

Use for:

- locally common edge cases
- teaching cases from Ugandan clinicians
- cases that reflect real HC III workflow constraints

### 3. Literature-Adapted Cases

Published case studies should be used selectively, mostly for advanced or case-conference content.

They are useful because they are realistic and citeable, but they often skew toward rare, dramatic, specialist-level cases and may assume tertiary diagnostics unavailable at HC III.

Use for:

- advanced cases
- recognition and referral practice
- case conference mode
- unusual but important presentations

Rules:

- Do not copy full published cases unless licensing permits it.
- Credit and link to source authors/publications.
- Transform literature cases into simulated educational cases.
- Frame the learner as the first-contact HC III clinician.
- Uganda MoH guidance decides HC III correctness, even when the original literature case followed a specialist pathway.

Recommended labels:

- `Guideline Practice`
- `Challenge`
- `Case Conference`
- `From the Literature`

Avoid presenting "real vs generated" as a quality hierarchy.

## Canonical Case and Playable Variant Model

Every generated or adapted case should start as a complete clinical truth object, then become one or more playable variants.

### Canonical Case

The canonical case is the complete simulated encounter and answer key.

It contains:

- patient demographics
- chief complaint
- full history
- review of systems
- vitals
- exam findings
- available tests
- diagnosis
- differentials
- management
- referral threshold
- medicines
- follow-up
- guideline citations
- teaching points
- expected reasoning path

The canonical case is not necessarily what the learner sees.

### Playable Case Variant

The playable variant is the game layer.

It decides:

- what information is initially visible
- what must be requested
- what must be entered
- what is hidden until the learner takes action
- what decisions are required
- how the learner is scored

The same canonical case can produce multiple variants:

- Level 1: vitals, history, and exam are given.
- Level 2: vitals are given, but key history must be asked.
- Level 3: chief complaint only; learner must request vitals and focused history.
- Level 4: learner must enter vitals, identify danger signs, choose focused questions, and decide referral.
- Level 5: ambiguous presentation with distractors, limited tests, and comorbidity.

This allows reuse of clinically reviewed cases across multiple difficulty levels while keeping the clinical core stable.

Level 1 to Level 3 can evolve along several dimensions:

- Information gating: reveal less clinical data up front as the level rises.
- EHR task load: move from recognition to documenting vitals, focused history, plan, and referral.
- Cognitive noise: add distractors, normal early findings, or competing priorities.
- Autonomy: reduce guided prompts and make learners choose what to ask, examine, document, and escalate.
- Clinic workflow: move from isolated cases to queue-based “day in clinic” cases where unrelated patients arrive back to back.

The default generated progression uses a conservative version of these methods: Level 1 is information-rich pattern recognition, Level 2 hides one management-changing history detail while keeping vitals visible, and Level 3 starts from chief complaint only with EHR-like tasks for vitals, focused history, and referral decision.

## EHR-Like Practice

Karibu Learn should include simulated use of Karibu EHR-style workflows so learners build clinical documentation muscle memory on mobile.

These actions are simulated and must not touch EHR data.

Examples:

- enter vitals
- record chief complaint
- ask/select history questions
- document focused exam
- choose provisional diagnosis
- order or interpret limited tests
- write a short plan
- identify referral need
- complete a short note

This reinforces the parent-child relationship between Karibu EHR and Karibu Learn without sharing clinical data.

## Gamification and Progression

Karibu Learn should support progression from standard cases to harder cases.

Progression should be based on demonstrated competence, not only completion count.

Progression inputs may include:

- completed cases
- score
- missed danger signs
- correct referral decisions
- repeated improvement
- topic mastery
- streaks or practice consistency

Recommended modes:

```text
Core Practice
- common HC III scenarios
- guideline-generated
- high repetition
- progression foundation

Challenge Cases
- more ambiguity
- generated from canonical cases
- fewer variables given up front

Case Conference
- adapted from published literature or expert-submitted cases
- explicitly credited
- higher complexity
- focuses on recognition, referral, and reasoning under uncertainty
```

## Case Scoring Dimensions

Every case and variant should be scored across multiple dimensions.

### Clinical Correctness Score

Measures whether the case aligns with Uganda MoH guidance.

Checks include:

- correct danger signs
- correct first-line management
- correct referral threshold
- correct medicine and facility-level assumptions
- citations resolve to source text

### HC III Reality Score

Measures whether the case feels realistic for an HC III clinician.

Checks include:

- common presentation
- realistic vitals
- limited diagnostics
- resource constraints
- role-appropriate decisions
- plausible patient flow

### Learning Value Score

Measures whether the case teaches something meaningful.

Checks include:

- not too obvious
- targets a known reasoning error
- forces triage, differential, or management thinking
- includes useful feedback
- explains why distractors are wrong

### Complexity Score

Drives progression and unlocks.

Inputs include:

- number of decision nodes
- ambiguity of presentation
- severity / danger signs
- comorbidities
- conflicting cues
- need for referral decision
- guideline cross-reference count
- amount of information hidden from the learner
- amount of EHR-like data entry required

## Pipeline Direction

The Python pipeline should become a case factory with gates, not a single LLM generation call.

Recommended stages:

```text
source registry
→ clinical knowledge extraction
→ canonical case generation
→ canonical case validation
→ playable variant generation
→ variant validation
→ automated scoring
→ repair loop
→ human review
→ .kpack export
```

### Stage 1: Source Registry

Catalog authoritative sources:

- title
- source organization
- publication year
- official URL
- local file path
- topic tags
- facility-level relevance
- review status
- checksum

### Stage 2: Clinical Knowledge Extraction

Extract structured clinical anchors before generating cases:

- condition
- presenting symptoms
- danger signs
- differential diagnoses
- recommended assessment
- HC III management
- medicines and level-of-care availability
- referral criteria
- follow-up advice
- citation anchors

### Stage 3: Canonical Case Generation

Generate the complete simulated encounter from structured clinical anchors.

### Stage 4: Playable Variant Generation

Strategically remove or gate information:

- hide vitals until requested
- require vitals entry
- hide smoking history unless asked
- reveal medication history only if asked
- reveal exam findings only after focused exam selection
- require appropriate test selection
- require HC III management vs referral decision

### Stage 5: Validation, Scoring, and Repair

Automated evaluators should check:

- correctness
- realism
- learning value
- complexity
- citation coverage
- unsafe advice
- HC III appropriateness
- no PHI / no real patient data

If a case fails threshold checks, the pipeline should regenerate, patch, or reject it before human review.

### Stage 6: Human Review

Human review remains required before publication.

Reviewers should approve:

- clinical correctness
- educational usefulness
- HC III realism
- citation quality
- appropriateness of difficulty
- shareability and tone

### Stage 7: Publish

Published cases are exported into immutable `.kpack` learning packs.

## WhatsApp and Sharing Strategy

Karibu Learn should lean into existing WhatsApp group learning behavior.

Each case should support shareable artifacts:

- case teaser
- "What would you do next?" prompt
- answer reveal link
- evidence card with Uganda guideline citation
- group challenge link
- score/share card, when appropriate

Shared content should be short, practical, and discussion-friendly.

Shared content must not leak private learner progress unless the learner explicitly chooses to share it.

Suggested case fields:

```text
shareTitle
sharePrompt
shareSummary
shareUrl
evidenceCard
discussionQuestion
```

## Future CPD Readiness

Karibu Learn should be structured so it could become a registered CPD tool in Uganda in the future.

Do not build accreditation workflows yet.

Do build the metadata needed later:

- source guideline provenance
- reviewer identity
- review date
- case version
- learning objectives
- estimated completion time
- learner attempts
- score
- completion timestamp
- assessment validity metadata

Possible future CPD record:

```text
learnerId
caseId
packVersion
learningObjectives
durationSeconds
score
passed
completedAt
assessmentMode
certificateEligible
reviewedBy
reviewedAt
sourceGuidelines
```

## Schema Direction

The content schema should evolve to include:

- `CanonicalCase`
- `PlayableCaseVariant`
- `InformationReveal`
- `LearnerAction`
- `EhrLikeTask`
- `ScoringRule`
- `UnlockRequirement`

Recommended content metadata:

```text
sourceType
difficultyLevel
complexityScore
clinicalCorrectnessScore
hc3RealityScore
learningValueScore
shareMetadata
learningObjectives
estimatedDurationMinutes
credentialingMetadata
reviewStatus
reviewerNotes
sourceGuidelineIds
originalCitation
licenseStatus
adaptationNotes
hc3AdaptationRationale
guidelineCrosscheck
```

## Strategic Rule

Published case studies can inspire realism and complexity, but Uganda Ministry of Health guidance decides correctness for HC III management.

The pipeline should optimize for:

```text
correct + realistic + challenging + discussable + reviewable
```
