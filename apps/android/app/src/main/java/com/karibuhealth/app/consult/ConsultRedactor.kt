package com.karibuhealth.app.consult

import com.karibuhealth.app.domain.model.Patient
import com.karibuhealth.app.domain.model.PatientVitals
import com.karibuhealth.app.domain.model.Visit
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.LocalDate
import java.time.Period

/** Builds a de-identified clinical bundle for consult (never includes names/phone/IDs). */
object ConsultRedactor {
    fun buildSnapshot(
        visit: Visit,
        patient: Patient?,
        vitals: PatientVitals?,
        providerTranscript: String?,
    ): JsonObject = buildJsonObject {
        put("age_band", ageBand(patient))
        patient?.sex?.let { put("sex", it) }
        visit.chiefComplaint?.takeIf { it.isNotBlank() }?.let { put("chief_complaint", it) }
        visit.diagnosis?.takeIf { it.isNotBlank() }?.let { put("diagnosis", it) }
        visit.testsOrdered?.takeIf { it.isNotBlank() }?.let { put("tests_ordered", it) }
        visit.labResults?.takeIf { it.isNotBlank() }?.let { put("lab_results", it) }
        visit.medications?.takeIf { it.isNotBlank() }?.let { put("medications", it) }
        providerTranscript?.takeIf { it.isNotBlank() }?.let { put("clinical_note_excerpt", it.take(4000)) }
        vitals?.let { v ->
            buildJsonObject {
                v.tempC?.let { put("temp_c", it) }
                v.bpSystolic?.let { put("bp_systolic", it) }
                v.bpDiastolic?.let { put("bp_diastolic", it) }
                v.pulseBpm?.let { put("pulse_bpm", it) }
                v.respRate?.let { put("resp_rate", it) }
                v.spo2Pct?.let { put("spo2_pct", it) }
                v.weightKg?.let { put("weight_kg", it) }
            }.let { put("vitals", it) }
        }
    }

    private fun ageBand(patient: Patient?): String {
        val dob = patient?.dateOfBirth ?: return "unknown"
        val years = runCatching { Period.between(LocalDate.parse(dob), LocalDate.now()).years }.getOrNull() ?: return "unknown"
        return when {
            years < 1 -> "infant"
            years < 5 -> "child_under_5"
            years < 18 -> "child_5_17"
            years < 65 -> "adult"
            else -> "older_adult"
        }
    }
}
