package com.karibuhealth.app.domain

/**
 * Newborn danger-sign screening for the postnatal period (docs/hciii-inpatient-panel-spec.md,
 * Phase 4 + the reality-check's "small baby" safety gap). Pure, deterministic,
 * on-device. Clinically signed off.
 *
 * The sickest-newborn signals at HC III are low birth weight / prematurity,
 * hypothermia, not feeding, fast breathing, convulsions, and jaundice — each of
 * which routes to the same pragmatic bundle: keep warm, feed, watch, refer.
 */
object NewbornDangerSigns {

    const val LBW_G = 2500
    const val VERY_LOW_G = 1500
    const val HYPOTHERMIA_C = 36.5
    const val FAST_BREATHING = 60

    /** Pragmatic HC III bundle shown whenever any newborn danger sign is present. */
    val CARE_BUNDLE = listOf(
        "Keep warm — skin-to-skin / kangaroo care, cover the head.",
        "Feed early and often (breast or expressed milk, about 3-hourly).",
        "Watch breathing, temperature and feeding closely.",
        "Refer urgently if very small, not feeding, cold, or any danger sign persists.",
    )

    data class Input(
        val birthWeightG: Int? = null,
        val tempC: Double? = null,
        val respRate: Int? = null,
        val notFeeding: Boolean = false,
        val convulsions: Boolean = false,
        val jaundice: Boolean = false,
    )

    data class Finding(val slug: String, val label: String)

    fun evaluate(input: Input): List<Finding> {
        val out = mutableListOf<Finding>()
        input.birthWeightG?.let { w ->
            when {
                w < VERY_LOW_G -> out += Finding("very_low_birth_weight", "Very low birth weight (${w} g) — refer")
                w < LBW_G -> out += Finding("low_birth_weight", "Low birth weight (${w} g) — small baby care")
            }
        }
        input.tempC?.let { if (it < HYPOTHERMIA_C) out += Finding("hypothermia", "Hypothermia (${it}°C)") }
        input.respRate?.let { if (it >= FAST_BREATHING) out += Finding("fast_breathing", "Fast breathing (${it}/min)") }
        if (input.notFeeding) out += Finding("not_feeding", "Not feeding well")
        if (input.convulsions) out += Finding("convulsions", "Convulsions")
        if (input.jaundice) out += Finding("jaundice", "Jaundice")
        return out
    }
}
