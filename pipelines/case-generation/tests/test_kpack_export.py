import json
import tempfile
import unittest
from pathlib import Path

from karibu_case_generation.export.kpack import export_kpack_directory
from karibu_case_generation.generate.variants import VariantPlan, build_playable_variant
from karibu_case_generation.models import EhrLikeTask, ScoringRule
from test_case_models import make_valid_canonical_case


class KpackExportTest(unittest.TestCase):
    def test_export_kpack_directory_writes_manifest_cases_and_variants(self) -> None:
        case = make_valid_canonical_case()
        variant = build_playable_variant(
            case.id,
            VariantPlan(
                id="malaria-triage-001-level-3",
                label="Level 3",
                difficulty_level=3,
                quest_type="challenge",
                initially_visible=["chief_complaint"],
                hidden_fields={"vitals.temperature": "Learner should request vitals."},
                ehr_tasks=[
                    EhrLikeTask(
                        id="enter-vitals",
                        task_type="enter_vitals",
                        prompt="Enter the patient's vitals.",
                    )
                ],
                scoring_rules=[
                    ScoringRule(
                        id="danger-signs",
                        description="Checks for danger signs.",
                        points=3,
                        citation_ids=["ucg-malaria-danger-signs"],
                    )
                ],
            ),
        )

        with tempfile.TemporaryDirectory() as directory:
            output_dir = Path(directory)
            export_kpack_directory(
                output_dir=output_dir,
                pack_id="hc3-fever-core",
                title="HC III Fever Core",
                version="0.1.0",
                canonical_cases=[case],
                variants=[variant],
            )

            manifest = json.loads((output_dir / "manifest.json").read_text())

            self.assertEqual(manifest["id"], "hc3-fever-core")
            self.assertTrue((output_dir / "cases" / "malaria-triage-001.json").exists())
            self.assertTrue((output_dir / "variants" / "malaria-triage-001-level-3.json").exists())
            self.assertTrue((output_dir / "checksums.json").exists())


if __name__ == "__main__":
    unittest.main()
