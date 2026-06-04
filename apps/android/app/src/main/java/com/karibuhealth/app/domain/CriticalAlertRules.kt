package com.karibuhealth.app.domain

import com.karibuhealth.app.domain.model.Patient
import com.karibuhealth.app.domain.model.PatientVitals
import java.time.LocalDate
import java.time.Period

data class CriticalAlertCandidate(
    val ruleSlug: String,
    val confirmQuestion: String,
    val clinicalPrompt: String,
    val librarySlug: String? = null,
)

object CriticalAlertRules {
    /**
     * Deterministic v1 rules (docs/ai-clinical-assist.md). Does not use AI.
     */
    fun evaluate(patient: Patient?, vitals: PatientVitals?): List<CriticalAlertCandidate> {
        if (vitals?.tempC == null) return emptyList()
        val ageYears = patient?.dateOfBirth?.let { dob ->
            runCatching { Period.between(LocalDate.parse(dob), LocalDate.now()).years }.getOrNull()
        }
        val tempC = vitals.tempC
        val out = mutableListOf<CriticalAlertCandidate>()

        if (ageYears != null && ageYears < 1 && tempC >= 39.4) {
            out += CriticalAlertCandidate(
                ruleSlug = "infant_high_fever",
                confirmQuestion = "Was this temperature (${tempC}°C) entered correctly?",
                clinicalPrompt = "If confirmed, consider serious bacterial infection and meningitis workup per IMCI danger signs.",
                librarySlug = null,
            )
        }

        return out
    }
}
