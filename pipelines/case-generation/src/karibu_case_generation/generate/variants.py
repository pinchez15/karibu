from __future__ import annotations

from dataclasses import dataclass

from karibu_case_generation.models import (
    CaseScores,
    EhrLikeTask,
    InformationReveal,
    PlayableCaseVariant,
    ScoringRule,
    UnlockRequirement,
)


@dataclass(frozen=True)
class VariantPlan:
    id: str
    label: str
    difficulty_level: int
    quest_type: str
    initially_visible: list[str]
    hidden_fields: dict[str, str]
    ehr_tasks: list[EhrLikeTask]
    scoring_rules: list[ScoringRule]
    unlock_requirement: UnlockRequirement | None = None


def build_playable_variant(canonical_case_id: str, plan: VariantPlan) -> PlayableCaseVariant:
    reveals = [
        InformationReveal(
            field_path=field_path,
            trigger=_infer_trigger(field_path),
            rationale=rationale,
        )
        for field_path, rationale in plan.hidden_fields.items()
    ]

    complexity = min(
        100,
        10
        + plan.difficulty_level * 12
        + len(reveals) * 4
        + len(plan.ehr_tasks) * 3
        + len(plan.scoring_rules) * 2,
    )

    return PlayableCaseVariant(
        id=plan.id,
        canonical_case_id=canonical_case_id,
        label=plan.label,
        difficulty_level=plan.difficulty_level,
        quest_type=plan.quest_type,  # type: ignore[arg-type]
        initially_visible=plan.initially_visible,
        information_reveals=reveals,
        ehr_tasks=plan.ehr_tasks,
        scoring_rules=plan.scoring_rules,
        unlock_requirement=plan.unlock_requirement,
        scores=CaseScores(
            clinical_correctness=0,
            hc3_reality=0,
            learning_value=0,
            complexity=complexity,
        ),
    )


def _infer_trigger(field_path: str) -> str:
    if "vitals" in field_path:
        return "request_vitals"
    if "history" in field_path or "review_of_systems" in field_path:
        return "ask_history"
    if "exam" in field_path:
        return "record_exam"
    if "test" in field_path:
        return "order_test"
    if "referral" in field_path:
        return "decide_referral"
    return "ask_history"
