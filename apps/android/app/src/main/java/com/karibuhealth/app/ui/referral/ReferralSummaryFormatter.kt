package com.karibuhealth.app.ui.referral

import com.karibuhealth.app.domain.model.Patient
import com.karibuhealth.app.domain.model.PatientVitals
import com.karibuhealth.app.domain.model.Referral
import com.karibuhealth.app.domain.model.ReferralUrgency
import com.karibuhealth.app.domain.model.Visit
import com.karibuhealth.app.ui.util.formatPatientName
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

object ReferralSummaryFormatter {
    fun buildPrintableSummary(
        clinicName: String?,
        patient: Patient,
        visit: Visit?,
        vitals: PatientVitals?,
        referral: Referral,
        referringClinician: String?,
    ): String {
        val patientName = formatPatientName(
            patient.firstName,
            patient.lastName,
            patient.displayName,
        )
        val patientNumber = patient.patientNumber ?: "PT-${patient.id.take(8)}"
        val whenReferred = runCatching {
            Instant.parse(referral.createdAt)
                .atZone(ZoneId.systemDefault())
                .format(DateTimeFormatter.ofPattern("d MMM yyyy, HH:mm"))
        }.getOrDefault(referral.createdAt)

        val lines = buildList {
            add("KARIBU HEALTH — REFERRAL / TRANSFER SUMMARY")
            add("=".repeat(48))
            add("")
            add("Referring facility: ${clinicName ?: "Health Centre III"}")
            referringClinician?.let { add("Referring clinician: $it") }
            add("Date: $whenReferred")
            add("Urgency: ${referral.urgency.label.uppercase()}")
            add("")
            add("PATIENT")
            add("-".repeat(48))
            add("Name: $patientName")
            add("Patient ID: $patientNumber")
            patient.sex?.let { add("Sex: $it") }
            patient.dateOfBirth?.let { add("Date of birth: $it") }
            patient.whatsappNumber?.let { add("Phone: $it") }
            add("")
            add("RECEIVING FACILITY")
            add("-".repeat(48))
            add(referral.toFacility)
            referral.transportMode?.takeIf { it.isNotBlank() }?.let {
                add("Transport: $it")
            }
            add("")
            add("REASON FOR REFERRAL")
            add("-".repeat(48))
            add(referral.reason)
            add("")
            visit?.chiefComplaint?.takeIf { it.isNotBlank() }?.let {
                add("Chief complaint: $it")
                add("")
            }
            vitals?.let { v ->
                add("VITALS (latest)")
                add("-".repeat(48))
                val bp = if (v.bpSystolic != null && v.bpDiastolic != null) {
                    "${v.bpSystolic}/${v.bpDiastolic}"
                } else null
                val parts = listOfNotNull(
                    v.tempC?.let { "Temp ${it}°C" },
                    bp?.let { "BP $it" },
                    v.pulseBpm?.let { "HR $it" },
                    v.respRate?.let { "RR $it" },
                    v.spo2Pct?.let { "SpO₂ $it%" },
                    v.weightKg?.let { "Weight ${it}kg" },
                )
                if (parts.isNotEmpty()) add(parts.joinToString(" · "))
                add("")
            }
            visit?.testsOrdered?.takeIf { it.isNotBlank() }?.let {
                add("Labs ordered: $it")
            }
            visit?.labResults?.takeIf { it.isNotBlank() }?.let {
                add("Lab results: $it")
            }
            visit?.diagnosis?.takeIf { it.isNotBlank() }?.let {
                add("Working diagnosis: $it")
            }
            visit?.medications?.takeIf { it.isNotBlank() }?.let {
                add("Medications given/ordered: $it")
            }
            referral.clinicalSummary?.takeIf { it.isNotBlank() }?.let {
                add("")
                add("CLINICAL SUMMARY")
                add("-".repeat(48))
                add(it)
            }
            add("")
            add("—")
            add("This summary accompanies the patient to the receiving facility.")
            add("Digital transfer may be available in future releases.")
        }
        return lines.joinToString("\n")
    }

    fun defaultClinicalSummary(
        visit: Visit?,
        providerTranscript: String?,
        vitals: PatientVitals?,
    ): String {
        val blocks = mutableListOf<String>()
        visit?.chiefComplaint?.takeIf { it.isNotBlank() }?.let {
            blocks += "Chief complaint: $it"
        }
        providerTranscript?.takeIf { it.isNotBlank() }?.let {
            blocks += it.take(1200)
        }
        visit?.diagnosis?.takeIf { it.isNotBlank() }?.let {
            blocks += "Diagnosis: $it"
        }
        visit?.testsOrdered?.takeIf { it.isNotBlank() }?.let {
            blocks += "Labs: $it"
        }
        visit?.labResults?.takeIf { it.isNotBlank() }?.let {
            blocks += "Results: $it"
        }
        visit?.medications?.takeIf { it.isNotBlank() }?.let {
            blocks += "Medications: $it"
        }
        vitals?.let { v ->
            val bp = if (v.bpSystolic != null && v.bpDiastolic != null) {
                "${v.bpSystolic}/${v.bpDiastolic}"
            } else null
            val vitalsLine = listOfNotNull(
                v.tempC?.let { "T $it°C" },
                bp?.let { "BP $it" },
                v.pulseBpm?.let { "HR $it" },
            ).joinToString(", ")
            if (vitalsLine.isNotBlank()) blocks += "Vitals: $vitalsLine"
        }
        return blocks.joinToString("\n\n").trim()
    }
}
