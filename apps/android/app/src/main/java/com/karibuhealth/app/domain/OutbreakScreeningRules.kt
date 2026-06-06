package com.karibuhealth.app.domain

/**
 * Outbreak screening — the clinical logic that decides whether a patient meets
 * an outbreak **suspect-case definition** while the clinic's region is ON
 * protocol (see migration 052 / [com.karibuhealth.app.data.repository.RegionProtocolRepository]).
 *
 * Pure and deterministic; no AI. This is the gate the (future) interruptive
 * Ebola banner calls — it is intentionally decoupled from [CriticalAlertRules]
 * so it can land additively while the tiered-alert UI work merges separately.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NEEDS FINAL CLINICAL SIGN-OFF before the interruptive alert ships.
 *
 * Encodes the Uganda MoH / WHO **VHF (Ebola/Marburg) community suspect-case
 * definition**:
 *
 *   Acute onset of fever (≥ 38.0 °C)  AND  any one of:
 *     • an epidemiological link (contact with a suspected/confirmed case,
 *       attendance at a funeral of a VHF death, or contact with a sick/dead
 *       wild animal), OR
 *     • ≥ 3 of the listed constitutional symptoms, OR
 *     • any unexplained bleeding.
 *
 * Thresholds are isolated as constants so a reviewer can adjust them without
 * touching the logic.
 * ─────────────────────────────────────────────────────────────────────────
 */
object OutbreakScreeningRules {

    const val EBOLA = "ebola"

    /** Fever threshold (°C) for the suspect definition. */
    const val FEVER_THRESHOLD_C: Double = 38.0

    /** How many constitutional symptoms (without a contact/bleeding) suffice. */
    const val MIN_SYMPTOMS: Int = 3

    /** Constitutional symptoms in the VHF suspect-case definition. */
    enum class VhfSymptom(val display: String) {
        Headache("Headache"),
        Vomiting("Vomiting / nausea"),
        Anorexia("Loss of appetite"),
        Diarrhoea("Diarrhoea"),
        Lethargy("Intense fatigue / lethargy"),
        AbdominalPain("Abdominal pain"),
        MusclePain("Muscle or joint pain"),
        DifficultySwallowing("Difficulty swallowing"),
        DifficultyBreathing("Difficulty breathing"),
        Hiccups("Hiccups"),
    }

    /**
     * Triage inputs for outbreak screening. [tempC] comes from recorded vitals;
     * the rest from an outbreak screening checklist (captured by the UI that
     * wires this rule in — not yet built).
     */
    data class Input(
        val tempC: Double?,
        val epidemiologicalContact: Boolean = false,
        val unexplainedBleeding: Boolean = false,
        val symptoms: Set<VhfSymptom> = emptySet(),
    )

    data class Result(
        val protocol: String,
        val isSuspect: Boolean,
        /** Human-readable reasons the patient met (or did not meet) the definition. */
        val triggers: List<String>,
    )

    /**
     * Screen for Ebola/VHF. Returns a non-suspect result (no triggers) unless
     * the suspect-case definition is met. Callers should only invoke this when
     * the clinic is ON the [EBOLA] protocol.
     */
    fun screenEbola(input: Input): Result {
        val triggers = mutableListOf<String>()

        val hasFever = input.tempC != null && input.tempC >= FEVER_THRESHOLD_C
        if (!hasFever) {
            return Result(protocol = EBOLA, isSuspect = false, triggers = emptyList())
        }
        triggers += "Fever ${input.tempC}°C (≥ ${FEVER_THRESHOLD_C}°C)"

        var qualifies = false
        if (input.epidemiologicalContact) {
            triggers += "Epidemiological contact reported"
            qualifies = true
        }
        if (input.unexplainedBleeding) {
            triggers += "Unexplained bleeding"
            qualifies = true
        }
        if (input.symptoms.size >= MIN_SYMPTOMS) {
            triggers += "${input.symptoms.size} constitutional symptoms: " +
                input.symptoms.joinToString(", ") { it.display }
            qualifies = true
        }

        return if (qualifies) {
            Result(protocol = EBOLA, isSuspect = true, triggers = triggers)
        } else {
            // Fever alone, below the definition — not a suspect case.
            Result(protocol = EBOLA, isSuspect = false, triggers = emptyList())
        }
    }
}
