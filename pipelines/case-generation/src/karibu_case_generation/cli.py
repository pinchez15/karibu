from __future__ import annotations

import argparse
import json
from pathlib import Path

from karibu_case_generation.export.app_kpack import export_app_kpack_file
from karibu_case_generation.export.chapter_packs import export_chapter_packs
from karibu_case_generation.export.review_narratives import load_cases_from_pack, render_review_narratives
from karibu_case_generation.generate.draft_cases import generate_hc3_draft_pack
from karibu_case_generation.ingest.source_registry import validate_source_registry
from karibu_case_generation.review.validators import GENERIC_PHRASES


def main() -> int:
    parser = argparse.ArgumentParser(prog="karibu-casegen")
    subparsers = parser.add_subparsers(dest="command", required=True)

    registry_parser = subparsers.add_parser("validate-registry")
    registry_parser.add_argument(
        "--registry",
        type=Path,
        default=Path("content/medical-corpus/source-registry.json"),
    )
    registry_parser.add_argument("--repo-root", type=Path, default=Path.cwd())
    registry_parser.add_argument("--json", action="store_true")

    generate_parser = subparsers.add_parser("generate-drafts")
    generate_parser.add_argument("--count", type=int, default=100)
    generate_parser.add_argument(
        "--output",
        type=Path,
        default=Path("content/learn/generated/hc3-core-draft-v0.1.0"),
    )

    specificity_parser = subparsers.add_parser("validate-specificity")
    specificity_parser.add_argument(
        "--pack",
        type=Path,
        default=Path("content/learn/generated/hc3-core-draft-v0.1.0"),
    )
    specificity_parser.add_argument("--limit", type=int)
    specificity_parser.add_argument("--json", action="store_true")

    review_parser = subparsers.add_parser("generate-review-narratives")
    review_parser.add_argument(
        "--pack",
        type=Path,
        default=Path("content/learn/generated/hc3-core-draft-v0.1.0"),
    )
    review_parser.add_argument(
        "--output",
        type=Path,
        default=Path("content/learn/review_packets/hc3-core-draft-v0.1.0.md"),
    )
    review_parser.add_argument("--limit", type=int)

    export_parser = subparsers.add_parser(
        "export-app-kpack",
        help="Convert a directory kpack into a single app .kpack file.",
    )
    export_parser.add_argument(
        "--input",
        type=Path,
        default=Path("content/learn/generated/hc3-core-draft-v0.1.0"),
    )
    export_parser.add_argument(
        "--output",
        type=Path,
        default=Path("content/learn/published/hc3-core-draft-v0.1.0.kpack"),
    )
    export_parser.add_argument("--pack-id", default="hc3-core-draft")
    export_parser.add_argument("--title", default="HC III Core Draft")
    export_parser.add_argument("--level", type=int, default=1)
    export_parser.add_argument("--limit", type=int)
    export_parser.add_argument(
        "--stubs-only",
        action="store_true",
        help="Export catalog stubs (ready=false) without auto-compiled steps.",
    )
    export_parser.add_argument(
        "--chapter",
        help="Export only variants for this curriculum chapter id (e.g. fever-malaria-acute-illness).",
    )

    chapter_export_parser = subparsers.add_parser(
        "export-chapter-packs",
        help="Export all curriculum chapter packs (13 chapters × levels) for Supabase Storage.",
    )
    chapter_export_parser.add_argument(
        "--input",
        type=Path,
        default=Path("content/learn/generated/hc3-core-draft-v0.1.0"),
    )
    chapter_export_parser.add_argument(
        "--output",
        type=Path,
        default=Path("content/learn/published/chapters"),
    )
    chapter_export_parser.add_argument(
        "--curriculum",
        type=Path,
        default=Path("content/learn/source/hc3-cpd-curriculum.json"),
    )
    chapter_export_parser.add_argument(
        "--levels",
        default="1,2,3",
        help="Comma-separated difficulty levels to export (default: 1,2,3).",
    )
    chapter_export_parser.add_argument(
        "--stubs-only",
        action="store_true",
        help="Export catalog stubs (ready=false) without auto-compiled steps.",
    )

    args = parser.parse_args()

    if args.command == "validate-registry":
        report = validate_source_registry(args.registry, args.repo_root)
        if args.json:
            print(
                json.dumps(
                    {
                        "valid": report.valid,
                        "issues": [
                            {"path": issue.path, "message": issue.message}
                            for issue in report.issues
                        ],
                    },
                    indent=2,
                )
            )
        elif report.valid:
            print("Source registry is valid.")
        else:
            for issue in report.issues:
                print(f"{issue.path}: {issue.message}")
        return 0 if report.valid else 1

    if args.command == "generate-drafts":
        if args.count < 1:
            parser.error("--count must be at least 1")
        generate_hc3_draft_pack(args.output, count=args.count)
        print(f"Generated {args.count} draft canonical cases into {args.output}")
        return 0

    if args.command == "validate-specificity":
        cases = load_cases_from_pack(args.pack)
        if args.limit is not None:
            cases = cases[: args.limit]
        issues = _specificity_issues_for_payloads(cases)
        if args.json:
            print(json.dumps({"valid": not issues, "issues": issues}, indent=2))
        elif not issues:
            print("All selected cases pass specificity validation.")
        else:
            for issue in issues:
                print(f"{issue['caseId']} {issue['path']}: {issue['message']}")
        return 0 if not issues else 1

    if args.command == "generate-review-narratives":
        cases = load_cases_from_pack(args.pack)
        if args.limit is not None:
            cases = cases[: args.limit]
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(render_review_narratives(cases))
        print(f"Wrote clinician review narratives to {args.output}")
        return 0

    if args.command == "export-app-kpack":
        stats = export_app_kpack_file(
            input_dir=args.input,
            output_path=args.output,
            pack_id=args.pack_id,
            title=args.title,
            difficulty_level=args.level,
            compile_walkable=not args.stubs_only,
            ready=False if args.stubs_only else None,
            limit=args.limit,
            chapter_id=args.chapter,
        )
        print(
            f"Exported {stats['cases']} cases ({stats['walkable']} walkable, {stats['stubs']} stubs) "
            f"to {args.output}"
        )
        return 0

    if args.command == "export-chapter-packs":
        levels = [int(item.strip()) for item in args.levels.split(",") if item.strip()]
        catalog = export_chapter_packs(
            input_dir=args.input,
            output_dir=args.output,
            curriculum_path=args.curriculum,
            levels=levels,
            compile_walkable=not args.stubs_only,
        )
        total_cases = sum(entry["case_count"] for entry in catalog)
        print(f"Exported {len(catalog)} packs ({total_cases} case slots) to {args.output}")
        print(f"Catalog: {args.output / 'pack-catalog.json'}")
        return 0

    parser.error(f"Unknown command: {args.command}")
    return 2


def _specificity_issues_for_payloads(cases: list[dict[str, object]]) -> list[dict[str, str]]:
    issues: list[dict[str, str]] = []
    for case in cases:
        case_id = str(case.get("id", "unknown"))
        truth = case.get("clinicalTruth", {})
        if not isinstance(truth, dict):
            issues.append({"caseId": case_id, "path": "clinicalTruth", "message": "Missing clinical truth."})
            continue
        required = {
            "classification": "Case needs explicit classification.",
            "classificationRationale": "Case needs classification rationale.",
            "guidelineActions": "Case needs source-linked guideline actions.",
            "doNotDo": "Case needs do-not-do items.",
            "documentationRequirements": "Case needs documentation requirements.",
        }
        for key, message in required.items():
            value = truth.get(key)
            if value in ("", None, []) or value == {}:
                issues.append({"caseId": case_id, "path": f"clinicalTruth.{key}", "message": message})
        for path, value in _payload_strings(truth):
            lowered = value.lower()
            for phrase in GENERIC_PHRASES:
                if phrase in lowered:
                    issues.append(
                        {
                            "caseId": case_id,
                            "path": path,
                            "message": f"Generic phrase is not allowed: {phrase}",
                        }
                    )
        if str(case.get("topic")) == "outbreak":
            actions = truth.get("guidelineActions", [])
            first_action = ""
            if isinstance(actions, list) and actions and isinstance(actions[0], dict):
                first_action = str(actions[0].get("action", "")).lower()
            if not any(word in first_action for word in ("screen", "isolate", "isolation", "ipc", "separate")):
                issues.append(
                    {
                        "caseId": case_id,
                        "path": "clinicalTruth.guidelineActions[0]",
                        "message": "Outbreak cases must start with screening/isolation/IPC.",
                    }
                )
    return issues


def _payload_strings(truth: dict[str, object]) -> list[tuple[str, str]]:
    values: list[tuple[str, str]] = []
    for key in ("classification", "diagnosis", "referralThreshold"):
        values.append((f"clinicalTruth.{key}", str(truth.get(key, ""))))
    for key in ("management", "medicines", "followUp", "availableTests", "classificationRationale", "doNotDo", "documentationRequirements", "reviewerQuestions"):
        value = truth.get(key, [])
        if isinstance(value, list):
            for index, item in enumerate(value):
                values.append((f"clinicalTruth.{key}[{index}]", str(item)))
    for key, value in dict(truth.get("vitals", {})).items():
        values.append((f"clinicalTruth.vitals.{key}", str(value)))
    actions = truth.get("guidelineActions", [])
    if isinstance(actions, list):
        for index, action in enumerate(actions):
            if isinstance(action, dict):
                values.append((f"clinicalTruth.guidelineActions[{index}].action", str(action.get("action", ""))))
                values.append((f"clinicalTruth.guidelineActions[{index}].rationale", str(action.get("rationale", ""))))
    return values


if __name__ == "__main__":
    raise SystemExit(main())
