from __future__ import annotations

from dataclasses import replace

from karibu_case_generation.models import ClinicalTruth, GuidelineAction


def enrich_case_truth(case_id: str, topic: str, truth: ClinicalTruth, guideline_ids: list[str]) -> ClinicalTruth:
    """Add structured, reviewable clinical actions to a draft case.

    This is intentionally deterministic. It should not invent hidden facts; when a
    precise local-protocol point still needs clinician confirmation, the action is
    explicit and marked for review.
    """

    source_id = guideline_ids[0] if guideline_ids else "unknown-source"
    bundle = _specific_bundle(case_id, topic, truth, source_id)
    if bundle is None:
        bundle = _fallback_bundle(topic, truth, source_id)
    return replace(
        truth,
        classification=bundle["classification"],
        classification_rationale=bundle["classification_rationale"],
        guideline_actions=bundle["guideline_actions"],
        contraindication_checks=bundle["contraindication_checks"],
        do_not_do=bundle["do_not_do"],
        documentation_requirements=bundle["documentation_requirements"],
        reviewer_questions=bundle["reviewer_questions"],
    )


def _action(
    category: str,
    action: str,
    rationale: str,
    source_document_id: str,
    confidence: str = "source_verified",
    source_section: str | None = None,
) -> GuidelineAction:
    return GuidelineAction(
        category=category,  # type: ignore[arg-type]
        action=action,
        rationale=rationale,
        source_document_id=source_document_id,
        confidence=confidence,  # type: ignore[arg-type]
        source_section=source_section,
    )


def _specific_bundle(case_id: str, topic: str, truth: ClinicalTruth, source_id: str) -> dict[str, object] | None:
    if case_id == "hc3-fever-malaria-triage-001":
        return {
            "classification": "Uncomplicated malaria after positive RDT, absent danger signs, and no pregnancy concern.",
            "classification_rationale": [
                "Fever and headache for three days.",
                "Malaria RDT is the required first test in this scenario.",
                "Patient is alert, able to drink, not persistently vomiting, and has no respiratory distress.",
                "Adult weight is above 35 kg and pregnancy is denied in the review scenario.",
            ],
            "guideline_actions": [
                _action("triage", "Screen for severe malaria danger signs before outpatient treatment.", "Danger signs change this from outpatient malaria care to urgent referral.", source_id, source_section="Malaria assessment and treatment"),
                _action("test", "Perform malaria RDT before giving antimalarial treatment.", "Testing distinguishes malaria from other common causes of fever.", source_id, source_section="Malaria assessment and treatment"),
                _action("medicine", "If RDT is positive and artemether-lumefantrine is first-line locally, give the adult/greater-than-35-kg course: 4 tablets twice daily for 3 days.", "The patient is an adult with no danger signs and weight above 35 kg.", "uganda-essential-medicines-list-2023", source_section="Antimalarial medicines"),
                _action("counseling", "Advise fluids, adherence to the full ACT course, food with doses if possible, and urgent return for danger signs.", "Counseling prevents incomplete treatment and delayed escalation.", source_id),
            ],
            "contraindication_checks": ["Pregnancy status", "Known allergy to planned antimalarial", "Severe malaria danger signs"],
            "do_not_do": ["Do not give antimalarial treatment before danger-sign screening.", "Do not treat a negative RDT as malaria without reassessing other causes."],
            "documentation_requirements": ["RDT result", "Danger signs checked and absent", "Pregnancy status", "Medicine and dose given", "Return precautions"],
            "reviewer_questions": ["Confirm the current first-line ACT and adult dose used in the target districts."],
        }
    if case_id == "hc3-child-diarrhoea-dehydration-001":
        return {
            "classification": "Diarrhoea with some dehydration.",
            "classification_rationale": [
                "Restless and irritable.",
                "Sunken eyes.",
                "Drinks eagerly.",
                "Skin pinch returns slowly.",
                "Not lethargic or unconscious and not unable to drink.",
            ],
            "guideline_actions": [
                _action("treatment", "Give ORS Plan B at 75 ml/kg over 4 hours: 750 ml over 4 hours for this 10 kg child.", "IMNCI Plan B applies to some dehydration.", source_id, source_section="IMNCI diarrhoea dehydration classification"),
                _action("medicine", "Give zinc 20 mg once daily for 10-14 days.", "The child is 18 months old, so the over-6-month zinc dose applies.", source_id, source_section="IMNCI diarrhoea dehydration classification"),
                _action("follow_up", "Reassess after 4 hours and reclassify hydration status.", "Response to rehydration determines the next plan.", source_id),
                _action("counseling", "Teach caregiver ORS mixing/use, continued feeding, and immediate return signs.", "Caregiver counseling is part of diarrhoea management.", source_id),
            ],
            "contraindication_checks": ["Unable to drink", "Lethargy or unconsciousness", "Shock", "Blood in stool"],
            "do_not_do": ["Do not prescribe only medicine without dehydration classification.", "Do not send home before the 4-hour Plan B reassessment."],
            "documentation_requirements": ["Weight 10 kg", "Dehydration signs", "ORS volume planned/given", "Zinc dose", "4-hour reassessment result"],
            "reviewer_questions": ["Confirm ORS Plan B volume and zinc duration used in current local practice."],
        }
    if case_id == "hc3-anc-hypertension-danger-signs-001":
        return {
            "classification": "Pre-eclampsia concern requiring same-day urgent referral.",
            "classification_rationale": [
                "Pregnant at about 32 weeks.",
                "Repeated blood pressure around 156/102 mmHg.",
                "Headache and blurred vision.",
                "Urine protein testing is needed and should be documented when available.",
            ],
            "guideline_actions": [
                _action("triage", "Repeat and confirm the high blood pressure with correct cuff technique and rest.", "A confirmed elevated BP changes ANC from routine to urgent assessment.", source_id, source_section="Hypertension in pregnancy and referral"),
                _action("test", "Check urine protein immediately if available.", "Proteinuria supports pre-eclampsia classification and referral communication.", source_id, source_section="Hypertension in pregnancy and referral"),
                _action("referral", "Keep under observation and arrange same-day urgent referral for maternal assessment.", "Headache/visual symptoms with hypertension in pregnancy exceed routine HC III ANC follow-up.", source_id, source_section="Hypertension in pregnancy and referral"),
                _action("treatment", "Follow facility pre-referral maternal emergency protocol for magnesium sulfate and antihypertensive use.", "Exact medication threshold should be confirmed by local maternal protocol.", source_id, confidence="needs_clinician_confirmation", source_section="Hypertension in pregnancy and referral"),
            ],
            "contraindication_checks": ["Convulsions", "Severe-range BP", "Vaginal bleeding", "Reduced fetal movement", "Medicine contraindications in local protocol"],
            "do_not_do": ["Do not reassure and send home for next ANC visit.", "Do not delay referral waiting for perfect diagnostics."],
            "documentation_requirements": ["Gestational age", "Repeat BP readings", "Headache and visual symptoms", "Urine protein result", "Fetal assessment if done", "Pre-referral actions"],
            "reviewer_questions": ["For this BP/symptom/proteinuria scenario, confirm MgSO4 and antihypertensive pre-referral threshold at HC III."],
        }
    if case_id == "hc3-adult-cough-tb-screen-001":
        return {
            "classification": "Presumptive pulmonary TB requiring same-day diagnostic evaluation.",
            "classification_rationale": [
                "Cough has lasted three weeks.",
                "Night sweats are present.",
                "Recent weight loss is present.",
                "No severe respiratory distress or haemoptysis in this scenario.",
            ],
            "guideline_actions": [
                _action("ipc", "Move out of a crowded indoor queue if possible, use cough etiquette, and assess in a well-ventilated area.", "Presumptive TB patients should be identified promptly and exposure reduced.", source_id, source_section="TB infection prevention and control"),
                _action("test", "Collect sputum today for district GeneXpert testing through sample transport.", "Presumptive pulmonary TB requires bacteriologic evaluation through the local diagnostic pathway.", source_id, source_section="TB symptom screening and diagnosis"),
                _action("test", "Offer HIV testing today if status is unknown, with consent and privacy.", "TB and HIV services are integrated in national guidance.", "uganda-hiv-aids-consolidated-guidelines-2023", source_section="TB/HIV integration"),
                _action("follow_up", "Give a clear return date for results and record a working phone contact.", "Diagnostic evaluation fails if the patient cannot receive results and linkage.", source_id),
            ],
            "contraindication_checks": ["Haemoptysis", "Severe respiratory distress", "Very ill appearance", "Unable to eat or drink"],
            "do_not_do": ["Do not give only cough syrup or antibiotics and send away.", "Do not start TB treatment casually without following the diagnostic pathway."],
            "documentation_requirements": ["Cough duration", "Night sweats", "Weight loss", "Sputum sample collected or referral made", "HIV test offer/status", "Return date and phone contact"],
            "reviewer_questions": ["Confirm whether target HC III sites collect sputum onsite, refer to a hub, or use sample transport."],
        }
    if case_id == "hc3-ebola-fever-bleeding-travel-001":
        return {
            "classification": "Suspected Ebola or viral haemorrhagic fever at screening.",
            "classification_rationale": [
                "Fever during known Ebola alert.",
                "Unexplained bleeding from gums.",
                "Vomiting and severe weakness.",
                "Recent travel/contact exposure through burial attendance in an affected district.",
            ],
            "guideline_actions": [
                _action("ipc", "Identify as suspected Ebola/VHF at screening before registration or routine consultation.", "Outbreak screening should occur before normal waiting-room flow.", source_id, source_section="VHF screening and IPC"),
                _action("ipc", "Keep distance, avoid direct contact, give mask if tolerated, and move by safest route to designated isolation/holding area.", "Immediate isolation reduces exposure to staff and other patients.", source_id, source_section="VHF screening and IPC"),
                _action("referral", "Notify the district/outbreak response pathway immediately.", "Suspected VHF requires public health notification and coordinated transfer/testing.", source_id, source_section="VHF notification"),
                _action("documentation", "Record staff/attendants with close contact without public disclosure or panic.", "Contact documentation supports outbreak response while protecting confidentiality.", source_id),
            ],
            "contraindication_checks": ["Unprotected direct contact", "Routine lab queue", "Crowded waiting area", "Nonessential physical exam"],
            "do_not_do": ["Do not sit with the patient for a normal consultation.", "Do not send the patient through routine outpatient lab flow.", "Do not perform unnecessary physical examination before IPC is in place."],
            "documentation_requirements": ["Screening symptoms", "Travel/contact exposure", "Isolation time/location", "Notification pathway used", "Close contacts already exposed"],
            "reviewer_questions": ["Confirm current Ministry of Health screening wording, PPE process, isolation setup, notification pathway, and safe transport language."],
        }
    return None


def _fallback_bundle(topic: str, truth: ClinicalTruth, source_id: str) -> dict[str, object]:
    classification = truth.diagnosis.strip() or f"{topic.replace('_', ' ')} presentation requiring HC III assessment"
    threshold = truth.referral_threshold.strip() or "Escalate if danger signs or instability are present."
    first_action = _action(
        "triage",
        f"Assess immediate stability and danger signs for this {topic.replace('_', ' ')} presentation.",
        "The case must establish whether HC III outpatient care is safe before treatment.",
        source_id,
        confidence="needs_clinician_confirmation",
    )
    if topic == "outbreak":
        first_action = _action(
            "ipc",
            "Screen at the clinic entrance, separate the patient from the routine queue, and use the facility IPC pathway.",
            "Suspected outbreak presentations can expose staff and patients before a normal consultation begins.",
            source_id,
            confidence="needs_clinician_confirmation",
        )
    return {
        "classification": classification,
        "classification_rationale": [
            truth.chief_complaint,
            *truth.history[:2],
            *truth.exam_findings[:2],
        ],
        "guideline_actions": [
            first_action,
            _action("referral", threshold, "The referral threshold is part of the case truth and must be confirmed by a clinician reviewer.", source_id, confidence="needs_clinician_confirmation"),
            _action("documentation", "Document the key positive findings, absent danger signs, decision, counseling, and referral or follow-up plan.", "Documentation is required for safe simulated chart practice.", source_id, confidence="needs_clinician_confirmation"),
        ],
        "contraindication_checks": truth.danger_signs[:4] or ["Instability", "Danger signs"],
        "do_not_do": ["Do not treat this as a routine case until danger signs and referral threshold are checked."],
        "documentation_requirements": ["Chief complaint", "Focused history", "Vitals", "Exam findings", "Decision and follow-up plan"],
        "reviewer_questions": ["Replace this generated action bundle with topic-specific Ministry of Health guidance before publication."],
    }
