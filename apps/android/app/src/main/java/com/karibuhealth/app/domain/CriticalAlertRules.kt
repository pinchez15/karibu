package com.karibuhealth.app.domain

import com.karibuhealth.app.domain.model.Patient
import com.karibuhealth.app.domain.model.PatientVitals
import java.time.LocalDate
import java.time.Period

/**
 * Acuity tier of a critical-alert candidate. Drives the banner's salience so
 * colour can never drift from clinical risk.
 */
enum class AlertTier {
    /** A clinical danger sign — act now. The banner renders RED. */
    Critical,

    /** A data-entry sanity check ("did you enter this right?"). Stays calm. */
    Confirm,
}

data class CriticalAlertCandidate(
    val ruleSlug: String,
    val confirmQuestion: String,
    val clinicalPrompt: String,
    val librarySlug: String? = null,
    val tier: AlertTier = AlertTier.Confirm,
)

object CriticalAlertRules {

    /**
     * Rule slugs that are clinical danger signs (red). Everything else is a calm
     * data-confirmation prompt. This is the single source of truth shared with
     * the banner ([tierFor]) so the acuity tier and the colour can never drift.
     */
    private val CRITICAL_RULES = setOf(
        "hypoxia",
        "hyperpyrexia",
        "fast_breathing",
        "hypertensive_crisis",
        "severe_hypotension",
        "severe_acute_malnutrition",
    )

    /** Acuity tier for a rule slug — used by both [evaluate] and the banner. */
    fun tierFor(ruleSlug: String): AlertTier =
        if (ruleSlug in CRITICAL_RULES) AlertTier.Critical else AlertTier.Confirm

    /**
     * Deterministic danger-sign rules for HC III (docs/ai-clinical-assist.md).
     * No AI. Thresholds follow Uganda Clinical Guidelines / IMCI and have been
     * clinically reviewed. These surface a prompt for the clinician — they never
     * act. The clinician is always the final authority.
     */
    fun evaluate(patient: Patient?, vitals: PatientVitals?): List<CriticalAlertCandidate> {
        if (vitals == null) return emptyList()

        val ageYears = patient?.dateOfBirth?.let { dob ->
            runCatching { Period.between(LocalDate.parse(dob), LocalDate.now()).years }.getOrNull()
        }
        val out = mutableListOf<CriticalAlertCandidate>()
        fun add(slug: String, question: String, prompt: String, library: String? = null) {
            out += CriticalAlertCandidate(slug, question, prompt, library, tierFor(slug))
        }

        val temp = vitals.tempC
        val spo2 = vitals.spo2Pct
        val sys = vitals.bpSystolic
        val dia = vitals.bpDiastolic
        val rr = vitals.respRate
        val muac = vitals.muacCm

        // ── Critical danger signs (red) ──────────────────────────────────────
        if (spo2 != null && spo2 < 90) {
            add(
                "hypoxia",
                "SpO₂ $spo2% — hypoxia.",
                "Give oxygen and manage or refer per the HC III emergency protocol. Re-check on room air and on oxygen.",
            )
        }
        if (temp != null && temp >= 40.0) {
            add(
                "hyperpyrexia",
                "Temperature $temp°C — hyperpyrexia.",
                "Start active cooling and antipyretics; look for serious infection and IMCI danger signs.",
            )
        }
        if (rr != null && ageYears != null && rr >= fastBreathingThreshold(ageYears)) {
            add(
                "fast_breathing",
                "Respiratory rate $rr/min — fast breathing for age.",
                "Classify pneumonia and screen for danger signs (IMCI). Consider oxygen and referral if severe.",
            )
        }
        // Adult/adolescent BP rules only — paediatric BP norms differ, so these
        // require a known age >= 12 to avoid false alarms in children.
        if (ageYears != null && ageYears >= 12) {
            if ((sys != null && sys >= 180) || (dia != null && dia >= 120)) {
                add(
                    "hypertensive_crisis",
                    "BP ${bpText(sys, dia)} — severe hypertension.",
                    "Assess for a hypertensive emergency / end-organ damage per Uganda Clinical Guidelines.",
                )
            }
            if (sys != null && sys < 90) {
                add(
                    "severe_hypotension",
                    "BP ${bpText(sys, dia)} — possible shock.",
                    "Assess perfusion and mental state; resuscitate and refer if shock is confirmed.",
                )
            }
        }
        // Severe acute malnutrition (children 6–59 months): MUAC < 11.5 cm.
        if (muac != null && muac < 11.5 && ageYears != null && ageYears < 5) {
            add(
                "severe_acute_malnutrition",
                "MUAC $muac cm — severe acute malnutrition.",
                "Check for bilateral oedema and complications; manage or refer per IMAM.",
            )
        }

        // ── Data-confirmation prompts (calm) ─────────────────────────────────
        // An infant temperature this high is plausible but easy to mis-key, so
        // we confirm the value rather than raise a red flag (>= 40 °C is already
        // handled above as hyperpyrexia).
        if (ageYears != null && ageYears < 1 && temp != null && temp >= 39.4 && temp < 40.0) {
            add(
                "infant_high_fever",
                "Was this temperature ($temp°C) entered correctly?",
                "If confirmed, consider serious bacterial infection and a meningitis workup per IMCI danger signs.",
            )
        }

        return out
    }

    /** IMCI fast-breathing threshold (breaths/min) for an age in whole years. */
    private fun fastBreathingThreshold(ageYears: Int): Int = when {
        // <2 months is >=60; we only have whole years, so use the more sensitive
        // 50 for all infants under one year.
        ageYears < 1 -> 50
        ageYears < 5 -> 40
        else -> 30
    }

    private fun bpText(sys: Int?, dia: Int?): String = "${sys ?: "—"}/${dia ?: "—"}"
}
