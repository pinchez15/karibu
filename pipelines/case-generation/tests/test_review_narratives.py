import unittest

from karibu_case_generation.export.review_narratives import render_review_narratives
from karibu_case_generation.generate.draft_cases import _draft_cases
from karibu_case_generation.models import to_dict


class ReviewNarrativesTest(unittest.TestCase):
    def test_review_packet_includes_signoff_sections(self) -> None:
        cases = [to_dict(case) for case in _draft_cases()[:2]]

        packet = render_review_narratives(cases)

        self.assertIn("# Karibu Learn Clinician Review Packet", packet)
        self.assertIn("Reviewer decision:", packet)
        self.assertIn("Classification:", packet)
        self.assertIn("Expected actions:", packet)
        self.assertIn("Do not do:", packet)


if __name__ == "__main__":
    unittest.main()
