import unittest

from karibu_case_generation.generate.variants import VariantPlan, build_playable_variant
from karibu_case_generation.models import (
    CanonicalCase,
    CaseScores,
    Citation,
    ClinicalTruth,
    CredentialingMetadata,
    EhrLikeTask,
    GuidelineAction,
    ScoringRule,
    ShareMetadata,
    SimulatedPatient,
    to_dict,
)
from karibu_case_generation.review.validators import (
    validate_canonical_case,
    validate_case_specificity,
    validate_playable_variant,
)


def make_valid_canonical_case() -> CanonicalCase:
    citation = Citation(
        id="ucg-malaria-danger-signs",
        source_document_id="uganda-clinical-guidelines-2023",
        title="Uganda Clinical Guidelines 2023",
        section="Malaria",
    )
    return CanonicalCase(
        id="malaria-triage-001",
        title="Fever with danger-sign triage",
        narrative="A patient arrives at a busy HC III with fever while the clinician is deciding who needs urgent assessment first.",
        chapter_id="fever-malaria-acute-illness",
        source_type="generated_guideline",
        facility_level="HC III",
        topic="malaria",
        simulated_patient=SimulatedPatient(
            display_name="Simulated Patient",
            age_label="24 years",
            sex="female",
        ),
        clinical_truth=ClinicalTruth(
            chief_complaint="Fever and headache",
            history=["Three days of fever", "No known drug allergy"],
            review_of_systems=["No cough", "No dysuria"],
            vitals={"temperature": "38.8 C", "pulse": "104 bpm"},
            exam_findings=["Alert", "No neck stiffness"],
            available_tests=["Malaria RDT"],
            diagnosis="Suspected uncomplicated malaria",
            differentials=["Viral illness", "Urinary tract infection"],
            management=["Test with malaria RDT", "Treat confirmed uncomplicated malaria with adult ACT dosing"],
            referral_threshold="Refer if danger signs are present.",
            medicines=["Artemether-lumefantrine adult course if RDT positive and no contraindication"],
            follow_up=["Return if worsening or danger signs develop"],
            danger_signs=["Altered mental status", "Unable to drink"],
            classification="Suspected uncomplicated malaria pending RDT",
            classification_rationale=["Fever without danger signs", "Adult patient with malaria test available"],
            guideline_actions=[
                GuidelineAction(
                    category="test",
                    action="Perform malaria RDT before antimalarial treatment.",
                    rationale="The case has fever and malaria testing is available at HC III.",
                    source_document_id="uganda-clinical-guidelines-2023",
                    confidence="source_verified",
                )
            ],
            contraindication_checks=["Pregnancy", "Drug allergy", "Severe malaria danger signs"],
            do_not_do=["Do not give antimalarial treatment before danger-sign screening."],
            documentation_requirements=["RDT result", "Danger signs checked", "Medicine and dose"],
        ),
        expected_reasoning_path=["Assess danger signs", "Confirm malaria where possible"],
        teaching_points=["Danger signs change management and referral threshold."],
        citations=[citation],
        scores=CaseScores(
            clinical_correctness=90,
            hc3_reality=85,
            learning_value=80,
            complexity=35,
        ),
        share_metadata=ShareMetadata(
            title="Fever triage challenge",
            prompt="What would you do first?",
            summary="Practice danger-sign triage for fever.",
            discussion_question="Which danger signs would make you refer?",
        ),
        credentialing_metadata=CredentialingMetadata(
            learning_objectives=["Identify danger signs in fever."],
            estimated_duration_minutes=6,
            assessment_mode="practice",
        ),
        source_guideline_ids=["uganda-clinical-guidelines-2023"],
    )


class CaseModelTest(unittest.TestCase):
    def test_valid_canonical_case_passes_validation(self) -> None:
        case = make_valid_canonical_case()

        report = validate_canonical_case(case)

        self.assertTrue(report.valid, report.issues)

    def test_specificity_validation_rejects_generic_language(self) -> None:
        case = make_valid_canonical_case()
        truth = case.clinical_truth
        truth.management[1] = "Treat according to local guidance if appropriate"

        report = validate_case_specificity(case)

        self.assertFalse(report.valid)
        self.assertTrue(any("Generic phrase" in issue.message for issue in report.issues))

    def test_variant_level_three_requires_reveals_and_tasks(self) -> None:
        case = make_valid_canonical_case()
        variant = build_playable_variant(
            case.id,
            VariantPlan(
                id="malaria-triage-001-level-3",
                label="Level 3",
                difficulty_level=3,
                quest_type="challenge",
                initially_visible=["chief_complaint"],
                hidden_fields={
                    "vitals.temperature": "Learner should request vitals before deciding management.",
                    "history[0]": "Learner should ask duration of fever.",
                },
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
                        description="Checks for danger signs before treatment decision.",
                        points=3,
                        citation_ids=["ucg-malaria-danger-signs"],
                    )
                ],
            ),
        )

        report = validate_playable_variant(case, variant)

        self.assertTrue(report.valid, report.issues)
        self.assertGreater(variant.scores.complexity, case.scores.complexity)

    def test_case_serializes_to_pack_field_names(self) -> None:
        case = make_valid_canonical_case()

        payload = to_dict(case)

        self.assertEqual(payload["sourceType"], "generated_guideline")
        self.assertEqual(payload["facilityLevel"], "HC III")
        self.assertEqual(payload["chapterId"], "fever-malaria-acute-illness")
        self.assertTrue(payload["narrative"].startswith("A patient arrives"))
        self.assertEqual(payload["clinicalTruth"]["chiefComplaint"], "Fever and headache")


if __name__ == "__main__":
    unittest.main()
