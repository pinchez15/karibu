package com.karibuhealth.app.domain

/**
 * Deterministic, on-device danger-sign evaluation for an inpatient rounds
 * observation (docs/hciii-inpatient-panel-spec.md, Phase 2). No AI, no network —
 * it fires on the ward at night when there is no signal.
 *
 * Clinically signed off. Decoupled from [CriticalAlertRules] (which scores OPD
 * vitals) because inpatient rounds add danger signals vitals alone don't carry —
 * conscious level (AVPU) and the IMCI severe-sign checklist — and the panel set a
 * lower fever watch threshold (≥39 °C → consider referral) than the OPD
 * hyperpyrexia rule. Thresholds are isolated as constants for review.
 *
 * Every finding resolves to the same disposition: this is a prompt to the
 * clinician — *consider referral / call the Clinical Officer* — never an action.
 * SpO₂ is alerted on only when a reading is present; its ABSENCE never suppresses
 * any other danger sign (HC III oximeters are scarce).
 */
object InpatientDangerSigns {

    const val ACTION = "Consider referral · call the Clinical Officer"

    /** Fever watch threshold (°C) for an admitted patient. */
    const val FEVER_C: Double = 39.0
    const val HYPOXIA_SPO2: Int = 90
    const val SHOCK_SYSTOLIC: Int = 90
    const val HYPERTENSIVE_SYSTOLIC: Int = 180
    const val HYPERTENSIVE_DIASTOLIC: Int = 120

    data class Observation(
        val tempC: Double? = null,
        val pulseBpm: Int? = null,
        val respRate: Int? = null,
        val bpSystolic: Int? = null,
        val bpDiastolic: Int? = null,
        val spo2Pct: Int? = null,
        val avpu: String? = null,
        val imciNotFeeding: Boolean = false,
        val imciVomitingEverything: Boolean = false,
        val imciConvulsions: Boolean = false,
        val imciLethargicUnconscious: Boolean = false,
    )

    data class Finding(val slug: String, val label: String)

    /** IMCI fast-breathing threshold (breaths/min) for an age in whole years. */
    fun fastBreathingThreshold(ageYears: Int): Int = when {
        ageYears < 1 -> 50
        ageYears < 5 -> 40
        else -> 30
    }

    /**
     * Returns the danger signs the observation trips. Empty = no danger sign.
     * [ageYears] enables the age-banded breathing + adult BP rules; when unknown,
     * those age-dependent rules are skipped to avoid false alarms.
     */
    fun evaluate(obs: Observation, ageYears: Int?): List<Finding> {
        val out = mutableListOf<Finding>()

        obs.spo2Pct?.let { if (it < HYPOXIA_SPO2) out += Finding("hypoxia", "SpO₂ $it% — hypoxia") }

        obs.tempC?.let { if (it >= FEVER_C) out += Finding("high_fever", "Temperature ${trim(it)}°C") }

        if (obs.respRate != null && ageYears != null && obs.respRate >= fastBreathingThreshold(ageYears)) {
            out += Finding("fast_breathing", "Respiratory rate ${obs.respRate}/min — fast breathing for age")
        } else if (obs.respRate != null && ageYears == null && obs.respRate > 30) {
            out += Finding("fast_breathing", "Respiratory rate ${obs.respRate}/min")
        }

        when (obs.avpu?.uppercase()) {
            "P" -> out += Finding("reduced_consciousness", "Responds to pain only (AVPU P)")
            "U" -> out += Finding("reduced_consciousness", "Unresponsive (AVPU U)")
        }

        // Adult/adolescent BP only — paediatric norms differ.
        if (ageYears != null && ageYears >= 12) {
            val sys = obs.bpSystolic
            val dia = obs.bpDiastolic
            if (sys != null && sys < SHOCK_SYSTOLIC) {
                out += Finding("shock", "BP ${bpText(sys, dia)} — possible shock")
            }
            if ((sys != null && sys >= HYPERTENSIVE_SYSTOLIC) || (dia != null && dia >= HYPERTENSIVE_DIASTOLIC)) {
                out += Finding("hypertensive_crisis", "BP ${bpText(sys, dia)} — severe hypertension")
            }
        }

        if (obs.imciNotFeeding) out += Finding("imci_not_feeding", "Not feeding / drinking")
        if (obs.imciVomitingEverything) out += Finding("imci_vomiting", "Vomiting everything")
        if (obs.imciConvulsions) out += Finding("imci_convulsions", "Convulsions")
        if (obs.imciLethargicUnconscious) out += Finding("imci_lethargic", "Lethargic / unconscious")

        return out
    }

    private fun bpText(sys: Int?, dia: Int?): String = "${sys ?: "—"}/${dia ?: "—"}"

    private fun trim(d: Double): String =
        if (d == d.toLong().toDouble()) d.toLong().toString() else d.toString()
}
