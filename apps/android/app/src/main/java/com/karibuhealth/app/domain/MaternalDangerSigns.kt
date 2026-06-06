package com.karibuhealth.app.domain

/**
 * Maternal + newborn danger-sign evaluation and first-response checklists for
 * HC III maternity (docs/hciii-inpatient-panel-spec.md, Phase 3). Pure,
 * deterministic, on-device — these fire at night with no signal.
 *
 * The biggest maternal killers at HC III are PPH and (pre-)eclampsia, and the
 * biggest newborn killer is a baby not breathing in the first minute. So this
 * carries the **clinically signed-off** first-response bundles, including the
 * MgSO₄ and oxytocin/misoprostol dosing, per Uganda Clinical Guidelines / EmONC.
 * The clinician disposes; these prompt and never act.
 *
 * Thresholds and dosing are isolated as constants for clinical review.
 */
object MaternalDangerSigns {

    const val SEVERE_SYSTOLIC = 160
    const val SEVERE_DIASTOLIC = 110
    const val MILD_SYSTOLIC = 140
    const val MILD_DIASTOLIC = 90
    const val PPH_BLOOD_LOSS_ML = 500
    const val SHOCK_PULSE = 110
    const val SHOCK_SYSTOLIC = 90

    data class Input(
        val bpSystolic: Int? = null,
        val bpDiastolic: Int? = null,
        val pulseBpm: Int? = null,
        val headache: Boolean = false,
        val visualChanges: Boolean = false,
        val epigastricPain: Boolean = false,
        val convulsions: Boolean = false,
        val bloodLossMl: Int? = null,
        val heavyBleeding: Boolean = false,
        val postDelivery: Boolean = false,
    )

    /** A danger alert plus its first-response checklist (each step shown to the clinician). */
    data class Alert(val slug: String, val title: String, val steps: List<String>)

    private val ECLAMPSIA = Alert(
        "eclampsia",
        "Eclampsia / severe pre-eclampsia — give MgSO₄ now",
        listOf(
            "Call for help. Protect the airway; turn to the left side.",
            "MgSO₄ loading dose: 4 g IV over 5–10 min, PLUS 10 g IM (5 g into each buttock).",
            "If BP ≥160/110: give antihypertensive per Uganda Clinical Guidelines.",
            "Insert IV line, catheterise, monitor BP / urine / reflexes / respiration.",
            "Refer urgently — continue MgSO₄ maintenance en route.",
        ),
    )

    private val PRE_ECLAMPSIA = Alert(
        "pre_eclampsia",
        "Severe hypertension in pregnancy — assess for pre-eclampsia",
        listOf(
            "Confirm BP; check for headache, visual changes, epigastric pain, reflexes.",
            "If severe features: give MgSO₄ loading dose (4 g IV + 10 g IM) and an antihypertensive.",
            "Insert IV line, catheterise, monitor.",
            "Refer urgently.",
        ),
    )

    private val PPH = Alert(
        "pph",
        "Postpartum haemorrhage — act now",
        listOf(
            "Call for help. Rub up a contraction (uterine massage).",
            "Oxytocin 10 IU IM. If bleeding continues: misoprostol 800 µg sublingual.",
            "Two wide-bore IV lines; run IV fluids. Empty the bladder.",
            "Examine for tears and retained placenta/products.",
            "Refer urgently — continue uterotonics and fluids en route.",
        ),
    )

    /** Helping Babies Breathe — the golden-minute newborn resuscitation prompt. */
    val HELPING_BABIES_BREATHE = Alert(
        "newborn_not_breathing",
        "Baby not breathing — the Golden Minute",
        listOf(
            "Dry the baby and keep warm; clear the airway if needed.",
            "Stimulate (rub the back). If still not breathing within 30 s:",
            "Start bag-and-mask ventilation — 40 breaths/min, watch the chest rise.",
            "Reassess heart rate and breathing; keep ventilating until breathing.",
            "Call for help and prepare to refer the newborn.",
        ),
    )

    fun evaluate(input: Input): List<Alert> {
        val out = mutableListOf<Alert>()
        val sys = input.bpSystolic
        val dia = input.bpDiastolic
        val severeBp = (sys != null && sys >= SEVERE_SYSTOLIC) || (dia != null && dia >= SEVERE_DIASTOLIC)
        val mildBp = (sys != null && sys >= MILD_SYSTOLIC) || (dia != null && dia >= MILD_DIASTOLIC)
        val anySymptom = input.headache || input.visualChanges || input.epigastricPain

        if (input.convulsions) {
            out += ECLAMPSIA
        } else if (severeBp || (anySymptom && mildBp)) {
            out += PRE_ECLAMPSIA
        }

        val shock = input.pulseBpm != null && input.pulseBpm >= SHOCK_PULSE &&
            sys != null && sys < SHOCK_SYSTOLIC
        val bigLoss = input.bloodLossMl != null && input.bloodLossMl >= PPH_BLOOD_LOSS_ML
        if (input.heavyBleeding || bigLoss || (input.postDelivery && shock)) {
            out += PPH
        }

        return out
    }
}
