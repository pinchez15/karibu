from __future__ import annotations

import json
import random
import re
from pathlib import Path
from typing import Any

SOURCE_TYPE_LABEL = {
    "generated_guideline": "Guideline Practice",
    "reviewer_authored": "Case Conference",
    "literature_adapted": "From the Literature",
}

QUEST_MODE = {
    "core_practice": "Core Practice",
    "guided_reasoning": "Core Practice",
    "challenge": "Challenge Cases",
    "case_conference": "Case Conference",
}

DIFFICULTY_BY_LEVEL = {
    1: "Core",
    2: "Intermediate",
    3: "Advanced",
}


def load_directory_pack(pack_dir: Path) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    manifest = json.loads((pack_dir / "manifest.json").read_text())
    cases = [
        json.loads((pack_dir / entry["path"]).read_text())
        for entry in manifest["cases"]
    ]
    variants = [
        json.loads((pack_dir / entry["path"]).read_text())
        for entry in manifest.get("variants", [])
    ]
    return manifest, cases, variants


def authored_steps_dir(input_dir: Path) -> Path:
    """Sibling of generated corpus: content/learn/authored-steps/."""
    return input_dir.parent.parent / "authored-steps"


def load_authored_playable(input_dir: Path, case_id: str, difficulty_level: int) -> dict[str, Any] | None:
    path = authored_steps_dir(input_dir) / f"{case_id}-level-{difficulty_level}.json"
    if not path.is_file():
        return None
    return json.loads(path.read_text())


def export_app_kpack_file(
    *,
    input_dir: Path,
    output_path: Path,
    pack_id: str,
    title: str,
    difficulty_level: int = 1,
    compile_walkable: bool = True,
    ready: bool | None = None,
    limit: int | None = None,
    chapter_id: str | None = None,
    seed: int = 42,
) -> dict[str, int]:
    """Convert a directory kpack (canonical + variants) into a single app `.kpack` file."""
    manifest, cases, variants = load_directory_pack(input_dir)
    cases_by_id = {case["id"]: case for case in cases}
    chapter_case_ids: set[str] | None = None
    if chapter_id is not None:
        chapter_case_ids = {
            entry["id"]
            for entry in manifest.get("cases", [])
            if entry.get("chapterId") == chapter_id
        }
        if not chapter_case_ids:
            raise ValueError(f"No canonical cases found for chapter {chapter_id!r}.")
    selected_variants = [
        variant
        for variant in variants
        if int(variant.get("difficultyLevel", 0)) == difficulty_level
        and (chapter_case_ids is None or variant.get("canonicalCaseId") in chapter_case_ids)
    ]
    if limit is not None:
        selected_variants = selected_variants[:limit]

    rng = random.Random(seed)
    learn_cases: list[dict[str, Any]] = []
    walkable = 0
    stubs = 0

    for variant in selected_variants:
        canonical = cases_by_id.get(variant["canonicalCaseId"])
        if canonical is None:
            raise ValueError(f"Missing canonical case for variant {variant['id']}.")
        steps: list[dict[str, Any]] = []
        is_ready = False
        if compile_walkable:
            steps = compile_steps(canonical, variant, rng, input_dir=input_dir)
            is_ready = len(steps) >= 3
        if ready is not None:
            is_ready = ready
        learn_case = canonical_to_learn_case(
            canonical, variant, steps=steps, ready=is_ready, input_dir=input_dir
        )
        learn_cases.append(learn_case)
        if is_ready:
            walkable += 1
        else:
            stubs += 1

    output_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"id": pack_id, "title": title, "cases": learn_cases}
    output_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    return {"cases": len(learn_cases), "walkable": walkable, "stubs": stubs}


def canonical_to_learn_case(
    case: dict[str, Any],
    variant: dict[str, Any],
    *,
    steps: list[dict[str, Any]],
    ready: bool,
    input_dir: Path | None = None,
) -> dict[str, Any]:
    patient = case["simulatedPatient"]
    truth = case["clinicalTruth"]
    cred = case.get("credentialingMetadata", {})
    share = case.get("shareMetadata", {})
    scores = case.get("scores", {})
    level = int(variant.get("difficultyLevel", 1))

    citations = [str(item.get("title", "")) for item in case.get("citations", []) if item.get("title")]
    if not citations:
        citations = [str(item) for item in case.get("sourceGuidelineIds", [])]

    learn_id = _learn_case_id(case["id"], variant["id"])
    authored = (
        load_authored_playable(input_dir, case["id"], level) if input_dir is not None else None
    )
    overrides = (authored or {}).get("learnCaseOverrides", {})

    learn_case: dict[str, Any] = {
        "id": learn_id,
        "ready": ready,
        "title": case["title"],
        "topic": _title_case(str(case.get("topic", "General"))),
        "difficulty": DIFFICULTY_BY_LEVEL.get(level, "Core"),
        "source_type": SOURCE_TYPE_LABEL.get(str(case.get("sourceType", "")), "Guideline Practice"),
        "mode": QUEST_MODE.get(str(variant.get("questType", "")), "Core Practice"),
        "level": level,
        "mins": int(cred.get("estimatedDurationMinutes", 10)),
        "credit": round(int(cred.get("estimatedDurationMinutes", 10)) / 48, 2),
        "setting": f"{case.get('facilityLevel', 'HC III')} · OPD",
        "patient": {
            "name": patient.get("displayName", "Simulated patient"),
            "id": _patient_id(learn_id),
            "age": patient.get("ageLabel", "Adult"),
            "sex": _sex_label(patient.get("sex")),
        },
        "blurb": _first_sentence(case.get("narrative", case["title"])),
        "objectives": list(cred.get("learningObjectives", [])) or list(case.get("expectedReasoningPath", []))[:4],
        "skills": _skills_for(case),
        "takeaways": list(case.get("teachingPoints", []))[:4],
        "citations": citations[:4],
        "share": {
            "share_title": share.get("title") or case["title"],
            "share_prompt": share.get("prompt") or f"What would you do first in {case['title']}?",
            "share_summary": share.get("summary") or _first_sentence(case.get("narrative", "")),
            "share_url": f"https://learn.karibu.health/c/{learn_id}",
            "discussion_question": share.get("discussionQuestion") or "Which finding most changes your next step?",
        },
        "meta": {
            "complexity_score": _score(scores.get("complexity")),
            "clinical_correctness_score": _score(scores.get("clinicalCorrectness")),
            "hc3_reality_score": _score(scores.get("hc3Reality")),
            "learning_value_score": _score(scores.get("learningValue")),
            "source_guideline_ids": list(case.get("sourceGuidelineIds", [])),
            "review_status": str(case.get("reviewStatus", variant.get("reviewStatus", "draft"))),
            "case_version": str(case.get("id", "")).replace("hc3-", "") + f"-L{level}",
        },
        "steps": steps,
    }
    for key in ("patient", "dose_calc", "objectives", "takeaways", "blurb", "citations", "skills"):
        if key in overrides:
            learn_case[key] = overrides[key]
    return learn_case


def compile_steps(
    case: dict[str, Any],
    variant: dict[str, Any],
    rng: random.Random,
    *,
    input_dir: Path,
) -> list[dict[str, Any]]:
    level = int(variant.get("difficultyLevel", 1))
    authored = load_authored_playable(input_dir, case["id"], level)
    if authored and authored.get("steps"):
        return list(authored["steps"])
    truth = case["clinicalTruth"]
    patient = case["simulatedPatient"]
    facility = case.get("facilityLevel", "HC III")
    steps: list[dict[str, Any]] = []

    steps.append(
        {
            "kind": "story",
            "chart": {
                "tag": "TRIAGE",
                "sections": [
                    {
                        "type": "chiefComplaint",
                        "title": "Chief complaint",
                        "text": truth.get("chiefComplaint", case["title"]),
                        "chips": ["Walk-in", facility],
                    }
                ],
            },
            "coach": {
                "eyebrow": "The visit begins",
                "title": str(patient.get("displayName", "Your next patient")),
                "body": _first_sentence(case.get("narrative", "")),
                "quote": f"“{truth.get('chiefComplaint', case['title'])}.”",
                "teach": {
                    "label": "Clinical framing",
                    "text": case.get("expectedReasoningPath", ["Approach this as an unfolding encounter."])[0],
                },
            },
        }
    )

    danger_signs = list(truth.get("dangerSigns", []))
    if danger_signs:
        steps.append(_danger_sign_decision(truth, danger_signs, rng))

    management = [str(item) for item in truth.get("management", []) if str(item).strip()]
    for index, action in enumerate(management[:3]):
        steps.append(_management_decision(action, truth, index, rng))

    if len(steps) < 3 and truth.get("diagnosis"):
        steps.append(
            _management_decision(
                f"Document working diagnosis: {truth['diagnosis']}",
                truth,
                len(steps),
                rng,
            )
        )

    steps.append(
        {
            "kind": "story",
            "chart": {
                "tag": "COMPLETE",
                "sections": [
                    {
                        "type": "assessment",
                        "title": "Visit summary",
                        "text": str(truth.get("classification") or truth.get("diagnosis", "")),
                        "emphasis": str(truth.get("referralThreshold", "")),
                    }
                ],
            },
            "coach": {
                "eyebrow": "Case complete",
                "title": "Key teaching points",
                "body": " ".join(case.get("teachingPoints", [])[:2]) or "Review the guideline-linked actions you applied.",
                "teach": {
                    "label": "Clinician review",
                    "text": "Use the corrections box below if any step, dose, or referral threshold needs updating before CPD sign-off.",
                },
            },
        }
    )

    return steps


def _danger_sign_decision(truth: dict[str, Any], danger_signs: list[str], rng: random.Random) -> dict[str, Any]:
    correct = "Screen for danger signs before deciding outpatient care or referral."
    distractors = [
        "Start treatment immediately without further assessment.",
        "Send home with paracetamol and review next week.",
        "Order every available test before taking a history.",
    ]
    options = _options(correct, distractors, rng)
    vitals = truth.get("vitals", {})
    vitals_rows = [
        {"label": key.upper()[:4], "value": str(value), "hot": "temp" in key.lower()}
        for key, value in list(vitals.items())[:6]
    ]
    section: dict[str, Any] = {
        "type": "vitals" if vitals_rows else "subjective",
        "title": "Vitals & first look",
        "text": truth.get("chiefComplaint"),
        "danger_signs": danger_signs[:6],
        "reveal_note": "Check each danger sign explicitly.",
    }
    if vitals_rows:
        section["vitals"] = vitals_rows
    return {
        "kind": "decision",
        "chart": {
            "tag": "VITALS",
            "sections": [section],
        },
        "coach": {
            "eyebrow": "Decision · triage",
            "title": "What is your first priority?",
            "body": "Before tests or treatment, decide whether this patient is safe for outpatient care.",
        },
        "question": {
            "prompt": "What should you do first?",
            "options": options,
            "right": "Danger signs decide the setting of care — screen before you treat or refer.",
            "wrong": "Start with danger-sign screening. Treatment or discharge without it risks missing urgent referral.",
        },
    }


def _management_decision(action: str, truth: dict[str, Any], index: int, rng: random.Random) -> dict[str, Any]:
    do_not = [str(item) for item in truth.get("doNotDo", []) if str(item).strip()]
    differentials = [str(item) for item in truth.get("differentials", []) if str(item).strip()]
    distractors = (do_not + differentials + list(truth.get("management", [])))[:6]
    distractors = [item for item in distractors if item != action]
    options = _options(action, distractors, rng)
    tag = ("HISTORY", "ORDERS", "PLAN")[min(index, 2)]
    return {
        "kind": "decision",
        "chart": {
            "tag": tag,
            "sections": [
                {
                    "type": "assessment",
                    "title": "Working assessment",
                    "text": str(truth.get("diagnosis", "Clinical encounter in progress")),
                    "emphasis": str(truth.get("classification", "")),
                }
            ],
        },
        "coach": {
            "eyebrow": f"Decision · step {index + 1}",
            "title": "Choose the safest next action",
            "body": "Use Uganda guideline logic for HC III — test, treat, refer, or counsel as appropriate.",
        },
        "question": {
            "prompt": "What is the best next step?",
            "options": options,
            "right": f"Correct: {action}",
            "wrong": "Re-read the chart and choose the action that matches guideline-first HC III practice.",
        },
    }


def _options(correct: str, distractors: list[str], rng: random.Random) -> list[dict[str, Any]]:
    unique_wrong = []
    seen = {correct.strip().lower()}
    for item in distractors:
        key = item.strip().lower()
        if key in seen:
            continue
        seen.add(key)
        unique_wrong.append(item.strip())
    while len(unique_wrong) < 3:
        unique_wrong.append("Defer the decision and send the patient home without documentation.")
    rng.shuffle(unique_wrong)
    options = [{"text": correct, "correct": True}] + [
        {"text": wrong, "correct": False} for wrong in unique_wrong[:3]
    ]
    rng.shuffle(options)
    return options


def _learn_case_id(canonical_id: str, variant_id: str) -> str:
    canonical_slug = canonical_id.removeprefix("hc3-")
    if variant_id.endswith("-level-1"):
        return canonical_slug
    suffix = variant_id.rsplit("-level-", 1)[-1]
    return f"{canonical_slug}-L{suffix}"


def _patient_id(learn_id: str) -> str:
    digits = re.sub(r"[^0-9]", "", learn_id)
    suffix = (digits or "100001")[-6:]
    return f"PT-{suffix}"


def _sex_label(value: Any) -> str | None:
    if value == "female":
        return "Female"
    if value == "male":
        return "Male"
    return None


def _title_case(value: str) -> str:
    return value.replace("_", " ").replace("-", " ").title()


def _first_sentence(text: str) -> str:
    cleaned = str(text).strip()
    if not cleaned:
        return ""
    match = re.split(r"(?<=[.!?])\s+", cleaned, maxsplit=1)
    return match[0]


def _skills_for(case: dict[str, Any]) -> list[str]:
    topic = _title_case(str(case.get("topic", "Clinical reasoning")))
    return [topic, "HC III workflow", "Guideline application"]


def _score(value: Any) -> float | None:
    if value is None:
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    return round(numeric / 100, 2) if numeric > 1 else round(numeric, 2)
