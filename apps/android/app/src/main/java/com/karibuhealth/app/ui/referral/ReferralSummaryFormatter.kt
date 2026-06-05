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

        val urgent = referral.urgency != ReferralUrgency.Routine
        val urgencyTag = referral.urgency.label.uppercase()
        val lines = buildList {
            // Urgent/emergency: on a thermal note that may tear, smear in the
            // heat, or get crumpled on an open-air truck, the reason is the one
            // thing that must survive — put it FIRST in caps, banner-framed, and
            // repeat it at the foot.
            if (urgent) {
                add("*".repeat(48))
                add("**  $urgencyTag REFERRAL — DO NOT DELAY  **")
                add("*".repeat(48))
                add("")
                add("REASON FOR REFERRAL:")
                add(referral.reason.uppercase())
                add("")
                add("*".repeat(48))
                add("")
            }
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
            if (urgent) {
                add("")
                add("*".repeat(48))
                add("**  $urgencyTag — REASON: ${referral.reason.uppercase()}")
                add("*".repeat(48))
            }
            add("—")
            add("This summary accompanies the patient to the receiving facility.")
            add("Digital transfer may be available in future releases.")
        }
        return lines.joinToString("\n")
    }

    /** Live preview while the referral form is being filled (tablet split view). */
    fun buildDraftPreview(
        clinicName: String?,
        patient: Patient,
        visit: Visit?,
        vitals: PatientVitals?,
        toFacility: String,
        urgency: ReferralUrgency,
        reason: String,
        clinicalSummary: String,
        transportMode: String,
        referringClinician: String?,
    ): String {
        val draft = Referral(
            id = "draft",
            clinicId = "",
            patientId = patient.id,
            visitId = visit?.id,
            patientName = formatPatientName(
                patient.firstName,
                patient.lastName,
                patient.displayName,
            ),
            fromDepartment = "opd",
            toFacility = toFacility.ifBlank { "—" },
            urgency = urgency,
            reason = reason.ifBlank { "—" },
            clinicalSummary = clinicalSummary.ifBlank { null },
            transportMode = transportMode.ifBlank { null },
            referredBy = null,
            status = "draft",
            createdAt = Instant.now().toString(),
            isSynced = false,
        )
        return buildPrintableSummary(
            clinicName = clinicName,
            patient = patient,
            visit = visit,
            vitals = vitals,
            referral = draft,
            referringClinician = referringClinician,
        )
    }

    fun defaultClinicalSummary(
        visit: Visit?,
        providerTranscript: String?,
        vitals: PatientVitals?,
    ): String {
        val blocks = mutableListOf<String>()
        val transcript = providerTranscript?.takeIf { it.isNotBlank() }
        if (transcript != null) {
            // The structured note already contains chief complaint, diagnosis and
            // assessment — use it as-is so those lines aren't printed twice.
            blocks += transcript.take(1200)
        } else {
            visit?.chiefComplaint?.takeIf { it.isNotBlank() }?.let {
                blocks += "Chief complaint: $it"
            }
            visit?.diagnosis?.takeIf { it.isNotBlank() }?.let {
                blocks += "Diagnosis: $it"
            }
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
