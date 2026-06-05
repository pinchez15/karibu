from __future__ import annotations

from dataclasses import dataclass

from karibu_case_generation.models import CanonicalCase, PlayableCaseVariant

GENERIC_PHRASES = (
    "according to guidance",
    "according to local guidance",
    "appropriate according to",
    "where appropriate",
    "if clinically appropriate",
    "if indicated and available",
    "varies",
    "scenario-dependent",
    "use available tests where relevant",
    "use hc iii-appropriate guideline reasoning",
    "must be specified",
    "medicine decisions must follow",
    "depends on focused",
    "treat per protocol",
    "per local protocol",
    "local stock availability",
)


@dataclass(frozen=True)
class ValidationIssue:
    path: str
    message: str


@dataclass(frozen=True)
class ValidationReport:
    valid: bool
    issues: list[ValidationIssue]

    def raise_for_issues(self) -> None:
        if self.valid:
            return
        details = "\n".join(f"- {issue.path}: {issue.message}" for issue in self.issues)
        raise ValueError(f"Validation failed:\n{details}")


def validate_canonical_case(case: CanonicalCase) -> ValidationReport:
    issues: list[ValidationIssue] = []

    _require(case.id, "id", issues)
    _require(case.title, "title", issues)
    _require(case.narrative, "narrative", issues)
    _require(case.chapter_id, "chapter_id", issues)
    _require(case.facility_level, "facility_level", issues)
    _require(case.topic, "topic", issues)

    if case.facility_level != "HC III":
        issues.append(ValidationIssue("facility_level", "Initial Karibu Learn cases should target HC III."))

    if not case.source_guideline_ids:
        issues.append(ValidationIssue("source_guideline_ids", "At least one source guideline is required."))

    if not case.citations:
        issues.append(ValidationIssue("citations", "At least one citation is required."))

    citation_ids = {citation.id for citation in case.citations}
    for index, point in enumerate(case.teaching_points):
        if not point.strip():
            issues.append(ValidationIssue(f"teaching_points[{index}]", "Teaching point cannot be blank."))

    truth = case.clinical_truth
    _require(truth.chief_complaint, "clinical_truth.chief_complaint", issues)
    _require(truth.diagnosis, "clinical_truth.diagnosis", issues)
    _require(truth.referral_threshold, "clinical_truth.referral_threshold", issues)

    if not truth.vitals:
        issues.append(ValidationIssue("clinical_truth.vitals", "Canonical case must include complete vitals."))
    if not truth.history:
        issues.append(ValidationIssue("clinical_truth.history", "Canonical case must include history."))
    if not truth.exam_findings:
        issues.append(ValidationIssue("clinical_truth.exam_findings", "Canonical case must include exam findings."))
    if not truth.management:
        issues.append(ValidationIssue("clinical_truth.management", "Canonical case must include management."))

    if case.scores.clinical_correctness < 80:
        issues.append(
            ValidationIssue(
                "scores.clinical_correctness",
                "Canonical cases need clinical correctness >= 80 before review.",
            )
        )
    if case.scores.hc3_reality < 70:
        issues.append(ValidationIssue("scores.hc3_reality", "HC III reality score should be >= 70."))
    if case.scores.learning_value < 60:
        issues.append(ValidationIssue("scores.learning_value", "Learning value score should be >= 60."))

    if case.source_type == "literature_adapted":
        if case.original_citation is None:
            issues.append(
                ValidationIssue(
                    "original_citation",
                    "Literature-adapted cases require original source attribution.",
                )
            )
        if not case.license_status:
            issues.append(ValidationIssue("license_status", "Literature-adapted cases require license status."))
        if not case.hc3_adaptation_rationale:
            issues.append(
                ValidationIssue(
                    "hc3_adaptation_rationale",
                    "Literature-adapted cases must explain the HC III adaptation.",
                )
            )

    for citation in case.citations:
        if citation.id not in citation_ids:
            issues.append(ValidationIssue("citations", "Internal citation id error."))

    return ValidationReport(valid=not issues, issues=issues)


def validate_case_specificity(case: CanonicalCase) -> ValidationReport:
    issues: list[ValidationIssue] = []
    truth = case.clinical_truth

    _require(truth.classification, "clinical_truth.classification", issues)
    if not truth.classification_rationale:
        issues.append(ValidationIssue("clinical_truth.classification_rationale", "Case needs explicit classification rationale."))
    if not truth.guideline_actions:
        issues.append(ValidationIssue("clinical_truth.guideline_actions", "Case needs source-linked guideline actions."))
    if not truth.do_not_do:
        issues.append(ValidationIssue("clinical_truth.do_not_do", "Case needs at least one explicit do-not-do item."))
    if not truth.documentation_requirements:
        issues.append(ValidationIssue("clinical_truth.documentation_requirements", "Case needs documentation requirements."))

    for path, value in _specificity_strings(case):
        lowered = value.lower()
        for phrase in GENERIC_PHRASES:
            if phrase in lowered:
                issues.append(ValidationIssue(path, f"Generic phrase is not allowed in review-ready cases: {phrase}"))

    for key, value in truth.vitals.items():
        if value.strip().lower() in {"varies", "not available", "not yet measured"}:
            issues.append(ValidationIssue(f"clinical_truth.vitals.{key}", "Review-ready cases need concrete scenario vitals or an explicit reason in actions."))

    for index, action in enumerate(truth.guideline_actions):
        if not action.action.strip():
            issues.append(ValidationIssue(f"clinical_truth.guideline_actions[{index}].action", "Guideline action cannot be blank."))
        if not action.rationale.strip():
            issues.append(ValidationIssue(f"clinical_truth.guideline_actions[{index}].rationale", "Guideline action needs rationale."))
        if action.confidence == "needs_clinician_confirmation" and not truth.reviewer_questions:
            issues.append(
                ValidationIssue(
                    f"clinical_truth.guideline_actions[{index}].confidence",
                    "Clinician-confirmation actions require reviewer questions.",
                )
            )

    if case.topic == "outbreak":
        first_action = truth.guideline_actions[0].action.lower() if truth.guideline_actions else ""
        if not any(word in first_action for word in ("screen", "isolate", "isolation", "ipc", "separate")):
            issues.append(ValidationIssue("clinical_truth.guideline_actions[0]", "Outbreak cases must start with screening/isolation/IPC."))

    if case.topic in {"child_health", "neonatal"}:
        age_or_weight = " ".join([case.simulated_patient.age_label, *truth.vitals.values()]).lower()
        if "kg" not in age_or_weight and "month" not in age_or_weight and "year" not in age_or_weight:
            issues.append(ValidationIssue("simulated_patient.age_label", "Child cases need age/weight facts for classification or dosing."))

    return ValidationReport(valid=not issues, issues=issues)


def validate_playable_variant(case: CanonicalCase, variant: PlayableCaseVariant) -> ValidationReport:
    issues: list[ValidationIssue] = []

    if variant.canonical_case_id != case.id:
        issues.append(
            ValidationIssue(
                "canonical_case_id",
                f"Variant points to {variant.canonical_case_id}, expected {case.id}.",
            )
        )

    if not 1 <= variant.difficulty_level <= 5:
        issues.append(ValidationIssue("difficulty_level", "Difficulty level must be between 1 and 5."))

    if not variant.initially_visible:
        issues.append(ValidationIssue("initially_visible", "Variant needs at least one initially visible field."))

    if variant.difficulty_level >= 3 and not variant.information_reveals:
        issues.append(
            ValidationIssue(
                "information_reveals",
                "Level 3+ variants should hide or gate information.",
            )
        )

    if variant.difficulty_level >= 3 and not variant.ehr_tasks:
        issues.append(
            ValidationIssue(
                "ehr_tasks",
                "Level 3+ variants should include simulated EHR-like tasks.",
            )
        )

    valid_paths = _canonical_field_paths(case)
    for index, reveal in enumerate(variant.information_reveals):
        if reveal.field_path not in valid_paths:
            issues.append(
                ValidationIssue(
                    f"information_reveals[{index}].field_path",
                    f"Unknown canonical field path: {reveal.field_path}",
                )
            )

    citation_ids = {citation.id for citation in case.citations}
    for index, rule in enumerate(variant.scoring_rules):
        missing = [citation_id for citation_id in rule.citation_ids if citation_id not in citation_ids]
        if missing:
            issues.append(
                ValidationIssue(
                    f"scoring_rules[{index}].citation_ids",
                    f"Unknown citation ids: {', '.join(missing)}",
                )
            )

    return ValidationReport(valid=not issues, issues=issues)


def _require(value: str, path: str, issues: list[ValidationIssue]) -> None:
    if not value or not value.strip():
        issues.append(ValidationIssue(path, "Required value is blank."))


def _specificity_strings(case: CanonicalCase) -> list[tuple[str, str]]:
    truth = case.clinical_truth
    values: list[tuple[str, str]] = [
        ("clinical_truth.classification", truth.classification),
        ("clinical_truth.diagnosis", truth.diagnosis),
        ("clinical_truth.referral_threshold", truth.referral_threshold),
    ]
    for field_name in ("management", "medicines", "follow_up", "available_tests"):
        for index, item in enumerate(getattr(truth, field_name)):
            values.append((f"clinical_truth.{field_name}[{index}]", item))
    for index, item in enumerate(truth.classification_rationale):
        values.append((f"clinical_truth.classification_rationale[{index}]", item))
    for index, action in enumerate(truth.guideline_actions):
        values.append((f"clinical_truth.guideline_actions[{index}].action", action.action))
        values.append((f"clinical_truth.guideline_actions[{index}].rationale", action.rationale))
    for field_name in ("contraindication_checks", "do_not_do", "documentation_requirements", "reviewer_questions"):
        for index, item in enumerate(getattr(truth, field_name)):
            values.append((f"clinical_truth.{field_name}[{index}]", item))
    for key, value in truth.vitals.items():
        values.append((f"clinical_truth.vitals.{key}", value))
    return values


def _canonical_field_paths(case: CanonicalCase) -> set[str]:
    paths = {
        "chief_complaint",
        "diagnosis",
        "referral_threshold",
        "management",
        "medicines",
        "follow_up",
        "danger_signs",
    }
    paths.update(f"vitals.{key}" for key in case.clinical_truth.vitals.keys())
    paths.update(f"history[{index}]" for index, _ in enumerate(case.clinical_truth.history))
    paths.update(f"review_of_systems[{index}]" for index, _ in enumerate(case.clinical_truth.review_of_systems))
    paths.update(f"exam_findings[{index}]" for index, _ in enumerate(case.clinical_truth.exam_findings))
    paths.update(f"available_tests[{index}]" for index, _ in enumerate(case.clinical_truth.available_tests))
    return paths
