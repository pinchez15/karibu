from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

SourceType = Literal["generated_guideline", "reviewer_authored", "literature_adapted"]
ReviewStatus = Literal["draft", "needs_review", "approved", "rejected"]
RevealTrigger = Literal[
    "initial",
    "request_vitals",
    "ask_history",
    "record_exam",
    "order_test",
    "choose_diagnosis",
    "decide_referral",
]
EhrTaskType = Literal[
    "enter_vitals",
    "record_chief_complaint",
    "ask_history",
    "record_exam",
    "choose_diagnosis",
    "order_test",
    "write_plan",
    "decide_referral",
    "complete_note",
]


@dataclass(frozen=True)
class SourceDocument:
    id: str
    title: str
    source_org: str
    source_year: int
    official_url: str
    local_path: str
    sha256: str
    jurisdiction: str
    topics: list[str]
    facility_levels: list[str]
    review_status: str


@dataclass(frozen=True)
class Citation:
    id: str
    source_document_id: str
    title: str
    section: str | None = None
    url: str | None = None
    quote: str | None = None


@dataclass(frozen=True)
class SimulatedPatient:
    display_name: str
    age_label: str
    sex: Literal["female", "male", "unknown"]
    context: str | None = None


@dataclass(frozen=True)
class ClinicalTruth:
    chief_complaint: str
    history: list[str]
    review_of_systems: list[str]
    vitals: dict[str, str]
    exam_findings: list[str]
    available_tests: list[str]
    diagnosis: str
    differentials: list[str]
    management: list[str]
    referral_threshold: str
    medicines: list[str]
    follow_up: list[str]
    danger_signs: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class CaseScores:
    clinical_correctness: int
    hc3_reality: int
    learning_value: int
    complexity: int


@dataclass(frozen=True)
class ShareMetadata:
    title: str
    prompt: str
    summary: str
    discussion_question: str


@dataclass(frozen=True)
class CredentialingMetadata:
    learning_objectives: list[str]
    estimated_duration_minutes: int
    assessment_mode: str
    certificate_eligible: bool = False


@dataclass(frozen=True)
class CanonicalCase:
    id: str
    title: str
    narrative: str
    chapter_id: str
    source_type: SourceType
    facility_level: str
    topic: str
    simulated_patient: SimulatedPatient
    clinical_truth: ClinicalTruth
    expected_reasoning_path: list[str]
    teaching_points: list[str]
    citations: list[Citation]
    scores: CaseScores
    share_metadata: ShareMetadata
    credentialing_metadata: CredentialingMetadata
    source_guideline_ids: list[str]
    review_status: ReviewStatus = "draft"
    original_citation: Citation | None = None
    license_status: str | None = None
    adaptation_notes: str | None = None
    hc3_adaptation_rationale: str | None = None
    guideline_crosscheck: str | None = None


@dataclass(frozen=True)
class InformationReveal:
    field_path: str
    trigger: RevealTrigger
    rationale: str


@dataclass(frozen=True)
class EhrLikeTask:
    id: str
    task_type: EhrTaskType
    prompt: str
    required: bool = True
    scoring_weight: int = 1


@dataclass(frozen=True)
class ScoringRule:
    id: str
    description: str
    points: int
    citation_ids: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class UnlockRequirement:
    description: str
    minimum_score: int | None = None
    completed_case_count: int | None = None
    required_topic_mastery: str | None = None


@dataclass(frozen=True)
class PlayableCaseVariant:
    id: str
    canonical_case_id: str
    label: str
    difficulty_level: int
    quest_type: Literal["core_practice", "challenge", "case_conference"]
    initially_visible: list[str]
    information_reveals: list[InformationReveal]
    ehr_tasks: list[EhrLikeTask]
    scoring_rules: list[ScoringRule]
    unlock_requirement: UnlockRequirement | None
    scores: CaseScores
    review_status: ReviewStatus = "draft"


def to_dict(value: Any) -> Any:
    if hasattr(value, "__dataclass_fields__"):
        return {
            _snake_to_camel(key): to_dict(getattr(value, key))
            for key in value.__dataclass_fields__.keys()
            if getattr(value, key) is not None
        }
    if isinstance(value, list):
        return [to_dict(item) for item in value]
    if isinstance(value, dict):
        return {key: to_dict(item) for key, item in value.items()}
    return value


def _snake_to_camel(value: str) -> str:
    parts = value.split("_")
    return parts[0] + "".join(part.capitalize() for part in parts[1:])
