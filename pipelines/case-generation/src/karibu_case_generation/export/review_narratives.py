from __future__ import annotations

import json
from pathlib import Path

from karibu_case_generation.models import CanonicalCase


def write_review_narratives(cases: list[CanonicalCase], output_path: Path, limit: int | None = None) -> None:
    selected = cases[:limit] if limit is not None else cases
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(render_review_narratives(selected))


def load_cases_from_pack(pack_dir: Path) -> list[dict[str, object]]:
    manifest = json.loads((pack_dir / "manifest.json").read_text())
    return [
        json.loads((pack_dir / entry["path"]).read_text())
        for entry in manifest["cases"]
    ]


def render_review_narratives(cases: list[CanonicalCase] | list[dict[str, object]]) -> str:
    lines: list[str] = [
        "# Karibu Learn Clinician Review Packet",
        "",
        "Status: generated draft for clinician review.",
        "",
        "Reviewer instructions:",
        "",
        "- Read each case as if it arrived at an HC III.",
        "- Confirm clinical correctness, realism, referral threshold, and wording.",
        "- Correct any action that does not match Ministry of Health guidance or local workflow.",
        "- These are simulated cases only. Do not add real patient identifiers.",
        "",
    ]
    for raw_case in cases:
        case = _case_dict(raw_case)
        lines.extend(_render_case(case))
    lines.extend(
        [
            "## Review Summary",
            "",
            "```text",
            "Reviewer name:",
            "Role / cadre:",
            "Facility context:",
            "Date:",
            "",
            "Cases approved:",
            "Cases approved with edits:",
            "Cases needing major revision:",
            "",
            "Overall notes:",
            "```",
            "",
        ]
    )
    return "\n".join(lines)


def _case_dict(case: CanonicalCase | dict[str, object]) -> dict[str, object]:
    if isinstance(case, dict):
        return case
    from karibu_case_generation.models import to_dict

    return to_dict(case)


def _render_case(case: dict[str, object]) -> list[str]:
    truth = case["clinicalTruth"]  # type: ignore[index]
    assert isinstance(truth, dict)
    patient = case["simulatedPatient"]  # type: ignore[index]
    assert isinstance(patient, dict)
    title = str(case["title"])
    case_id = str(case["id"])
    lines = [
        f"## {title}",
        "",
        f"Case ID: `{case_id}`",
        "",
        f"Chapter: `{case.get('chapterId', '')}`",
        "",
        f"Patient: {patient.get('ageLabel', 'age not specified')}, {patient.get('sex', 'sex not specified')}",
        "",
        str(case.get("narrative", "")),
        "",
        f"Chief complaint: {truth.get('chiefComplaint', '')}",
        "",
        "Key facts:",
        "",
    ]
    for item in _items(truth.get("history"))[:4]:
        lines.append(f"- {item}")
    for key, value in dict(truth.get("vitals", {})).items():
        lines.append(f"- {key}: {value}")
    for item in _items(truth.get("examFindings"))[:4]:
        lines.append(f"- Exam: {item}")
    lines.extend(["", f"Classification: {truth.get('classification', '')}", "", "Why this classification fits:", ""])
    for item in _items(truth.get("classificationRationale")):
        lines.append(f"- {item}")
    lines.extend(["", "Expected actions:", ""])
    for action in _items(truth.get("guidelineActions")):
        if isinstance(action, dict):
            confidence = action.get("confidence", "")
            lines.append(f"- {action.get('action', '')} ({action.get('category', '')}; {confidence})")
            lines.append(f"  Rationale: {action.get('rationale', '')}")
    lines.extend(["", "Do not do:", ""])
    for item in _items(truth.get("doNotDo")):
        lines.append(f"- {item}")
    lines.extend(["", "Document:", ""])
    for item in _items(truth.get("documentationRequirements")):
        lines.append(f"- {item}")
    lines.extend(["", "Reviewer questions:", ""])
    for item in _items(truth.get("reviewerQuestions")):
        lines.append(f"- {item}")
    lines.extend(
        [
            "",
            "Reviewer decision:",
            "",
            "```text",
            "[ ] Approve",
            "[ ] Approve with edits",
            "[ ] Needs major revision",
            "",
            "Clinical notes:",
            "```",
            "",
        ]
    )
    return lines


def _items(value: object) -> list[object]:
    if isinstance(value, list):
        return value
    return []
