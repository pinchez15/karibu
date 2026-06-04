import json
import tempfile
import unittest
from pathlib import Path

from karibu_case_generation.generate.draft_cases import generate_hc3_draft_pack


class DraftGenerationTest(unittest.TestCase):
    def test_generate_hc3_draft_pack_writes_requested_case_count(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output_dir = Path(directory)

            generate_hc3_draft_pack(output_dir, count=3)

            manifest = json.loads((output_dir / "manifest.json").read_text())
            self.assertEqual(len(manifest["cases"]), 3)
            self.assertEqual(len(manifest["variants"]), 9)

    def test_generate_hc3_draft_pack_defaults_to_curriculum_size(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output_dir = Path(directory)

            generate_hc3_draft_pack(output_dir)

            manifest = json.loads((output_dir / "manifest.json").read_text())
            self.assertEqual(len(manifest["cases"]), 100)
            self.assertEqual(len(manifest["variants"]), 300)
            self.assertGreaterEqual(len(manifest["chapters"]), 10)


if __name__ == "__main__":
    unittest.main()
