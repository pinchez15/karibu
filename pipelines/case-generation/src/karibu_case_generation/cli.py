from __future__ import annotations

import argparse
import json
from pathlib import Path

from karibu_case_generation.generate.draft_cases import generate_hc3_draft_pack
from karibu_case_generation.ingest.source_registry import validate_source_registry


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
    generate_parser.add_argument("--count", type=int, default=10)
    generate_parser.add_argument(
        "--output",
        type=Path,
        default=Path("content/learn/generated/hc3-core-draft-v0.1.0"),
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

    parser.error(f"Unknown command: {args.command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
