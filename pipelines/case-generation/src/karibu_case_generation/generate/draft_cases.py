from __future__ import annotations

from pathlib import Path

from karibu_case_generation.clinical_actions import enrich_case_truth
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


def generate_hc3_draft_pack(output_dir: Path, count: int = 100) -> None:
    cases = _draft_cases()[:count]
    variants: list[PlayableCaseVariant] = []
    for case in cases:
        variants.extend(_variants_for_case(case))

    export_kpack_directory(
        output_dir=output_dir,
        pack_id="hc3-cpd-curriculum-draft",
        title="HC III CPD Curriculum Draft",
        version="0.1.0",
        canonical_cases=cases,
        variants=variants,
    )


def _draft_cases() -> list[CanonicalCase]:
    cases = [
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
                diagnosis="Uncomplicated malaria after positive malaria RDT and absent danger signs",
                differentials=["Viral febrile illness", "Urinary tract infection", "Typhoid-like illness"],
                management=[
                    "Assess for danger signs before outpatient treatment.",
                    "Perform malaria RDT before antimalarial treatment.",
                    "If RDT is positive, treat this adult patient with artemether-lumefantrine 4 tablets twice daily for 3 days.",
                ],
                referral_threshold="Refer urgently if severe malaria features or other danger signs are present.",
                medicines=["Artemether-lumefantrine adult course: 4 tablets twice daily for 3 days after positive RDT"],
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
                    "Classify as some dehydration.",
                    "Give ORS Plan B: 750 ml over 4 hours for this 10 kg child.",
                    "Give zinc 20 mg once daily for 10-14 days.",
                    "Check for blood in stool and general danger signs.",
                ],
                referral_threshold="Severe dehydration, lethargy/unconsciousness, inability to drink, or shock require urgent referral or higher-level management.",
                medicines=["ORS 750 ml over 4 hours", "Zinc 20 mg once daily for 10-14 days"],
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
                available_tests=["Urine protein dipstick"],
                diagnosis="Pre-eclampsia concern requiring same-day urgent referral",
                differentials=["Gestational hypertension", "Pre-eclampsia", "Severe headache from another cause"],
                management=[
                    "Recognize headache, visual symptoms, and high blood pressure as danger signs.",
                    "Repeat blood pressure after rest and check urine protein.",
                    "Keep patient under observation and arrange same-day urgent referral.",
                ],
                referral_threshold="Severe hypertension, headache, visual symptoms, convulsions, or suspected pre-eclampsia require urgent referral.",
                medicines=["Magnesium sulfate and antihypertensive pre-referral threshold requires clinician confirmation for this BP/symptom pattern"],
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
                available_tests=["Sputum sample transport for district GeneXpert", "HIV testing offer with consent and privacy"],
                diagnosis="Presumptive pulmonary TB requiring same-day diagnostic evaluation",
                differentials=["Pulmonary TB", "Viral cough", "Chronic bronchitis/COPD", "Pneumonia"],
                management=[
                    "Ask duration of cough and constitutional symptoms.",
                    "Move patient out of crowded indoor queue, use cough etiquette, and assess in a well-ventilated area.",
                    "Collect sputum today for district GeneXpert via sample transport.",
                    "Offer HIV testing today if status is unknown.",
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
    return cases + _additional_cases() + _chapter_expansion_cases()


def _additional_cases() -> list[CanonicalCase]:
    return [
        _compact_case(
            "hc3-postpartum-haemorrhage-001",
            "Bleeding after delivery",
            "maternal_anc",
            "A mother who delivered at the facility less than an hour ago is still bleeding heavily while the ward is busy. Her attendant says the cloths are soaking quickly and asks whether this is normal.",
            "Heavy bleeding after delivery",
            ["Delivered about 45 minutes ago", "Bleeding is continuing", "Feels dizzy when sitting up"],
            {"bp": "88/54 mmHg", "pulse": "128 bpm", "respiratory_rate": "26/min", "temperature": "36.7 C"},
            ["Pale", "Ongoing vaginal bleeding", "Uterus feels soft on abdominal exam"],
            "Suspected postpartum haemorrhage",
            ["Recognize PPH as an emergency.", "Call for help and start immediate HC III emergency actions while arranging escalation/referral."],
            ["Shock", "Persistent heavy bleeding", "Altered mental status"],
            ["uganda-clinical-guidelines-2023"],
            "Postpartum haemorrhage emergency response",
            (92, 90, 92, 68),
        ),
        _compact_case(
            "hc3-eclampsia-convulsion-001",
            "Convulsion in late pregnancy",
            "maternal_anc",
            "During an antenatal clinic morning, a pregnant woman waiting outside suddenly collapses and has a convulsion. Her sister says she complained of headache and blurred vision before leaving home.",
            "Convulsion during pregnancy",
            ["Approximately 34 weeks pregnant", "Severe headache earlier today", "Blurred vision reported"],
            {"bp": "170/110 mmHg", "pulse": "112 bpm", "respiratory_rate": "24/min", "temperature": "36.8 C"},
            ["Post-ictal but breathing", "No trauma seen", "Pedal oedema"],
            "Suspected eclampsia",
            ["Protect airway and safety during convulsion.", "Recognize eclampsia and arrange urgent referral after immediate stabilization."],
            ["Convulsion", "Severe hypertension", "Severe headache", "Visual symptoms"],
            ["uganda-clinical-guidelines-2023"],
            "Eclampsia recognition and emergency referral",
            (93, 88, 93, 74),
        ),
        _compact_case(
            "hc3-prolonged-labour-partograph-001",
            "Slow labour progress on the partograph",
            "maternal_anc",
            "A midwife hands over a mother in active labour whose cervical dilation has not changed as expected. The family is anxious because the labour started the previous night.",
            "Labour not progressing",
            ["Contractions began last night", "Membranes ruptured several hours ago", "No heavy bleeding reported"],
            {"bp": "118/74 mmHg", "pulse": "98 bpm", "temperature": "37.4 C", "fetal_heart_rate": "166 bpm"},
            ["Cervical progress slow on partograph", "Mother tired", "No obvious convulsion or shock"],
            "Prolonged labour with concern for fetal/maternal risk",
            ["Use the partograph to recognize abnormal progress.", "Escalate early when labour crosses danger thresholds or fetal distress is suspected."],
            ["Fetal distress", "Maternal exhaustion", "Fever", "Obstructed labour concern"],
            ["uganda-clinical-guidelines-2023"],
            "Monitoring labour using a partograph",
            (87, 86, 90, 70),
        ),
        _compact_case(
            "hc3-newborn-not-breathing-001",
            "Newborn not breathing well",
            "neonatal",
            "A baby is delivered at night after a long labour. The room becomes quiet when the newborn does not cry immediately, and the birth attendant looks to you for the next action.",
            "Newborn not crying after birth",
            ["Term baby by dates", "Long labour", "No cry immediately after birth"],
            {"heart_rate": "Slow by quick assessment", "breathing": "Gasps irregularly", "temperature": "Not yet measured"},
            ["Poor tone", "No strong cry", "Cord just clamped"],
            "Newborn requiring immediate resuscitation assessment",
            ["Recognize failure to breathe as an immediate emergency.", "Start appropriate newborn resuscitation steps and call for help."],
            ["Not breathing", "Poor tone", "Slow heart rate"],
            ["uganda-clinical-guidelines-2023"],
            "Neonatal resuscitation initial response",
            (90, 87, 94, 76),
        ),
        _compact_case(
            "hc3-neonate-fever-sepsis-001",
            "Newborn with fever and poor feeding",
            "neonatal",
            "A grandmother brings a 9-day-old baby wrapped tightly in a blanket. She says the baby has stopped breastfeeding well and feels hot.",
            "Newborn fever and poor feeding",
            ["Nine days old", "Poor feeding since yesterday", "Feels hot at home"],
            {"temperature": "38.4 C", "pulse": "168 bpm", "respiratory_rate": "62/min", "weight": "3.1 kg"},
            ["Weak suck", "Sleepy but rousable", "No obvious congenital abnormality"],
            "Possible neonatal sepsis",
            ["Treat fever and poor feeding in a neonate as high risk.", "Stabilize and arrange urgent referral according to neonatal guidance."],
            ["Poor feeding", "Fever", "Fast breathing", "Lethargy"],
            ["uganda-clinical-guidelines-2023", "who-imnci-chart-booklet"],
            "Young infant fever and possible serious bacterial infection",
            (89, 88, 90, 64),
        ),
        _compact_case(
            "hc3-asthma-acute-wheeze-001",
            "Young adult with acute wheeze",
            "emergency",
            "A boda rider arrives leaning forward and speaking in short phrases. He says the dust on the road made his chest tight and his inhaler finished last week.",
            "Shortness of breath and wheeze",
            ["Known episodes of wheeze", "Symptoms worsened today", "Reliever inhaler unavailable"],
            {"respiratory_rate": "34/min", "pulse": "118 bpm", "spo2": "Not available", "bp": "126/78 mmHg"},
            ["Audible wheeze", "Uses accessory muscles", "Speaks in short phrases"],
            "Acute asthma/wheeze exacerbation",
            ["Assess severity immediately.", "Give available bronchodilator treatment and refer if severe or not improving."],
            ["Unable to speak", "Exhaustion", "Cyanosis", "Silent chest"],
            ["uganda-clinical-guidelines-2023", "uganda-essential-medicines-list-2023"],
            "Acute wheeze severity and referral",
            (86, 86, 86, 60),
        ),
        _compact_case(
            "hc3-hypoglycaemia-altered-consciousness-001",
            "Sweating and confusion in a diabetic patient",
            "emergency",
            "A market vendor known to have diabetes is brought in confused and sweating. Her daughter says she took medicine in the morning but missed lunch.",
            "Confusion and sweating",
            ["Known diabetes", "Missed meal", "Became confused suddenly"],
            {"temperature": "36.5 C", "pulse": "110 bpm", "bp": "132/80 mmHg", "respiratory_rate": "20/min"},
            ["Sweaty", "Confused", "No focal weakness noted"],
            "Suspected hypoglycaemia",
            ["Check glucose rapidly if available.", "Treat suspected hypoglycaemia promptly when clinically likely and safe."],
            ["Unconsciousness", "Seizure", "Unable to swallow safely"],
            ["uganda-clinical-guidelines-2023"],
            "Hypoglycaemia recognition and immediate management",
            (86, 84, 84, 55),
        ),
        _compact_case(
            "hc3-burns-fluid-risk-001",
            "Child with hot water burns",
            "emergency",
            "A toddler is carried in crying after pulling hot water from a charcoal stove. The mother is frightened and asks for cream for the skin.",
            "Hot water burn",
            ["Burn occurred one hour ago", "Hot water spilled on chest and arm", "No inhalation injury reported"],
            {"temperature": "36.9 C", "pulse": "132 bpm", "respiratory_rate": "30/min", "weight": "12 kg"},
            ["Partial thickness burn over anterior chest and arm", "Crying", "No soot around mouth"],
            "Paediatric burn requiring severity assessment",
            ["Estimate burn severity and assess airway/breathing/circulation.", "Provide first aid, pain care, and referral when burn severity exceeds HC III capacity."],
            ["Large surface area", "Face/airway involvement", "Shock", "Very young child"],
            ["uganda-clinical-guidelines-2023"],
            "Burn assessment and referral",
            (84, 86, 84, 58),
        ),
        _compact_case(
            "hc3-intimate-partner-violence-001",
            "Injury with a hidden safety concern",
            "patient_safety",
            "A woman comes for treatment of a bruised arm and says she fell. When her partner steps outside to answer a call, she becomes tearful and says this has happened before.",
            "Arm injury after reported fall",
            ["Mechanism unclear", "Patient later discloses repeated violence", "No loss of consciousness"],
            {"temperature": "36.7 C", "pulse": "94 bpm", "bp": "122/76 mmHg", "respiratory_rate": "18/min"},
            ["Bruising on upper arm", "No obvious fracture deformity", "Anxious affect"],
            "Injury with intimate partner violence concern",
            ["Ensure privacy and immediate safety.", "Treat injuries, document clearly, and link to local safeguarding/referral pathways."],
            ["Immediate danger", "Sexual violence", "Severe injury", "Suicidal thoughts"],
            ["uganda-clinical-guidelines-2023"],
            "Respectful communication and safeguarding",
            (80, 86, 88, 67),
        ),
        _compact_case(
            "hc3-needlestick-exposure-001",
            "Needle-stick injury after injection",
            "patient_safety",
            "A nursing assistant quietly reports that she pricked her finger while cleaning up after an injection. She is embarrassed and asks whether she should just wash it and continue working.",
            "Needle-stick injury",
            ["Injury occurred minutes ago", "Source patient HIV status not immediately known", "Finger washed briefly"],
            {"temperature": "36.8 C", "pulse": "82 bpm", "bp": "118/72 mmHg", "respiratory_rate": "16/min"},
            ["Small puncture wound", "No active bleeding", "Anxious staff member"],
            "Occupational exposure requiring post-exposure pathway",
            ["Respond promptly and non-punitively.", "Follow occupational exposure protocol, documentation, testing, and PEP pathway as indicated."],
            ["Delay in reporting", "High-risk exposure", "Unknown source status"],
            ["uganda-hiv-aids-consolidated-guidelines-2023"],
            "Post-exposure prophylaxis and infection prevention",
            (86, 88, 86, 56),
        ),
        _compact_case(
            "hc3-medication-allergy-documentation-001",
            "Rash after previous antibiotic",
            "patient_safety",
            "A mother says her child developed a bad rash the last time a similar medicine was given. The queue is long and the dispenser asks whether to continue with the usual prescription.",
            "Previous rash after medicine",
            ["Rash occurred after prior antibiotic", "No current severe illness", "Caregiver remembers the medicine color but not name"],
            {"temperature": "37.2 C", "pulse": "98 bpm", "respiratory_rate": "22/min", "weight": "18 kg"},
            ["No current rash", "Well appearing", "No respiratory distress"],
            "Possible medication allergy requiring documentation and safe prescribing",
            ["Clarify and document allergy history.", "Avoid unsafe prescribing when allergy history is concerning and seek safer alternatives according to guidance."],
            ["Anaphylaxis history", "Breathing difficulty", "Mucosal involvement", "Severe rash"],
            ["uganda-clinical-guidelines-2023", "uganda-essential-medicines-list-2023"],
            "Medication allergy safety and documentation",
            (80, 84, 86, 50),
        ),
        _compact_case(
            "hc3-adolescent-confidentiality-sti-001",
            "Adolescent asks for private advice",
            "hiv_tb",
            "A 17-year-old waits until her aunt leaves the room and then quietly asks if she can talk privately about discharge and pain during urination.",
            "Genital symptoms and request for privacy",
            ["Adolescent requests confidential discussion", "Dysuria and discharge", "Worried family will find out"],
            {"temperature": "36.9 C", "pulse": "86 bpm", "bp": "108/70 mmHg", "respiratory_rate": "16/min"},
            ["Anxious", "No severe abdominal pain", "No fever"],
            "Possible STI with confidentiality and safeguarding needs",
            ["Create a private, respectful space.", "Assess STI symptoms, pregnancy risk, coercion/safety, and offer appropriate testing/care."],
            ["Sexual violence", "Pregnancy danger signs", "Severe pelvic pain", "Fever"],
            ["uganda-clinical-guidelines-2023", "uganda-hiv-aids-consolidated-guidelines-2023"],
            "Adolescent STI care and respectful communication",
            (80, 85, 88, 62),
        ),
        _compact_case(
            "hc3-anaemia-pregnancy-fatigue-001",
            "Pregnant woman with severe fatigue",
            "maternal_anc",
            "At an ANC visit, a pregnant woman says she becomes breathless walking from the trading centre. She looks pale but says she thought this was normal pregnancy tiredness.",
            "Fatigue and breathlessness in pregnancy",
            ["Pregnant in second trimester", "Progressive fatigue", "Breathless on exertion"],
            {"bp": "104/66 mmHg", "pulse": "112 bpm", "temperature": "36.8 C", "respiratory_rate": "22/min"},
            ["Pale conjunctiva", "No active bleeding", "No fever"],
            "Possible anaemia in pregnancy",
            ["Assess severity and danger signs.", "Use available testing and supplementation/referral pathway according to ANC guidance."],
            ["Severe pallor", "Shortness of breath at rest", "Syncope", "Bleeding"],
            ["uganda-clinical-guidelines-2023", "uganda-essential-medicines-list-2023"],
            "Anaemia in pregnancy assessment",
            (82, 87, 84, 52),
        ),
        _compact_case(
            "hc3-malnutrition-oedema-child-001",
            "Child with swollen feet",
            "child_health",
            "A caregiver brings a quiet 3-year-old whose feet have become swollen. The child has been treated twice for cough recently and is no longer playing.",
            "Swollen feet and poor appetite",
            ["Reduced appetite", "Swollen feet noticed this week", "Recurrent illness"],
            {"temperature": "37.3 C", "pulse": "112 bpm", "respiratory_rate": "28/min", "weight": "10.5 kg"},
            ["Bilateral pedal oedema", "Thin upper arms", "Quiet but rousable"],
            "Possible severe acute malnutrition",
            ["Recognize bilateral oedema as high-risk malnutrition sign.", "Assess danger signs and refer/manage according to nutrition protocol availability."],
            ["Bilateral oedema", "Lethargy", "Poor appetite", "Severe wasting"],
            ["who-imnci-chart-booklet", "uganda-clinical-guidelines-2023"],
            "Child malnutrition danger signs",
            (84, 88, 86, 58),
        ),
        _compact_case(
            "hc3-measles-suspected-rash-fever-001",
            "Fever with rash in an unimmunized child",
            "child_health",
            "A child is brought during a busy immunization day with fever, cough, red eyes, and a spreading rash. The caregiver is unsure whether the child completed vaccines.",
            "Fever and rash",
            ["Fever began before rash", "Cough and red eyes", "Immunization status uncertain"],
            {"temperature": "38.7 C", "pulse": "120 bpm", "respiratory_rate": "30/min", "weight": "14 kg"},
            ["Generalized rash", "Conjunctival redness", "No severe respiratory distress"],
            "Suspected measles or other febrile rash illness",
            ["Recognize possible measles and infection prevention implications.", "Assess complications, notify/escalate according to local surveillance and manage supportively/referral if severe."],
            ["Respiratory distress", "Dehydration", "Altered mental status", "Severe eye involvement"],
            ["uganda-clinical-guidelines-2023", "who-imnci-chart-booklet"],
            "Fever with rash and immunization assessment",
            (80, 86, 84, 60),
        ),
        _compact_case(
            "hc3-postpartum-fever-sepsis-001",
            "Fever after delivery",
            "maternal_anc",
            "Three days after delivering at home, a mother arrives with fever and lower abdominal pain. Her aunt says the baby is well but the mother has been getting weaker.",
            "Postpartum fever and abdominal pain",
            ["Delivered at home three days ago", "Fever since yesterday", "Lower abdominal pain"],
            {"temperature": "39.1 C", "pulse": "118 bpm", "bp": "100/62 mmHg", "respiratory_rate": "24/min"},
            ["Tender lower abdomen", "Foul-smelling discharge reported", "Weak but alert"],
            "Possible postpartum infection/sepsis",
            ["Recognize postpartum fever as potentially serious.", "Assess sepsis signs, start appropriate urgent management within scope, and refer/escalate."],
            ["Hypotension", "High fever", "Altered mental status", "Heavy bleeding"],
            ["uganda-clinical-guidelines-2023"],
            "Postpartum infection and sepsis recognition",
            (86, 88, 88, 64),
        ),
        _compact_case(
            "hc3-family-planning-danger-headache-001",
            "Severe headache on contraception",
            "family_planning",
            "A woman attending family planning clinic says she has severe new headaches and blurred vision. She wants another refill quickly because she needs to return to work.",
            "Severe headache and blurred vision",
            ["Using hormonal contraception", "New severe headaches", "Blurred vision"],
            {"bp": "162/100 mmHg", "pulse": "90 bpm", "temperature": "36.7 C", "respiratory_rate": "18/min"},
            ["Alert", "No weakness", "Anxious about time"],
            "Danger symptoms during family planning follow-up",
            ["Do not treat refill as routine when danger symptoms are present.", "Assess blood pressure and refer/escalate according to contraceptive safety guidance."],
            ["Severe headache", "Visual symptoms", "Severe hypertension", "Neurologic deficit"],
            ["uganda-clinical-guidelines-2023"],
            "Family planning danger symptoms",
            (80, 84, 84, 55),
        ),
        _compact_case(
            "hc3-queue-deterioration-triage-001",
            "Quiet patient deteriorates in the queue",
            "patient_safety",
            "A records officer says an elderly patient waiting quietly for registration is now sweating and looks faint. The queue is long and several louder patients are demanding attention.",
            "Weakness while waiting",
            ["Symptoms worsened while waiting", "Elderly patient", "No full history yet"],
            {"bp": "82/50 mmHg", "pulse": "124 bpm", "respiratory_rate": "28/min", "temperature": "37.9 C"},
            ["Sweaty", "Weak voice", "Cool peripheries"],
            "Unstable patient requiring urgent triage escalation",
            ["Recognize deterioration in queue as urgent.", "Escalate immediately, obtain vitals, and start ABC-style assessment rather than waiting for routine flow."],
            ["Hypotension", "Altered mental status", "Respiratory distress", "Signs of shock"],
            ["uganda-clinical-guidelines-2023"],
            "Triage escalation and work organization",
            (84, 90, 88, 57),
        ),
        _compact_case(
            "hc3-poisoning-pesticide-001",
            "Possible pesticide poisoning",
            "emergency",
            "A farmer is brought by neighbours after being found vomiting near pesticide containers. They are not sure what he swallowed and want him given something quickly.",
            "Vomiting after possible pesticide exposure",
            ["Found near pesticide containers", "Repeated vomiting", "Exposure route uncertain"],
            {"pulse": "58 bpm", "bp": "94/60 mmHg", "respiratory_rate": "24/min", "temperature": "36.6 C"},
            ["Sweating", "Vomiting", "Smells of chemicals"],
            "Possible pesticide poisoning",
            ["Protect staff and patient from contamination.", "Assess airway/breathing/circulation and arrange urgent referral while following poisoning guidance."],
            ["Respiratory distress", "Altered mental status", "Seizure", "Shock"],
            ["uganda-clinical-guidelines-2023"],
            "Poisoning initial assessment and referral",
            (80, 85, 86, 66),
        ),
        _compact_case(
            "hc3-sickle-cell-pain-fever-001",
            "Pain crisis with fever",
            "emergency",
            "A teenager known to have sickle cell disease arrives with severe limb pain. His mother says he also developed fever overnight.",
            "Severe limb pain and fever",
            ["Known sickle cell disease", "Severe limb pain", "Fever started overnight"],
            {"temperature": "38.9 C", "pulse": "116 bpm", "bp": "108/66 mmHg", "respiratory_rate": "24/min"},
            ["In pain", "No obvious trauma", "No respiratory distress at rest"],
            "Sickle cell pain episode with infection concern",
            ["Treat pain seriously and assess fever as a risk sign.", "Evaluate for infection and refer/escalate if danger signs or severe complications are present."],
            ["Fever", "Chest pain", "Respiratory distress", "Severe pallor", "Altered mental status"],
            ["uganda-clinical-guidelines-2023"],
            "Sickle cell fever and pain crisis assessment",
            (80, 84, 84, 62),
        ),
        _compact_case(
            "hc3-mental-health-suicide-risk-001",
            "Sadness with self-harm risk",
            "mental_health",
            "A young man comes with stomach pain, but after a quiet conversation he says he has not slept and has thought about taking poison.",
            "Abdominal pain with disclosed self-harm thoughts",
            ["Poor sleep", "Low mood", "Thoughts of taking poison"],
            {"temperature": "36.8 C", "pulse": "88 bpm", "bp": "116/74 mmHg", "respiratory_rate": "18/min"},
            ["Withdrawn", "No acute abdomen signs", "Oriented"],
            "Possible depression with suicide risk",
            ["Ask directly and respectfully about self-harm risk.", "Do not dismiss somatic complaints; ensure safety and urgent mental health referral/escalation when risk is present."],
            ["Active plan", "Access to poison", "Psychosis", "Unable to ensure safety"],
            ["uganda-clinical-guidelines-2023"],
            "Mental health risk assessment and referral",
            (80, 82, 88, 68),
        ),
    ]


def _chapter_expansion_cases() -> list[CanonicalCase]:
    specs = [
        # Fever, malaria, acute illness
        ("hc3-fever-negative-malaria-test-001", "Fever after negative malaria test", "malaria", "fever-malaria-acute-illness", "A teenager returns from school with fever, but the malaria RDT done at triage is negative. The family still expects malaria medicine because that is what usually happens.", "Fever with negative malaria test", "Febrile illness with malaria less likely after negative test", ["Avoid anchoring on malaria when test and presentation suggest alternatives.", "Safety-net and reassess for danger signs."], ["Persistent fever", "Confusion", "Respiratory distress"]),
        ("hc3-fever-neck-stiffness-001", "Fever with neck stiffness", "emergency", "fever-malaria-acute-illness", "A young adult with fever is brought in because he cannot bend his neck comfortably and keeps shielding his eyes from light.", "Fever and neck stiffness", "Possible meningitis or severe febrile illness", ["Recognize meningitis danger signs.", "Stabilize and arrange urgent referral rather than routine outpatient treatment."], ["Neck stiffness", "Altered mental status", "Convulsions"]),
        ("hc3-fever-after-miscarriage-001", "Fever after miscarriage", "maternal_anc", "fever-malaria-acute-illness", "A woman comes quietly with fever and lower abdominal pain after bleeding heavily at home two days ago. She is worried about being judged.", "Fever after pregnancy loss", "Possible post-abortion infection/sepsis", ["Provide nonjudgmental emergency care.", "Recognize post-pregnancy infection as potentially life-threatening."], ["High fever", "Hypotension", "Heavy bleeding"]),
        ("hc3-typhoid-like-fever-001", "Long fever with abdominal symptoms", "guidelines_general", "fever-malaria-acute-illness", "A shopkeeper has had fever for more than a week and now has abdominal discomfort. A neighbour advised antimalarials, but the symptoms have continued.", "Prolonged fever with abdominal pain", "Prolonged febrile illness requiring structured assessment", ["Do not repeat malaria treatment blindly.", "Use duration and abdominal symptoms to broaden differential diagnosis."], ["Shock", "Confusion", "Severe dehydration"]),
        ("hc3-fever-sickle-cell-child-001", "Fever in a child with sickle cell disease", "emergency", "fever-malaria-acute-illness", "A caregiver says her child with sickle cell disease has fever and looks weaker than usual. She asks if this can wait until morning.", "Fever in known sickle cell disease", "High-risk febrile illness in sickle cell disease", ["Treat fever in sickle cell disease as higher risk.", "Assess for severe anaemia, infection, and respiratory symptoms."], ["Severe pallor", "Respiratory distress", "Lethargy"]),
        ("hc3-fever-returning-traveller-001", "Fever after travel to border district", "outbreak", "outbreak-ipc-ebola-vhf", "A trader returns from a border district and develops fever. The triage nurse remembers radio announcements about outbreak surveillance.", "Fever after travel", "Outbreak-aware febrile illness requiring IPC screening", ["Ask travel and contact history during outbreaks.", "Separate and notify according to outbreak protocol when risk criteria are met."], ["Bleeding", "Known Ebola contact", "Severe weakness"]),
        ("hc3-fever-health-worker-exposure-001", "Fever in a health worker after exposure", "outbreak", "outbreak-ipc-ebola-vhf", "A health worker from another facility presents with fever after caring for a patient later reported as a suspected Ebola case.", "Fever after healthcare exposure", "Possible viral haemorrhagic fever exposure", ["Protect staff and other patients first.", "Use isolation, notification, and referral pathways."], ["Known contact", "Vomiting", "Bleeding"]),

        # Child health and IMNCI
        ("hc3-child-ear-pain-fever-001", "Child with ear pain and fever", "child_health", "child-health-imnci", "A caregiver brings a crying child who keeps pulling at one ear. The child has fever but is still drinking.", "Ear pain and fever", "Acute ear problem requiring assessment", ["Check danger signs before focusing on ear symptoms.", "Counsel caregiver on follow-up and worsening signs."], ["Mastoid swelling", "Lethargy", "Unable to drink"]),
        ("hc3-child-fever-convulsion-001", "Child after a convulsion", "child_health", "child-health-imnci", "A mother arrives frightened after her child convulsed at home during a fever. The child is now sleepy.", "Fever with convulsion", "Febrile convulsion vs serious illness", ["Post-convulsion assessment must look for serious causes.", "Convulsion is a danger sign requiring careful escalation decisions."], ["Repeated convulsions", "Unconsciousness", "Neck stiffness"]),
        ("hc3-child-very-low-weight-001", "Small child not gaining weight", "child_health", "child-health-imnci", "A grandmother asks for vitamins for a child who is smaller than neighbours of the same age and often has diarrhoea.", "Poor growth", "Possible undernutrition or chronic illness", ["Growth concerns need structured nutrition and illness assessment.", "Look for oedema and danger signs."], ["Bilateral oedema", "Poor appetite", "Lethargy"]),
        ("hc3-child-eye-discharge-newborn-001", "Newborn with eye discharge", "neonatal", "child-health-imnci", "A two-week-old baby has swollen eyelids and discharge. The mother asks for drops from the dispensary.", "Newborn eye discharge", "Possible neonatal eye infection", ["Young infant problems can worsen quickly.", "Assess feeding, fever, and systemic danger signs."], ["Poor feeding", "Fever", "Swollen eyelids"]),
        ("hc3-child-immunization-missed-001", "Missed immunization opportunity", "child_health", "child-health-imnci", "A child comes for cough, and the card shows missed vaccines. The clinic is busy and the caregiver is about to leave.", "Cough with missed immunizations", "Missed preventive care opportunity", ["Use sick visits to check immunization status.", "Balance acute care with prevention counseling."], ["Severe illness", "Respiratory distress", "Contraindication concern"]),
        ("hc3-child-abdominal-pain-worms-001", "Child with abdominal pain and poor appetite", "child_health", "child-health-imnci", "A school-age child complains of abdominal pain and poor appetite. The caregiver wants deworming but has not noticed danger signs.", "Abdominal pain and poor appetite", "Common child abdominal complaint needing danger-sign screen", ["Do not skip danger-sign assessment in common complaints.", "Use age-appropriate prevention and follow-up counseling."], ["Severe pain", "Vomiting everything", "Bloody stool"]),
        ("hc3-child-skin-infection-001", "Child with spreading skin sores", "child_health", "child-health-imnci", "A child has several crusted sores on the legs and now one area is warm and swollen.", "Spreading skin sores", "Skin infection with complication screen", ["Assess extent and systemic symptoms.", "Explain hygiene and return precautions."], ["Fever", "Rapid spread", "Severe pain"]),

        # Maternal/midwifery
        ("hc3-anc-reduced-fetal-movement-001", "Reduced fetal movement", "maternal_anc", "maternal-midwifery-emergencies", "A pregnant woman says the baby has moved less since yesterday. She looks calm but says she knows something feels different.", "Reduced fetal movement", "Possible fetal compromise needing assessment/referral", ["Take reduced fetal movement seriously.", "Assess gestational age and fetal status within HC III capability."], ["Absent fetal movement", "Bleeding", "Severe abdominal pain"]),
        ("hc3-anc-vaginal-bleeding-001", "Bleeding in late pregnancy", "maternal_anc", "maternal-midwifery-emergencies", "A woman in late pregnancy arrives with fresh bleeding on her clothing. Her relatives want her moved quickly to the delivery room.", "Vaginal bleeding in pregnancy", "Antepartum bleeding emergency", ["Recognize bleeding in pregnancy as high risk.", "Avoid unsafe delays and arrange urgent referral/escalation."], ["Shock", "Heavy bleeding", "Severe abdominal pain"]),
        ("hc3-postnatal-breast-pain-fever-001", "Breast pain and fever after delivery", "maternal_anc", "maternal-midwifery-emergencies", "A postnatal mother has breast pain and fever, and she is considering stopping breastfeeding.", "Breast pain and fever", "Possible mastitis with breastfeeding support needs", ["Support feeding while assessing infection severity.", "Look for systemic illness or abscess concern."], ["High fever", "Abscess", "Very ill appearance"]),
        ("hc3-respectful-maternity-care-001", "Anxious labouring mother", "maternal_anc", "maternal-midwifery-emergencies", "A first-time mother is scared and crying during labour. A relative complains that staff are ignoring her.", "Fear and pain during labour", "Respectful maternity care and communication challenge", ["Respectful communication is clinical care.", "Explain assessments and preserve dignity under pressure."], ["Clinical deterioration", "Fetal distress", "Bleeding"]),
        ("hc3-breech-recognition-001", "Possible breech presentation", "maternal_anc", "maternal-midwifery-emergencies", "During labour assessment, the presenting part does not feel like a head. The room is crowded and the mother asks if everything is normal.", "Abnormal presentation concern", "Possible breech requiring escalation", ["Recognize presentation concerns early.", "Escalate before obstructed labour develops."], ["Obstructed labour", "Fetal distress", "Cord prolapse"]),
        ("hc3-shoulder-dystocia-warning-001", "Birth not progressing after head delivers", "maternal_anc", "maternal-midwifery-emergencies", "The baby's head has delivered but the shoulders are not coming. The mother is exhausted and the room becomes tense.", "Shoulders not delivering", "Possible shoulder dystocia emergency", ["Call for help immediately.", "Use trained emergency response and avoid harmful traction."], ["Failure of shoulders to deliver", "Fetal distress", "Maternal exhaustion"]),
        ("hc3-postnatal-depression-screen-001", "Tearful postnatal mother", "mental_health", "mental-health-psychosocial-care", "A mother returns for baby review but quietly says she feels hopeless and cannot sleep even when the baby sleeps.", "Low mood after delivery", "Possible postnatal depression or safety concern", ["Ask about mood and safety respectfully.", "Assess self-harm or harm-to-baby risk and refer when needed."], ["Self-harm thoughts", "Psychosis", "Unable to care for baby"]),

        # Neonatal/emergency
        ("hc3-neonate-jaundice-001", "Yellow newborn", "neonatal", "neonatal-emergency-care", "A mother notices her newborn's eyes are yellow. The baby is sleepy and feeding less.", "Yellow eyes in newborn", "Neonatal jaundice with danger assessment", ["Assess feeding and activity, not just skin colour.", "Refer urgently if severe or early jaundice signs are present."], ["Poor feeding", "Lethargy", "Deep jaundice"]),
        ("hc3-neonate-hypothermia-001", "Cold newborn after transport", "neonatal", "neonatal-emergency-care", "A newborn arrives after a long boda ride wrapped in thin cloth. The baby feels cold to touch.", "Cold newborn", "Neonatal hypothermia risk", ["Temperature protection is urgent neonatal care.", "Assess for infection and feeding difficulty."], ["Very low temperature", "Poor feeding", "Lethargy"]),
        ("hc3-child-choking-001", "Child choking on groundnut", "emergency", "neonatal-emergency-care", "A caregiver runs in carrying a toddler who suddenly started choking while eating groundnuts.", "Choking episode", "Airway emergency", ["Recognize airway obstruction immediately.", "Use age-appropriate emergency response and referral after stabilization."], ["Unable to cry", "Cyanosis", "Unconsciousness"]),
        ("hc3-snakebite-001", "Snakebite on the foot", "emergency", "emergency-critical-care", "A farmer is carried in after a snakebite. Someone has tied a tight cloth above the bite.", "Snakebite", "Snakebite requiring safe first aid and referral assessment", ["Remove harmful first-aid practices safely.", "Assess neurotoxic/bleeding signs and refer when indicated."], ["Bleeding", "Breathing difficulty", "Progressive swelling"]),
        ("hc3-road-traffic-injury-001", "Boda crash with abdominal pain", "emergency", "emergency-critical-care", "A boda passenger arrives after a crash, walking but pale. He says his abdomen hurts more each minute.", "Abdominal pain after crash", "Trauma with internal injury concern", ["Do not be reassured by walking after trauma.", "Assess shock and refer urgently when internal injury is possible."], ["Hypotension", "Severe abdominal pain", "Confusion"]),
        ("hc3-severe-dehydration-adult-001", "Adult with profuse diarrhoea", "emergency", "emergency-critical-care", "A fish trader has had profuse watery diarrhoea since dawn and is now too weak to stand.", "Profuse diarrhoea and weakness", "Severe dehydration concern", ["Assess hydration and shock quickly.", "Begin rehydration within scope and refer if unstable."], ["Shock", "Unable to drink", "Altered mental status"]),
        ("hc3-acute-chest-pain-001", "Chest pain in older adult", "emergency", "emergency-critical-care", "An older man says an elephant is sitting on his chest. He came because the pain did not settle after resting.", "Chest pain", "Possible acute coronary syndrome or other emergency", ["Treat chest pain as potentially serious.", "Assess stability and refer for higher-level evaluation."], ["Collapse", "Severe breathlessness", "Hypotension"]),

        # HIV/TB/STI continuity
        ("hc3-tb-contact-child-001", "Child living with TB contact", "hiv_tb", "hiv-tb-sti-continuity", "A caregiver with known TB brings a child for cough. The child sleeps in the same room.", "Child cough with TB contact", "TB exposure requiring screening pathway", ["Ask household contact history.", "Follow TB contact screening and referral/prevention pathways."], ["Weight loss", "Persistent fever", "Lethargy"]),
        ("hc3-hiv-new-positive-counsel-001", "New positive HIV test", "hiv_tb", "hiv-tb-sti-continuity", "A patient receives a positive HIV test result and becomes silent. The room is busy and privacy is limited.", "New HIV diagnosis", "Post-test counseling and linkage challenge", ["Privacy and counseling quality matter.", "Link to care and screen for TB/safety concerns."], ["Severe distress", "TB symptoms", "Pregnancy"]),
        ("hc3-art-side-effects-001", "Nausea after starting ART", "hiv_tb", "hiv-tb-sti-continuity", "A patient started ART recently and now wants to stop because of nausea and dizziness.", "ART side effects", "Adherence support and side-effect assessment", ["Assess severity and adherence barriers.", "Support continuation or escalation according to guidance."], ["Severe rash", "Jaundice", "Severe weakness"]),
        ("hc3-tb-treatment-interruption-001", "Missed TB treatment doses", "hiv_tb", "hiv-tb-sti-continuity", "A TB patient missed several doses after travelling for a burial and is afraid the clinic will be angry.", "Missed TB doses", "TB treatment interruption risk", ["Respond without blame.", "Assess symptoms, adherence barrier, and re-link to TB care."], ["Severe illness", "Haemoptysis", "Breathlessness"]),
        ("hc3-pmtct-first-anc-001", "First ANC visit and HIV testing", "hiv_tb", "hiv-tb-sti-continuity", "A pregnant woman attends her first ANC visit with her partner waiting outside and is nervous about testing.", "First ANC HIV testing discussion", "PMTCT counseling and consent", ["Offer respectful testing and counseling.", "Support confidentiality and linkage to PMTCT care."], ["Partner violence risk", "Positive test distress", "Pregnancy danger signs"]),
        ("hc3-genital-ulcer-001", "Painful genital ulcer", "hiv_tb", "hiv-tb-sti-continuity", "A patient asks for a private consultation because of a painful genital sore and fear of being recognized.", "Genital ulcer", "STI syndrome requiring privacy and HIV risk assessment", ["Protect confidentiality.", "Use syndromic assessment and offer HIV/syphilis testing where available."], ["Severe systemic illness", "Sexual violence", "Pregnancy"]),
        ("hc3-cough-hiv-positive-001", "Cough in patient living with HIV", "hiv_tb", "hiv-tb-sti-continuity", "A patient on ART reports cough, fever, and weight loss but says they came only for refill.", "Cough in HIV-positive patient", "TB screen during ART refill", ["Every ART contact is a chance to screen TB symptoms.", "Do not make refill the only task."], ["Severe breathlessness", "Haemoptysis", "Very ill appearance"]),

        # Patient safety / communication
        ("hc3-ipc-hand-hygiene-cluster-001", "Several staff with diarrhoea", "patient_safety", "patient-safety-communication", "Two staff and several patients report diarrhoea after a busy clinic day. The in-charge asks whether this is just food poisoning.", "Possible facility-associated diarrhoea cluster", "IPC and outbreak reporting concern", ["Think beyond individual treatment when cases cluster.", "Start IPC review and notification pathway."], ["Severe dehydration", "Multiple linked cases", "Health worker illness"]),
        ("hc3-consent-minor-procedure-001", "Wound cleaning without explanation", "patient_safety", "patient-safety-communication", "A child is crying before wound cleaning, and the caregiver says nobody explained what will happen.", "Procedure fear and consent", "Communication and consent challenge", ["Explain procedures in understandable language.", "Consent and assent support safer care."], ["Severe wound", "Safeguarding concern", "Shock"]),
        ("hc3-medication-dose-weight-001", "Child dose without weight", "patient_safety", "patient-safety-communication", "A busy dispenser asks for the medicine dose before the child's weight has been checked.", "Prescription for child without weight", "Medication safety risk", ["Weight matters for child dosing.", "Pause unsafe workflow and obtain missing data."], ["Very low weight", "Allergy", "Severe illness"]),
        ("hc3-lab-result-critical-value-001", "Critical lab result after patient left", "patient_safety", "patient-safety-communication", "A lab assistant finds a concerning result after the patient has gone home. Nobody is sure who should call.", "Critical result follow-up", "Communication and task ownership issue", ["Critical results need closed-loop communication.", "Assign responsibility and document action."], ["Unable to contact", "Severe abnormality", "Clinical deterioration"]),
        ("hc3-privacy-crowded-room-001", "Sensitive disclosure in crowded room", "patient_safety", "patient-safety-communication", "A patient starts discussing sexual symptoms while other patients can hear through the curtain.", "Sensitive symptoms with privacy concern", "Confidentiality and respectful care", ["Create privacy before sensitive history.", "Respect improves clinical information quality."], ["Violence disclosure", "Adolescent safety", "Severe symptoms"]),
        ("hc3-referral-communication-001", "Referral without clear note", "patient_safety", "patient-safety-communication", "An ambulance is leaving soon, but the referral note only says 'very sick'. The receiving facility calls asking for details.", "Urgent referral documentation", "Referral communication quality", ["Referral notes need actionable clinical data.", "Vitals, danger signs, actions taken, and reason for referral should be documented."], ["Unstable patient", "Missing vitals", "Treatment given unclear"]),
        ("hc3-stockout-alternative-plan-001", "Medicine stockout during busy clinic", "patient_safety", "patient-safety-communication", "The first-line medicine is out of stock. A patient asks whether any available tablet will do.", "Medicine stockout", "Safe alternative and escalation decision", ["Stockouts require safe escalation, not improvisation.", "Use guideline-compatible alternatives and document constraints."], ["Severe disease", "No safe alternative", "Referral needed"]),

        # Outbreak, IPC, Ebola/VHF
        ("hc3-ebola-fever-bleeding-travel-001", "Fever, bleeding, and travel history", "outbreak", "outbreak-ipc-ebola-vhf", "During the current Ebola alert, a patient with fever reports travel from a border area and later mentions bleeding gums.", "Fever with bleeding and travel", "Suspected viral haemorrhagic fever requiring isolation/notification", ["Separate safely and use IPC immediately.", "Notify according to outbreak protocol and avoid routine waiting-room flow."], ["Bleeding", "Travel/contact history", "Vomiting", "Health worker exposure"]),
        ("hc3-ebola-funeral-contact-001", "Fever after funeral contact", "outbreak", "outbreak-ipc-ebola-vhf", "A trader has fever and weakness after attending a burial where the deceased had an unexplained illness.", "Fever after funeral contact", "Possible Ebola exposure through funeral contact", ["Funeral exposure matters in Ebola risk assessment.", "Isolation and notification are the clinical action."], ["Known contact", "Bleeding", "Severe weakness"]),
        ("hc3-ebola-health-worker-ppe-breach-001", "PPE breach after suspected case", "outbreak", "outbreak-ipc-ebola-vhf", "A cleaner helped move a vomiting patient before anyone suspected Ebola. She now asks whether she should keep working.", "Possible occupational Ebola exposure", "Health worker exposure requiring reporting/monitoring", ["Protect health workers through exposure reporting.", "Do not hide or punish exposure disclosure."], ["Direct fluid contact", "Fever", "PPE breach"]),
        ("hc3-ebola-child-fever-contact-001", "Child with fever and contact history", "outbreak", "outbreak-ipc-ebola-vhf", "A child with fever arrives with an aunt who says a neighbour was taken by the outbreak team last week.", "Child fever with contact concern", "Paediatric suspected VHF triage", ["Apply outbreak screening to children too.", "Use isolation and notification while maintaining caregiver communication."], ["Known contact", "Vomiting", "Bleeding"]),
        ("hc3-ebola-vomiting-at-triage-001", "Vomiting patient at triage", "outbreak", "outbreak-ipc-ebola-vhf", "A patient vomits near the triage bench before being registered. Other patients move closer to watch.", "Vomiting during Ebola alert", "IPC exposure control at facility entrance", ["Control the environment quickly.", "Separate, protect staff, manage contaminated area, and notify."], ["Vomiting", "Travel/contact risk", "Unprotected exposure"]),
        ("hc3-ebola-rumour-community-fear-001", "Rumour and fear at the clinic gate", "outbreak", "outbreak-ipc-ebola-vhf", "Several people gather outside saying the clinic is hiding Ebola. A febrile patient is afraid to enter.", "Community fear during outbreak", "Risk communication and safe triage challenge", ["Clear communication supports outbreak control.", "Do not let fear disrupt safe triage and IPC."], ["Suspected case", "Crowding", "Staff panic"]),
        ("hc3-ebola-death-at-home-report-001", "Report of unexplained death at home", "outbreak", "outbreak-ipc-ebola-vhf", "A village health worker calls about an unexplained death after fever and bleeding. The family wants to wash the body.", "Unexplained death with bleeding", "Community death requiring outbreak notification", ["Unsafe burial practices can spread Ebola.", "Notify response teams and advise against direct body handling."], ["Bleeding before death", "Multiple sick contacts", "Body handling"]),

        # Chronic/NCD/mental health
        ("hc3-hypertension-followup-poor-control-001", "High BP at refill visit", "guidelines_general", "ncd-mental-health", "A teacher comes for a refill and says he feels fine, but the BP reading is very high.", "High blood pressure at refill", "Poorly controlled hypertension requiring risk assessment", ["Asymptomatic high BP still needs action.", "Look for danger symptoms and adherence barriers."], ["Chest pain", "Severe headache", "Neurologic deficit"]),
        ("hc3-diabetes-foot-sore-001", "Small foot sore in diabetes", "guidelines_general", "ncd-mental-health", "A patient with diabetes has a small foot wound and wants only pain tablets because market day is busy.", "Foot sore in diabetes", "Diabetic foot risk", ["Small wounds can be high risk in diabetes.", "Assess infection, sensation, perfusion, and referral need."], ["Spreading infection", "Black tissue", "Fever"]),
        ("hc3-epilepsy-missed-medicine-001", "Seizure after missed medicine", "guidelines_general", "ncd-mental-health", "A patient with known epilepsy had a seizure after running out of medicine for a week.", "Seizure after missed medicine", "Epilepsy adherence and safety assessment", ["Assess injury and triggers.", "Support continuity and safety counseling."], ["Repeated seizures", "Head injury", "Pregnancy"]),
        ("hc3-alcohol-withdrawal-agitation-001", "Agitation after stopping alcohol", "mental_health", "ncd-mental-health", "A man is shaking, sweating, and agitated after abruptly stopping heavy alcohol use.", "Agitation and tremor", "Possible alcohol withdrawal requiring escalation assessment", ["Substance-related presentations can be medical emergencies.", "Assess safety, hydration, and referral threshold."], ["Seizure", "Confusion", "Severe agitation"]),
        ("hc3-psychosis-family-restraint-001", "Family brings restrained patient", "mental_health", "ncd-mental-health", "A family brings a young man tied with cloths because he has been shouting and not sleeping.", "Agitation and possible psychosis", "Acute mental health crisis with dignity/safety needs", ["Protect dignity while ensuring safety.", "Assess medical causes and urgent mental health referral need."], ["Violence risk", "Suicidal risk", "Medical instability"]),
        ("hc3-palliative-pain-counseling-001", "Cancer pain and family distress", "mental_health", "ncd-mental-health", "A family asks why their relative with known cancer is crying at night and whether more pain medicine is allowed.", "Severe chronic pain", "Palliative symptom support and communication", ["Pain relief and communication are clinical priorities.", "Assess severity, red flags, and referral/support options."], ["Severe uncontrolled pain", "Confusion", "Respiratory distress"]),
        ("hc3-elder-fall-confusion-001", "Older adult confused after fall", "emergency", "ncd-mental-health", "An older woman fell yesterday and is now confused. The family says she is just old.", "Confusion after fall", "Possible head injury or delirium", ["New confusion is not normal ageing.", "Assess trauma, infection, glucose, and referral need."], ["Altered mental status", "Head injury", "Hypotension"]),

        # Day-in-clinic mixed practice
        ("hc3-dayclinic-records-chief-complaint-001", "Records desk misses danger sign", "patient_safety", "day-in-clinic-mixed-practice", "At registration, a patient says 'just fever' but also says they fainted. The records queue is moving fast.", "Fever and fainting at registration", "Triage risk hidden in chief complaint", ["Front desk information can reveal danger signs.", "Escalate before routine queue placement."], ["Fainting", "Confusion", "Severe weakness"]),
        ("hc3-dayclinic-lab-delay-001", "Lab result delay changes plan", "patient_safety", "day-in-clinic-mixed-practice", "The clinician is ready to send a patient home, but the lab result arrives late and suggests a different risk level.", "Delayed lab result", "Workflow adaptation and communication", ["Reassess when new information arrives.", "Communicate changes clearly and document."], ["Critical result", "Patient already left", "Unclear ownership"]),
        ("hc3-dayclinic-pharmacy-question-001", "Dispenser asks about pregnancy", "patient_safety", "day-in-clinic-mixed-practice", "The dispenser notices a medicine may not be safe in pregnancy and asks the clinician to confirm.", "Pregnancy safety question", "Team-based medication safety", ["Dispenser questions can prevent harm.", "Clarify missing clinical data before dispensing."], ["Pregnancy", "Allergy", "Contraindication"]),
        ("hc3-dayclinic-followup-phone-001", "Phone follow-up reveals worsening", "patient_safety", "day-in-clinic-mixed-practice", "A nurse calls a patient who missed review. The patient says the swelling is now spreading.", "Worsening after missed follow-up", "Remote follow-up escalation", ["Follow-up calls can identify deterioration.", "Give clear return/referral instructions."], ["Rapid spread", "Fever", "Severe pain"]),
        ("hc3-dayclinic-multiple-urgent-001", "Two urgent patients arrive together", "emergency", "day-in-clinic-mixed-practice", "A labouring mother and a child with convulsions arrive almost at the same time. Staff must organize quickly.", "Competing emergencies", "Prioritization and team organization", ["Triage is team organization under pressure.", "Assign roles and escalate both patients safely."], ["Convulsion", "Bleeding", "Airway concern"]),
        ("hc3-dayclinic-data-entry-error-001", "Wrong patient selected in chart", "patient_safety", "day-in-clinic-mixed-practice", "A clinician notices the age in the chart does not match the child in front of them before entering vitals.", "Possible wrong chart", "Digital patient identification safety", ["Confirm identity before documentation.", "Digital workflows need patient-safety habits."], ["Wrong patient", "Medication order", "Lab result mismatch"]),
        ("hc3-dayclinic-referral-refusal-001", "Family refuses referral", "patient_safety", "day-in-clinic-mixed-practice", "A patient meets referral criteria, but the family says they cannot afford transport and asks for treatment at the HC III.", "Referral refusal", "Communication and risk documentation", ["Explore barriers respectfully.", "Explain risk, document discussion, and seek local support options."], ["Unstable patient", "Child danger sign", "Maternal emergency"]),
    ]
    specs.extend([
        ("hc3-lab-malaria-result-discordant-001", "Positive malaria test but pneumonia signs", "child_health", "pharmacy-lab-diagnostics", "A child has a positive malaria RDT but is breathing fast with chest indrawing. The caregiver expects only malaria medicine.", "Positive malaria test with respiratory signs", "Coexisting or alternative serious illness despite positive malaria test", ["A positive test does not end assessment.", "Treat the whole patient and recognize danger signs."], ["Chest indrawing", "Respiratory distress", "Lethargy"]),
        ("hc3-lab-urine-protein-anc-001", "Urine protein at ANC", "maternal_anc", "pharmacy-lab-diagnostics", "An ANC urine dipstick shows protein after a high BP reading. The mother says she feels fine and wants to go home.", "Proteinuria with high BP", "Pre-eclampsia risk requiring escalation", ["Combine symptoms, BP, and urine findings.", "Do not reassure based only on appearance."], ["Severe hypertension", "Headache", "Visual symptoms"]),
        ("hc3-pharmacy-antibiotic-request-001", "Antibiotic request without assessment", "patient_safety", "pharmacy-lab-diagnostics", "A patient asks the dispenser for antibiotics for a cough because they helped last time. The clinician has not assessed them yet.", "Antibiotic request", "Antimicrobial stewardship and assessment need", ["Antibiotics should follow assessment and guideline indication.", "Pharmacy workflow can protect patient safety."], ["Respiratory distress", "Persistent fever", "Very young infant"]),
        ("hc3-lab-hb-low-pregnancy-001", "Low haemoglobin result in pregnancy", "maternal_anc", "pharmacy-lab-diagnostics", "A pregnant woman looks tired but cheerful. Her haemoglobin result returns lower than expected.", "Low haemoglobin in pregnancy", "Anaemia severity assessment and referral decision", ["Interpret lab results in clinical context.", "Assess severity symptoms and pregnancy risk."], ["Breathlessness at rest", "Syncope", "Severe pallor"]),
        ("hc3-pharmacy-stockout-referral-001", "Stockout affects referral plan", "patient_safety", "pharmacy-lab-diagnostics", "The medicine needed for pre-referral care is unavailable. The team must decide how to document and escalate safely.", "Pre-referral medicine stockout", "Stockout-aware emergency planning", ["Stockouts need clear communication and escalation.", "Document constraints and do not invent unsafe substitutes."], ["Maternal emergency", "Severe child illness", "Shock"]),
        ("hc3-lab-glucose-high-001", "Very high random glucose", "guidelines_general", "pharmacy-lab-diagnostics", "A patient came for fatigue, and the random glucose is very high. The patient says they can still walk and wants tablets.", "Very high blood glucose", "Hyperglycaemia with complication screen", ["Screen for dehydration, infection, and danger symptoms.", "Escalate if unstable or complicated."], ["Vomiting", "Dehydration", "Altered mental status"]),
        ("hc3-test-pregnancy-before-treatment-001", "Pregnancy test changes treatment choice", "guidelines_general", "pharmacy-lab-diagnostics", "A young woman with abdominal pain has a positive pregnancy test, changing what looked like a simple outpatient plan.", "Abdominal pain with positive pregnancy test", "Pregnancy-aware diagnostic reasoning", ["Pregnancy status can change risk and treatment.", "Reassess diagnosis and referral threshold."], ["Severe abdominal pain", "Bleeding", "Fainting"]),
    ])
    return [
        _compact_case(
            case_id=case_id,
            title=title,
            topic=topic,
            chapter_id=chapter_id,
            narrative=narrative,
            chief_complaint=chief_complaint,
            history=["Focused history is required to reveal the key risk.", "No real patient data; simulated training case."],
            vitals={"temperature": "varies", "pulse": "varies", "bp": "varies", "respiratory_rate": "varies"},
            exam_findings=["Focused exam findings should be requested by the learner."],
            diagnosis=diagnosis,
            teaching_points=teaching_points,
            danger_signs=danger_signs,
            guideline_ids=_guidelines_for(topic),
            citation_topic=title,
            scores=(84, 84, 84, 58),
        )
        for case_id, title, topic, chapter_id, narrative, chief_complaint, diagnosis, teaching_points, danger_signs in specs
    ]


def _guidelines_for(topic: str) -> list[str]:
    if topic == "outbreak":
        return ["who-ebola-bundibugyo-2026", "uganda-clinical-guidelines-2023"]
    if topic in {"hiv_tb"}:
        return ["uganda-hiv-aids-consolidated-guidelines-2023", "uganda-clinical-guidelines-2023"]
    if topic in {"child_health", "neonatal"}:
        return ["who-imnci-chart-booklet", "uganda-clinical-guidelines-2023"]
    return ["uganda-clinical-guidelines-2023"]


def _compact_case(
    case_id: str,
    title: str,
    topic: str,
    narrative: str,
    chief_complaint: str,
    history: list[str],
    vitals: dict[str, str],
    exam_findings: list[str],
    diagnosis: str,
    teaching_points: list[str],
    danger_signs: list[str],
    guideline_ids: list[str],
    citation_topic: str,
    scores: tuple[int, int, int, int],
    chapter_id: str | None = None,
) -> CanonicalCase:
    return _case(
        case_id=case_id,
        title=title,
        topic=topic,
        narrative=narrative,
        patient=_compact_patient(topic),
        truth=ClinicalTruth(
            chief_complaint=chief_complaint,
            history=history,
            review_of_systems=_compact_review_of_systems(topic),
            vitals=_concrete_vitals(topic, vitals),
            exam_findings=exam_findings,
            available_tests=_compact_available_tests(topic),
            diagnosis=diagnosis,
            differentials=_compact_differentials(topic),
            management=[
                "Assess danger signs and immediate stability.",
                "Classify the presentation using the case action bundle before treatment.",
                "Document clearly and refer/escalate when threshold is met.",
            ],
            referral_threshold="Refer or escalate if danger signs, instability, or care needs exceed HC III capacity.",
            medicines=["No medicine is selected until indication, contraindication checks, and dose are documented in the action bundle."],
            follow_up=["Give clear safety-net advice and document the plan."],
            danger_signs=danger_signs,
        ),
        teaching_points=teaching_points,
        guideline_ids=guideline_ids,
        citation_topic=citation_topic,
        scores=scores,
        chapter_id=chapter_id,
    )


def _compact_patient(topic: str) -> SimulatedPatient:
    if topic in {"child_health"}:
        return SimulatedPatient("Simulated child", "24 months, 11 kg", "unknown", "Caregiver present")
    if topic == "neonatal":
        return SimulatedPatient("Simulated neonate", "6 days old, 3.1 kg", "unknown", "Mother present")
    if topic in {"maternal_anc", "maternal_delivery", "postnatal"}:
        return SimulatedPatient("Simulated mother", "26 years", "female", "Pregnancy or postnatal care visit")
    return SimulatedPatient("Simulated patient", "34 years", "unknown")


def _concrete_vitals(topic: str, vitals: dict[str, str]) -> dict[str, str]:
    if not vitals or any(value.strip().lower() == "varies" for value in vitals.values()):
        if topic == "child_health":
            return {
                "temperature": "38.4 C",
                "pulse": "132 bpm",
                "respiratory_rate": "42/min",
                "weight": "11 kg",
            }
        if topic == "neonatal":
            return {
                "temperature": "35.8 C",
                "pulse": "158 bpm",
                "respiratory_rate": "56/min",
                "weight": "3.1 kg",
            }
        if topic in {"maternal_anc", "maternal_delivery", "postnatal"}:
            return {
                "temperature": "37.4 C",
                "pulse": "104 bpm",
                "bp": "148/96 mmHg",
                "respiratory_rate": "22/min",
            }
        if topic == "outbreak":
            return {
                "temperature": "38.9 C",
                "pulse": "112 bpm",
                "bp": "102/66 mmHg",
                "respiratory_rate": "24/min",
            }
        return {
            "temperature": "37.8 C",
            "pulse": "96 bpm",
            "bp": "128/82 mmHg",
            "respiratory_rate": "20/min",
        }
    return vitals


def _compact_review_of_systems(topic: str) -> list[str]:
    if topic == "outbreak":
        return ["Bleeding symptoms checked", "Travel and contact exposure checked", "Vomiting or diarrhoea checked"]
    if topic in {"child_health", "neonatal"}:
        return ["Ability to drink or breastfeed checked", "Convulsions checked", "Lethargy checked"]
    if topic in {"maternal_anc", "maternal_delivery", "postnatal"}:
        return ["Headache and visual symptoms checked", "Bleeding checked", "Fetal or postnatal danger symptoms checked"]
    return ["Pain, breathing, hydration, and mental status reviewed"]


def _compact_available_tests(topic: str) -> list[str]:
    if topic == "outbreak":
        return ["Outbreak screening checklist", "District notification pathway"]
    if topic == "hiv_tb":
        return ["Sputum sample transport or referral pathway", "HIV test with consent", "Malaria RDT if febrile"]
    if topic in {"child_health", "neonatal"}:
        return ["Weight", "Temperature", "Malaria RDT if febrile", "Blood glucose if altered or convulsing"]
    if topic in {"maternal_anc", "maternal_delivery", "postnatal"}:
        return ["Repeat blood pressure", "Urine protein dipstick", "Haemoglobin if available"]
    return ["Malaria RDT if febrile", "Urine dipstick when urinary or ANC concern", "Random blood glucose when altered or very ill"]


def _compact_differentials(topic: str) -> list[str]:
    if topic == "outbreak":
        return ["Malaria", "Sepsis", "Viral haemorrhagic fever"]
    if topic == "hiv_tb":
        return ["Pulmonary TB", "Bacterial pneumonia", "HIV-related opportunistic infection"]
    if topic in {"child_health", "neonatal"}:
        return ["Malaria", "Pneumonia", "Sepsis or severe bacterial infection"]
    if topic in {"maternal_anc", "maternal_delivery", "postnatal"}:
        return ["Hypertensive disorder of pregnancy", "Anaemia", "Infection or obstetric emergency"]
    return ["Common outpatient condition", "Emergency presentation", "Referral-level condition"]


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
    narrative: str | None = None,
    chapter_id: str | None = None,
) -> CanonicalCase:
    if not isinstance(scores, CaseScores):
        scores = CaseScores(*scores)
    truth = enrich_case_truth(case_id, topic, truth, guideline_ids)
    citation = Citation(
        id=f"{case_id}-source",
        source_document_id=guideline_ids[0],
        title=citation_topic,
        section=citation_topic,
    )
    return CanonicalCase(
        id=case_id,
        title=title,
        narrative=narrative or _narrative_for(title, truth.chief_complaint),
        chapter_id=chapter_id or _chapter_for_topic(topic),
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


def _chapter_for_topic(topic: str) -> str:
    return {
        "malaria": "fever-malaria-acute-illness",
        "child_health": "child-health-imnci",
        "maternal_anc": "maternal-midwifery-emergencies",
        "neonatal": "neonatal-emergency-care",
        "hiv_tb": "hiv-tb-sti-continuity",
        "family_planning": "maternal-midwifery-emergencies",
        "emergency": "emergency-critical-care",
        "patient_safety": "patient-safety-communication",
        "mental_health": "mental-health-psychosocial-care",
        "outbreak": "outbreak-ipc-ebola-vhf",
    }.get(topic, "general-hc3-practice")


def _narrative_for(title: str, chief_complaint: str) -> str:
    return (
        "It is a busy morning at a rural HC III. A patient is added to your queue while other staff are "
        f"balancing immunizations, ANC visits, and urgent walk-ins. The presenting concern is {chief_complaint.lower()}. "
        f"The case is titled '{title}', but the learner should approach it as an unfolding clinical encounter, not as a diagnosis already made."
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
    level_2 = build_playable_variant(
        case.id,
        VariantPlan(
            id=f"{case.id}-level-2",
            label="Guided Reasoning",
            difficulty_level=2,
            quest_type="guided_reasoning",
            initially_visible=[
                "chief_complaint",
                "vitals",
                "exam_findings[0]",
                "available_tests",
            ],
            hidden_fields=_level_2_hidden_fields_for(case),
            ehr_tasks=[
                EhrLikeTask(
                    id=f"{case.id}-ask-key-history",
                    task_type="ask_history",
                    prompt="Ask for the missing history detail that most changes risk or management.",
                    scoring_weight=2,
                ),
                EhrLikeTask(
                    id=f"{case.id}-document-next-step",
                    task_type="write_plan",
                    prompt="Document the safest next step in the simulated chart.",
                    scoring_weight=2,
                ),
            ],
            scoring_rules=[
                ScoringRule(
                    id=f"{case.id}-focused-history",
                    description="Requests the missing history detail before choosing management.",
                    points=3,
                    citation_ids=[source_citation_id],
                ),
                ScoringRule(
                    id=f"{case.id}-safe-next-step",
                    description="Documents a safe next step consistent with the case risk.",
                    points=3,
                    citation_ids=[source_citation_id],
                ),
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
    return [level_1, level_2, level_3]


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


def _level_2_hidden_fields_for(case: CanonicalCase) -> dict[str, str]:
    hidden: dict[str, str] = {}
    if case.clinical_truth.history:
        hidden["history[0]"] = "Level 2 keeps vitals visible but requires the learner to ask for the key history detail."
    elif case.clinical_truth.exam_findings:
        hidden["exam_findings[0]"] = "Level 2 requires one focused clinical action before the full picture is visible."
    return hidden
