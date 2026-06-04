from __future__ import annotations

import hashlib
import json
from pathlib import Path

from karibu_case_generation.models import CanonicalCase, PlayableCaseVariant, to_dict
from karibu_case_generation.review.validators import validate_canonical_case, validate_playable_variant


def export_kpack_directory(
    output_dir: Path,
    pack_id: str,
    title: str,
    version: str,
    canonical_cases: list[CanonicalCase],
    variants: list[PlayableCaseVariant],
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    cases_dir = output_dir / "cases"
    variants_dir = output_dir / "variants"
    cases_dir.mkdir(exist_ok=True)
    variants_dir.mkdir(exist_ok=True)

    for case in canonical_cases:
        validate_canonical_case(case).raise_for_issues()

    cases_by_id = {case.id: case for case in canonical_cases}
    for variant in variants:
        case = cases_by_id.get(variant.canonical_case_id)
        if case is None:
            raise ValueError(f"Variant {variant.id} references unknown canonical case {variant.canonical_case_id}.")
        validate_playable_variant(case, variant).raise_for_issues()

    written_files: list[Path] = []
    for case in canonical_cases:
        path = cases_dir / f"{case.id}.json"
        _write_json(path, to_dict(case))
        written_files.append(path)

    for variant in variants:
        path = variants_dir / f"{variant.id}.json"
        _write_json(path, to_dict(variant))
        written_files.append(path)

    checksums = {
        str(path.relative_to(output_dir)): _sha256(path)
        for path in sorted(written_files)
    }

    manifest = {
        "id": pack_id,
        "title": title,
        "version": version,
        "schemaVersion": "0.1.0",
        "chapters": _chapters_for(canonical_cases),
        "cases": [
            {
                "id": case.id,
                "chapterId": case.chapter_id,
                "path": f"cases/{case.id}.json",
                "checksum": checksums[f"cases/{case.id}.json"],
            }
            for case in canonical_cases
        ],
        "variants": [
            {
                "id": variant.id,
                "canonicalCaseId": variant.canonical_case_id,
                "path": f"variants/{variant.id}.json",
                "checksum": checksums[f"variants/{variant.id}.json"],
            }
            for variant in variants
        ],
    }
    _write_json(output_dir / "manifest.json", manifest)
    _write_json(output_dir / "checksums.json", checksums)


def _chapters_for(cases: list[CanonicalCase]) -> list[dict[str, object]]:
    chapters: dict[str, int] = {}
    for case in cases:
        chapters[case.chapter_id] = chapters.get(case.chapter_id, 0) + 1
    return [
        {
            "id": chapter_id,
            "title": chapter_id.replace("-", " ").title(),
            "caseCount": count,
        }
        for chapter_id, count in sorted(chapters.items())
    ]


def _write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()
