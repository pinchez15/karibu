from pathlib import Path
import unittest

from karibu_case_generation.ingest.source_registry import load_source_registry, validate_source_registry


class SourceRegistryTest(unittest.TestCase):
    def test_source_registry_loads_current_documents(self) -> None:
        registry = Path("content/medical-corpus/source-registry.json")

        documents = load_source_registry(registry)

        self.assertGreaterEqual(
            {document.id for document in documents},
            {
                "uganda-clinical-guidelines-2023",
                "uganda-essential-medicines-list-2023",
                "uganda-hiv-aids-consolidated-guidelines-2023",
                "who-imnci-chart-booklet",
            },
        )

    def test_source_registry_checksums_are_valid_for_local_sources(self) -> None:
        registry = Path("content/medical-corpus/source-registry.json")

        report = validate_source_registry(registry, Path.cwd())

        self.assertTrue(report.valid, [f"{issue.path}: {issue.message}" for issue in report.issues])


if __name__ == "__main__":
    unittest.main()
