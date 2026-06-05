import unittest

from karibu_case_generation.generate.draft_cases import _draft_cases
from karibu_case_generation.review.validators import validate_case_specificity


class SpecificityValidationTest(unittest.TestCase):
    def test_tb_exemplar_passes_specificity_validation(self) -> None:
        case = _case_by_id("hc3-adult-cough-tb-screen-001")

        report = validate_case_specificity(case)

        self.assertTrue(report.valid, report.issues)
        actions = [action.action for action in case.clinical_truth.guideline_actions]
        self.assertTrue(any("GeneXpert" in action for action in actions))
        self.assertTrue(any("HIV testing" in action for action in actions))

    def test_child_diarrhoea_exemplar_has_weight_based_ors_and_zinc(self) -> None:
        case = _case_by_id("hc3-child-diarrhoea-dehydration-001")

        report = validate_case_specificity(case)

        self.assertTrue(report.valid, report.issues)
        actions = " ".join(action.action for action in case.clinical_truth.guideline_actions)
        self.assertIn("750 ml over 4 hours", actions)
        self.assertIn("zinc 20 mg once daily", actions)

    def test_ebola_exemplar_starts_with_screening_or_ipc(self) -> None:
        case = _case_by_id("hc3-ebola-fever-bleeding-travel-001")

        report = validate_case_specificity(case)

        self.assertTrue(report.valid, report.issues)
        first_action = case.clinical_truth.guideline_actions[0].action.lower()
        self.assertTrue(any(word in first_action for word in ("screen", "isolate", "isolation", "ipc", "separate")))

    def test_compact_cases_do_not_use_variable_vitals(self) -> None:
        compact_case = _case_by_id("hc3-ebola-vomiting-at-triage-001")

        report = validate_case_specificity(compact_case)

        self.assertTrue(report.valid, report.issues)
        self.assertNotIn("varies", " ".join(compact_case.clinical_truth.vitals.values()).lower())
        self.assertEqual(compact_case.clinical_truth.guideline_actions[0].confidence, "needs_clinician_confirmation")


def _case_by_id(case_id: str):
    for case in _draft_cases():
        if case.id == case_id:
            return case
    raise AssertionError(f"Missing case: {case_id}")


if __name__ == "__main__":
    unittest.main()
