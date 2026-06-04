from __future__ import annotations

import hashlib
import json
from pathlib import Path

from karibu_case_generation.models import SourceDocument
from karibu_case_generation.review.validators import ValidationIssue, ValidationReport


def load_source_registry(path: Path) -> list[SourceDocument]:
    payload = json.loads(path.read_text())
    documents = payload.get("documents", [])
    return [
        SourceDocument(
            id=item["id"],
            title=item["title"],
            source_org=item["sourceOrg"],
            source_year=item["sourceYear"],
            official_url=item["officialUrl"],
            local_path=item["localPath"],
            sha256=item["sha256"],
            jurisdiction=item["jurisdiction"],
            topics=list(item["topics"]),
            facility_levels=list(item["facilityLevels"]),
            review_status=item["reviewStatus"],
        )
        for item in documents
    ]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_source_registry(registry_path: Path, repo_root: Path) -> ValidationReport:
    issues: list[ValidationIssue] = []
    documents = load_source_registry(registry_path)
    seen_ids: set[str] = set()

    for index, document in enumerate(documents):
        prefix = f"documents[{index}]"
        if document.id in seen_ids:
            issues.append(ValidationIssue(f"{prefix}.id", f"Duplicate source id: {document.id}"))
        seen_ids.add(document.id)

        if document.review_status != "source_verified":
            issues.append(
                ValidationIssue(
                    f"{prefix}.reviewStatus",
                    "Source documents must be source_verified before generation.",
                )
            )

        local_path = repo_root / document.local_path
        if not local_path.exists():
            issues.append(ValidationIssue(f"{prefix}.localPath", f"Missing source file: {local_path}"))
            continue

        actual = sha256_file(local_path)
        if actual != document.sha256:
            issues.append(
                ValidationIssue(
                    f"{prefix}.sha256",
                    f"Checksum mismatch for {document.id}: expected {document.sha256}, got {actual}",
                )
            )

    return ValidationReport(valid=not issues, issues=issues)
