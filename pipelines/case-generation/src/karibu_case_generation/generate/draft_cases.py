from __future__ import annotations

from pathlib import Path

from karibu_case_generation.export.kpack import export_kpack_directory
from karibu_case_generation.generate.variants import VariantPlan, build_playable_variant
from karibu_case_generation.models import (
    CanonicalCase,
    CaseScores,
    Citation,
    ClinicalTruth,
    CredentialingMetadata,
    EhrLikeTask,
    PlayableCaseVariant,
    ScoringRule,
    ShareMetadata,
    SimulatedPatient,
)


def generate_hc3_draft_pack(output_dir: Path, count: int = 10) -> None:
    cases = _draft_cases()[:count]
    variants: list[PlayableCaseVariant] = []
    for case in cases:
        variants.extend(_variants_for_case(case))

    export_kpack_directory(
        output_dir=output_dir,
        pack_id="hc3-core-draft",
        title="HC III Core Practice Draft",
        version="0.1.0",
        canonical_cases=cases,
        variants=variants,
    )


def _draft_cases() -> list[CanonicalCase]:
    return [
        _case(
            case_id="hc3-fever-malaria-triage-001",
            title="Fever with malaria triage",
            topic="malaria",
            patient=SimulatedPatient("Simulated adult patient", "24 years", "female"),
            truth=ClinicalTruth(
                chief_complaint="Fever and headache for three days",
                history=[
                    "Fever started three days ago and has been intermittent.",
                    "No convulsions, confusion, or inability to drink reported.",
                    "No known drug allergy.",
                ],
                review_of_systems=["No cough", "No dysuria", "No neck stiffness"],
                vitals={"temperature": "38.8 C", "pulse": "104 bpm", "bp": "112/70 mmHg", "respiratory_rate": "20/min"},
                exam_findings=["Alert and able to drink", "No jaundice", "No respiratory distress"],
                available_tests=["Malaria RDT"],
                diagnosis="Suspected uncomplicated malaria pending test confirmation",
                differentials=["Viral febrile illness", "Urinary tract infection", "Typhoid-like illness"],
                management=[
                    "Assess for danger signs before outpatient treatment.",
                    "Use available malaria testing where possible.",
                    "Treat confirmed uncomplicated malaria according to Uganda guidance and local stock availability.",
                ],
                referral_threshold="Refer urgently if severe malaria features or other danger signs are present.",
                medicines=["Artemisinin-based combination therapy if confirmed and clinically appropriate"],
                follow_up=["Return urgently if confusion, convulsions, inability to drink, persistent vomiting, or worsening fever develops."],
                danger_signs=["Convulsions", "Altered mental status", "Unable to drink", "Persistent vomiting", "Respiratory distress"],
            ),
            teaching_points=[
                "Fever management starts with danger-sign screening, not automatic outpatient treatment.",
                "Testing helps distinguish malaria from other common causes of fever.",
            ],
            guideline_ids=["uganda-clinical-guidelines-2023", "uganda-essential-medicines-list-2023"],
            citation_topic="Malaria assessment and treatment",
            scores=CaseScores(90, 88, 82, 34),
        ),
        _case(
            case_id="hc3-severe-malaria-referral-001",
            title="Fever with altered mental status",
            topic="malaria",
            patient=SimulatedPatient("Simulated adult patient", "31 years", "male"),
            truth=ClinicalTruth(
                chief_complaint="High fever with confusion",
                history=["Two days of fever", "Family reports the patient became confused this morning", "Unable to take oral fluids reliably"],
                review_of_systems=["No trauma reported", "No known epilepsy history"],
                vitals={"temperature": "39.6 C", "pulse": "122 bpm", "bp": "96/60 mmHg", "respiratory_rate": "28/min"},
                exam_findings=["Drowsy but rousable", "Dry mucous membranes", "No focal injury reported"],
                available_tests=["Malaria RDT", "Blood glucose if available"],
                diagnosis="Suspected severe malaria or other severe febrile illness",
                differentials=["Sepsis", "Meningitis", "Hypoglycaemia", "Severe malaria"],
                management=[
                    "Recognize altered mental status as a danger sign.",
                    "Stabilize according to local protocol and arrange urgent referral.",
                    "Check glucose if available and do not delay referral for advanced diagnostics.",
                ],
                referral_threshold="Altered mental status, inability to drink, shock, convulsions, or respiratory distress require urgent referral.",
                medicines=["Pre-referral treatment per Uganda guidance when available and appropriate"],
                follow_up=["Document pre-referral actions and communicate danger signs to the receiving facility."],
                danger_signs=["Altered mental status", "Unable to drink", "Hypotension", "Respiratory distress"],
            ),
            teaching_points=[
                "Severe malaria is a referral emergency at HC III level.",
                "The key decision is recognizing danger signs and not treating this as routine uncomplicated fever.",
            ],
            guideline_ids=["uganda-clinical-guidelines-2023"],
            citation_topic="Severe malaria danger signs and referral",
            scores=(92, 86, 88, 58),
        ),
        _case(
            case_id="hc3-child-cough-fast-breathing-001",
            title="Child with cough and fast breathing",
            topic="child_health",
            patient=SimulatedPatient("Simulated child patient", "2 years", "female"),
            truth=ClinicalTruth(
                chief_complaint="Cough and fever",
                history=["Cough for four days", "Fever since yesterday", "Still able to drink"],
                review_of_systems=["No convulsions", "No persistent vomiting"],
                vitals={"temperature": "38.2 C", "respiratory_rate": "48/min", "pulse": "118 bpm", "spo2": "Not available"},
                exam_findings=["No chest indrawing", "No stridor at rest", "Alert"],
                available_tests=["None required for initial IMNCI classification if not available"],
                diagnosis="Possible pneumonia classification requiring guideline-based management",
                differentials=["Viral upper respiratory infection", "Pneumonia", "Malaria with cough"],
                management=[
                    "Assess general danger signs.",
                    "Count respiratory rate and assess chest indrawing.",
                    "Classify using IMNCI approach and manage or refer according to severity.",
                ],
                referral_threshold="General danger signs, chest indrawing, stridor at rest, severe respiratory distress, or inability to drink require referral.",
                medicines=["Antibiotic treatment if classified as pneumonia according to IMNCI/Uganda guidance"],
                follow_up=["Counsel caregiver on danger signs and follow-up timing."],
                danger_signs=["Unable to drink", "Convulsions", "Lethargic or unconscious", "Chest indrawing", "Stridor at rest"],
            ),
            teaching_points=[
                "For children with cough, respiratory rate and danger signs drive classification.",
                "A learner should ask age because fast-breathing thresholds are age-dependent.",
            ],
            guideline_ids=["who-imnci-chart-booklet", "uganda-clinical-guidelines-2023"],
            citation_topic="IMNCI cough and difficult breathing",
            scores=(89, 90, 86, 50),
        ),
        _case(
            case_id="hc3-child-diarrhoea-dehydration-001",
            title="Child with diarrhoea and dehydration assessment",
            topic="child_health",
            patient=SimulatedPatient("Simulated child patient", "18 months", "male"),
            truth=ClinicalTruth(
                chief_complaint="Watery diarrhoea",
                history=["Watery stool for two days", "No blood in stool", "Mother reports reduced drinking"],
                review_of_systems=["No convulsions", "No cough"],
                vitals={"temperature": "37.8 C", "pulse": "126 bpm", "respiratory_rate": "30/min", "weight": "10 kg"},
                exam_findings=["Restless and irritable", "Sunken eyes", "Drinks eagerly", "Skin pinch returns slowly"],
                available_tests=["None required for initial dehydration classification"],
                diagnosis="Diarrhoea with dehydration requiring classification and rehydration plan",
                differentials=["Acute watery diarrhoea", "Dysentery if blood present", "Sepsis if danger signs present"],
                management=[
                    "Assess dehydration signs systematically.",
                    "Choose rehydration plan according to classification.",
                    "Check for blood in stool and general danger signs.",
                ],
                referral_threshold="Severe dehydration, lethargy/unconsciousness, inability to drink, or shock require urgent referral or higher-level management.",
                medicines=["ORS and zinc according to age and classification where appropriate"],
                follow_up=["Counsel caregiver on fluids, feeding, and danger signs."],
                danger_signs=["Lethargic or unconscious", "Unable to drink", "Severe dehydration", "Blood in stool"],
            ),
            teaching_points=[
                "The correct task is dehydration classification before treatment selection.",
                "ORS and zinc counseling is part of practical HC III care.",
            ],
            guideline_ids=["who-imnci-chart-booklet", "uganda-clinical-guidelines-2023"],
            citation_topic="IMNCI diarrhoea dehydration classification",
            scores=(88, 91, 84, 46),
        ),
        _case(
            case_id="hc3-anc-hypertension-danger-signs-001",
            title="ANC visit with high blood pressure",
            topic="maternal_anc",
            patient=SimulatedPatient("Simulated pregnant patient", "28 years", "female"),
            truth=ClinicalTruth(
                chief_complaint="Headache during ANC visit",
                history=["Pregnant at about 32 weeks by dates", "Headache since morning", "Reports blurred vision"],
                review_of_systems=["No vaginal bleeding", "No convulsions reported", "No fever"],
                vitals={"bp": "156/102 mmHg", "pulse": "96 bpm", "temperature": "36.9 C", "respiratory_rate": "18/min"},
                exam_findings=["Alert", "No active convulsion", "Mild pedal oedema"],
                available_tests=["Urine protein if available"],
                diagnosis="Hypertension in pregnancy with symptoms concerning for pre-eclampsia",
                differentials=["Gestational hypertension", "Pre-eclampsia", "Severe headache from another cause"],
                management=[
                    "Recognize headache, visual symptoms, and high blood pressure as danger signs.",
                    "Check urine protein if available but do not ignore symptoms.",
                    "Arrange urgent referral according to maternal health guidance.",
                ],
                referral_threshold="Severe hypertension, headache, visual symptoms, convulsions, or suspected pre-eclampsia require urgent referral.",
                medicines=["Pre-referral treatment per local maternal emergency protocol if indicated and available"],
                follow_up=["Communicate BP readings, symptoms, gestational age, and actions taken to receiving facility."],
                danger_signs=["Severe headache", "Blurred vision", "High blood pressure", "Convulsions", "Vaginal bleeding"],
            ),
            teaching_points=[
                "ANC cases require active danger-sign screening, not routine reassurance.",
                "Referral decisions should not wait for perfect diagnostics when danger signs are present.",
            ],
            guideline_ids=["uganda-clinical-guidelines-2023"],
            citation_topic="Hypertension in pregnancy and referral",
            scores=(90, 87, 90, 62),
        ),
        _case(
            case_id="hc3-adult-cough-tb-screen-001",
            title="Adult cough requiring TB screen",
            topic="hiv_tb",
            patient=SimulatedPatient("Simulated adult patient", "42 years", "male"),
            truth=ClinicalTruth(
                chief_complaint="Cough for three weeks",
                history=["Cough has lasted three weeks", "Reports night sweats", "Has lost weight recently", "Smoking history not initially volunteered"],
                review_of_systems=["No severe shortness of breath at rest", "No haemoptysis reported"],
                vitals={"temperature": "37.6 C", "pulse": "92 bpm", "bp": "118/76 mmHg", "respiratory_rate": "22/min"},
                exam_findings=["Thin adult", "No chest indrawing", "Able to speak full sentences"],
                available_tests=["Sputum testing pathway or referral according to local TB diagnostic access", "HIV testing offer according to guidance"],
                diagnosis="Presumptive TB requiring evaluation",
                differentials=["Pulmonary TB", "Viral cough", "Chronic bronchitis/COPD", "Pneumonia"],
                management=[
                    "Ask duration of cough and constitutional symptoms.",
                    "Screen for TB and HIV according to national guidance.",
                    "Arrange sputum testing/referral pathway according to local service availability.",
                ],
                referral_threshold="Severe respiratory distress, danger signs, or inability to complete evaluation safely require urgent referral.",
                medicines=["Do not start TB treatment without following diagnostic pathway unless directed by national protocol."],
                follow_up=["Ensure clear instructions for sputum testing, review, or referral follow-up."],
                danger_signs=["Severe respiratory distress", "Haemoptysis", "Very ill appearance", "Unable to drink/eat"],
            ),
            teaching_points=[
                "Duration of cough changes the clinical path from viral cough to TB screening.",
                "Smoking history may distract, but TB symptoms must not be missed.",
            ],
            guideline_ids=["uganda-hiv-aids-consolidated-guidelines-2023", "uganda-clinical-guidelines-2023"],
            citation_topic="TB symptom screening and HIV/TB integration",
            scores=(86, 89, 88, 66),
        ),
        _case(
            case_id="hc3-hiv-art-continuity-001",
            title="ART continuity after missed refill",
            topic="hiv_tb",
            patient=SimulatedPatient("Simulated adult patient", "36 years", "female"),
            truth=ClinicalTruth(
                chief_complaint="Missed ART refill",
                history=["Known HIV positive", "Missed refill by two weeks after travel", "No current severe illness"],
                review_of_systems=["No cough for more than two weeks", "No fever", "No weight loss reported"],
                vitals={"temperature": "36.8 C", "pulse": "84 bpm", "bp": "110/72 mmHg", "respiratory_rate": "18/min"},
                exam_findings=["Well appearing", "No respiratory distress", "No oral thrush noted"],
                available_tests=["TB symptom screen", "Pregnancy test if clinically relevant", "Viral load review if available"],
                diagnosis="HIV on ART with treatment interruption risk",
                differentials=["Treatment interruption", "Undisclosed side effects", "Access barrier", "TB symptoms if screen positive"],
                management=[
                    "Assess adherence barriers without blame.",
                    "Screen for TB symptoms and side effects.",
                    "Restart/continue ART according to national guidance and local clinic protocol.",
                ],
                referral_threshold="Refer or escalate if severely ill, suspected treatment failure, severe adverse reaction, or complicated opportunistic infection.",
                medicines=["Continue appropriate ART regimen according to national HIV guidance"],
                follow_up=["Arrange adherence support and follow-up according to clinic protocol."],
                danger_signs=["Severe illness", "Severe adverse drug reaction", "TB danger symptoms", "Pregnancy-related complications if relevant"],
            ),
            teaching_points=[
                "ART continuity cases require adherence support and TB symptom screening.",
                "The clinician should avoid punitive counseling and identify barriers.",
            ],
            guideline_ids=["uganda-hiv-aids-consolidated-guidelines-2023"],
            citation_topic="ART continuity and adherence support",
            scores=(86, 84, 82, 45),
        ),
        _case(
            case_id="hc3-adult-dysuria-pregnancy-check-001",
            title="Dysuria with pregnancy consideration",
            topic="guidelines_general",
            patient=SimulatedPatient("Simulated adult patient", "22 years", "female"),
            truth=ClinicalTruth(
                chief_complaint="Pain passing urine",
                history=["Dysuria for two days", "No flank pain", "Last menstrual period is late"],
                review_of_systems=["No fever", "No vomiting", "No vaginal bleeding"],
                vitals={"temperature": "37.1 C", "pulse": "82 bpm", "bp": "106/68 mmHg", "respiratory_rate": "16/min"},
                exam_findings=["Well appearing", "No costovertebral angle tenderness", "Mild suprapubic tenderness"],
                available_tests=["Urine dipstick if available", "Pregnancy test if available"],
                diagnosis="Possible urinary tract infection with pregnancy status needing clarification",
                differentials=["Lower UTI", "Pregnancy-related urinary symptoms", "STI", "Pyelonephritis if fever/flank pain develops"],
                management=[
                    "Ask pregnancy status and assess for fever or flank pain.",
                    "Use urine testing if available.",
                    "Choose treatment compatible with pregnancy status and national guidance.",
                ],
                referral_threshold="Fever, flank pain, systemic illness, pregnancy complications, or inability to tolerate oral treatment require escalation/referral.",
                medicines=["Antibiotic choice should follow Uganda guidance and pregnancy safety considerations"],
                follow_up=["Return if fever, flank pain, vomiting, worsening symptoms, or pregnancy danger signs occur."],
                danger_signs=["Fever", "Flank pain", "Vomiting", "Pregnancy danger signs"],
            ),
            teaching_points=[
                "Pregnancy status can change safe management choices.",
                "Simple symptoms still require danger-sign screening.",
            ],
            guideline_ids=["uganda-clinical-guidelines-2023", "uganda-essential-medicines-list-2023"],
            citation_topic="Urinary symptoms and medicine safety",
            scores=(84, 86, 80, 44),
        ),
        _case(
            case_id="hc3-suspected-sti-partner-management-001",
            title="Urethral discharge and partner management",
            topic="guidelines_general",
            patient=SimulatedPatient("Simulated adult patient", "29 years", "male"),
            truth=ClinicalTruth(
                chief_complaint="Urethral discharge",
                history=["Discharge for four days", "Burning on urination", "New sexual partner recently"],
                review_of_systems=["No scrotal swelling", "No fever", "No genital ulcers reported"],
                vitals={"temperature": "36.9 C", "pulse": "78 bpm", "bp": "124/78 mmHg", "respiratory_rate": "16/min"},
                exam_findings=["Well appearing", "No severe lower abdominal pain", "No systemic illness"],
                available_tests=["HIV testing offer", "Syphilis testing if available", "Syndromic management pathway"],
                diagnosis="Suspected sexually transmitted infection presenting with urethral discharge",
                differentials=["Gonococcal urethritis", "Chlamydial urethritis", "Other STI syndrome"],
                management=[
                    "Use syndromic STI assessment and treatment according to Uganda guidance.",
                    "Offer HIV testing and risk reduction counseling.",
                    "Address partner notification/treatment according to clinic protocol.",
                ],
                referral_threshold="Severe systemic illness, complicated genital findings, or suspected sexual violence requires escalation/referral.",
                medicines=["Syndromic treatment according to national guideline and stock availability"],
                follow_up=["Counsel on abstinence/condom use until treatment complete and partner management addressed."],
                danger_signs=["Severe systemic illness", "Scrotal swelling", "Complicated genital findings"],
            ),
            teaching_points=[
                "STI care includes counseling, testing offer, and partner management, not only medication.",
                "The case tests whether learners ask sensitive but clinically necessary questions.",
            ],
            guideline_ids=["uganda-clinical-guidelines-2023", "uganda-hiv-aids-consolidated-guidelines-2023"],
            citation_topic="STI syndromic management and HIV testing",
            scores=(84, 85, 82, 52),
        ),
        _case(
            case_id="hc3-wound-tetanus-risk-001",
            title="Contaminated wound and tetanus prevention",
            topic="emergency",
            patient=SimulatedPatient("Simulated adult patient", "17 years", "male"),
            truth=ClinicalTruth(
                chief_complaint="Cut on foot after stepping on metal",
                history=["Injury happened yesterday", "Wound was contaminated with soil", "Tetanus vaccination history uncertain"],
                review_of_systems=["No fever", "No spreading redness reported", "Able to walk with pain"],
                vitals={"temperature": "37.0 C", "pulse": "88 bpm", "bp": "116/70 mmHg", "respiratory_rate": "18/min"},
                exam_findings=["Puncture wound on sole", "No active bleeding", "No signs of shock"],
                available_tests=["None required for initial wound risk assessment"],
                diagnosis="Contaminated puncture wound with tetanus risk",
                differentials=["Simple wound", "Cellulitis if infection develops", "Foreign body injury"],
                management=[
                    "Clean and assess the wound.",
                    "Assess tetanus immunization status.",
                    "Provide tetanus prevention and wound care according to Uganda guidance and availability.",
                ],
                referral_threshold="Deep foreign body, severe infection, neurovascular compromise, or inability to manage wound safely requires referral.",
                medicines=["Tetanus prophylaxis and antibiotics when indicated according to national guidance"],
                follow_up=["Return for fever, spreading redness, worsening pain, or signs of tetanus."],
                danger_signs=["Spreading infection", "Neurovascular compromise", "Deep retained foreign body", "Signs of tetanus"],
            ),
            teaching_points=[
                "Wound care includes prevention thinking, not only dressing the wound.",
                "Unknown tetanus status should trigger guideline-based prophylaxis assessment.",
            ],
            guideline_ids=["uganda-clinical-guidelines-2023", "uganda-essential-medicines-list-2023"],
            citation_topic="Wound care and tetanus prevention",
            scores=(82, 86, 78, 48),
        ),
    ]


def _case(
    case_id: str,
    title: str,
    topic: str,
    patient: SimulatedPatient,
    truth: ClinicalTruth,
    teaching_points: list[str],
    guideline_ids: list[str],
    citation_topic: str,
    scores: CaseScores | tuple[int, int, int, int],
) -> CanonicalCase:
    if not isinstance(scores, CaseScores):
        scores = CaseScores(*scores)
    citation = Citation(
        id=f"{case_id}-source",
        source_document_id=guideline_ids[0],
        title=citation_topic,
        section=citation_topic,
    )
    return CanonicalCase(
        id=case_id,
        title=title,
        source_type="generated_guideline",
        facility_level="HC III",
        topic=topic,
        simulated_patient=patient,
        clinical_truth=truth,
        expected_reasoning_path=[
            "Start with danger-sign screening.",
            "Gather focused history and vitals.",
            "Use Uganda guideline logic for management or referral.",
            "Document the decision clearly.",
        ],
        teaching_points=teaching_points,
        citations=[citation],
        scores=scores,
        share_metadata=ShareMetadata(
            title=title,
            prompt=f"What would you do first for this {topic.replace('_', ' ')} presentation?",
            summary="A short HC III clinical reasoning challenge for Karibu Learn.",
            discussion_question="Which finding most changes your next step?",
        ),
        credentialing_metadata=CredentialingMetadata(
            learning_objectives=teaching_points,
            estimated_duration_minutes=7 if scores.complexity < 55 else 10,
            assessment_mode="practice",
            certificate_eligible=False,
        ),
        source_guideline_ids=guideline_ids,
        review_status="needs_review",
        guideline_crosscheck="Draft generated against registered source documents; requires clinician review before publication.",
    )


def _variants_for_case(case: CanonicalCase) -> list[PlayableCaseVariant]:
    source_citation_id = case.citations[0].id
    level_1 = build_playable_variant(
        case.id,
        VariantPlan(
            id=f"{case.id}-level-1",
            label="Core Practice",
            difficulty_level=1,
            quest_type="core_practice",
            initially_visible=[
                "chief_complaint",
                "history[0]",
                "vitals",
                "exam_findings[0]",
                "available_tests",
            ],
            hidden_fields={},
            ehr_tasks=[],
            scoring_rules=[
                ScoringRule(
                    id=f"{case.id}-recognize-next-step",
                    description="Identifies the safest next clinical step.",
                    points=3,
                    citation_ids=[source_citation_id],
                )
            ],
        ),
    )
    level_3 = build_playable_variant(
        case.id,
        VariantPlan(
            id=f"{case.id}-level-3",
            label="Challenge",
            difficulty_level=3,
            quest_type="challenge",
            initially_visible=["chief_complaint"],
            hidden_fields=_hidden_fields_for(case),
            ehr_tasks=[
                EhrLikeTask(
                    id=f"{case.id}-enter-vitals",
                    task_type="enter_vitals",
                    prompt="Request and enter the patient's vitals.",
                    scoring_weight=2,
                ),
                EhrLikeTask(
                    id=f"{case.id}-focused-history",
                    task_type="ask_history",
                    prompt="Ask the most important focused history question.",
                    scoring_weight=2,
                ),
                EhrLikeTask(
                    id=f"{case.id}-decide-referral",
                    task_type="decide_referral",
                    prompt="Decide whether this patient can be managed at HC III or needs referral.",
                    scoring_weight=3,
                ),
            ],
            scoring_rules=[
                ScoringRule(
                    id=f"{case.id}-danger-sign-check",
                    description="Checks for danger signs before management.",
                    points=4,
                    citation_ids=[source_citation_id],
                ),
                ScoringRule(
                    id=f"{case.id}-guideline-plan",
                    description="Chooses a guideline-consistent plan for HC III level.",
                    points=4,
                    citation_ids=[source_citation_id],
                ),
            ],
        ),
    )
    return [level_1, level_3]


def _hidden_fields_for(case: CanonicalCase) -> dict[str, str]:
    hidden: dict[str, str] = {}
    vitals = case.clinical_truth.vitals
    for key in list(vitals.keys())[:2]:
        hidden[f"vitals.{key}"] = "Higher-level variants require the learner to request and enter vitals."
    if case.clinical_truth.history:
        hidden["history[0]"] = "The learner should ask focused history rather than receiving it up front."
    if case.clinical_truth.exam_findings:
        hidden["exam_findings[0]"] = "The learner should perform or select a focused exam."
    return hidden
