from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from karibu_case_generation.export.app_kpack import export_app_kpack_file, load_directory_pack
from karibu_case_generation.export.kpack import export_kpack_directory
from karibu_case_generation.generate.variants import VariantPlan, build_playable_variant
from test_case_models import make_valid_canonical_case


class AppKpackExportTest(unittest.TestCase):
    def test_export_app_kpack_file_writes_walkable_learn_cases(self) -> None:
        case = make_valid_canonical_case()
        variant = build_playable_variant(
            case.id,
            VariantPlan(
                id="malaria-triage-001-level-1",
                label="Level 1",
                difficulty_level=1,
                quest_type="core_practice",
                initially_visible=["chief_complaint"],
                hidden_fields={},
                ehr_tasks=[],
                scoring_rules=[],
            ),
        )

        with tempfile.TemporaryDirectory() as directory:
            pack_dir = Path(directory) / "draft"
            export_kpack_directory(
                output_dir=pack_dir,
                pack_id="hc3-fever-core",
                title="HC III Fever Core",
                version="0.1.0",
                canonical_cases=[case],
                variants=[variant],
            )

            output = Path(directory) / "core.kpack"
            stats = export_app_kpack_file(
                input_dir=pack_dir,
                output_path=output,
                pack_id="hc3-fever-core",
                title="HC III Fever Core",
                difficulty_level=1,
                compile_walkable=True,
            )

            payload = json.loads(output.read_text())
            self.assertEqual(stats["cases"], 1)
            self.assertEqual(stats["walkable"], 1)
            self.assertEqual(payload["id"], "hc3-fever-core")
            learn_case = payload["cases"][0]
            self.assertTrue(learn_case["ready"])
            self.assertGreaterEqual(len(learn_case["steps"]), 3)
            self.assertTrue(learn_case["patient"]["id"].startswith("PT-"))
            self.assertEqual(learn_case["level"], 1)

    def test_load_directory_pack_reads_manifest(self) -> None:
        case = make_valid_canonical_case()
        with tempfile.TemporaryDirectory() as directory:
            pack_dir = Path(directory)
            export_kpack_directory(
                output_dir=pack_dir,
                pack_id="hc3-fever-core",
                title="HC III Fever Core",
                version="0.1.0",
                canonical_cases=[case],
                variants=[],
            )
            manifest, cases, variants = load_directory_pack(pack_dir)
            self.assertEqual(manifest["id"], "hc3-fever-core")
            self.assertEqual(len(cases), 1)
            self.assertEqual(variants, [])


if __name__ == "__main__":
    unittest.main()
