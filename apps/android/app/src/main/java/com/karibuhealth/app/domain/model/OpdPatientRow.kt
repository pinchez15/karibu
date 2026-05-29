package com.karibuhealth.app.domain.model

import com.karibuhealth.app.data.local.db.entity.VisitWithPatient
import com.karibuhealth.app.data.remote.dto.OpdPatientTodayDto

/** OPD home filter chips — mirrors clinics.workflow_config default_opd_filters. */
enum class OpdPatientFilter(val label: String) {
    Waiting("Waiting"),
    NeedsVitals("Needs vitals"),
    WithClinician("With clinician"),
    AwaitingLabs("Awaiting labs"),
    AtPharmacy("At pharmacy"),
    DoneToday("Done today"),
    ;

    fun matches(row: OpdPatientRow): Boolean = row.bucket == this
}

/**
 * One row on the clinician OPD home — deduped by patient, carrying the
 * latest in-flight visit for today plus a derived workflow bucket.
 */
data class OpdPatientRow(
    val patientId: String,
    val visitId: String,
    val patientName: String,
    val sex: String?,
    val ageLabel: String?,
    val chiefComplaint: String?,
    val checkedInAt: String?,
    val priority: String,
    val queueStatus: String,
    val bucket: OpdPatientFilter,
) {
    companion object {
        fun from(dto: OpdPatientTodayDto): OpdPatientRow {
            val name = dto.patientName?.trim().orEmpty().ifBlank { "Unknown" }
            val ageLabel = dto.derivedAge?.let { "${it}y" }
            return OpdPatientRow(
                patientId = dto.patientId,
                visitId = dto.visitId,
                patientName = name,
                sex = dto.sex,
                ageLabel = ageLabel,
                chiefComplaint = dto.chiefComplaint,
                checkedInAt = null,
                priority = "normal",
                queueStatus = dto.queueStatus,
                bucket = deriveBucketFromRpc(dto),
            )
        }

        /** Mirrors server filters in rpc_get_opd_patients_today (migration 048). */
        private fun deriveBucketFromRpc(dto: OpdPatientTodayDto): OpdPatientFilter {
            val atPharmacy = dto.pharmacyOrderSubmittedAt != null &&
                dto.dispensingStatus !in listOf("dispensed", "partial", "complete")
            val labPending = dto.labStatus in listOf("pending", "running")
            return when {
                dto.documentationComplete -> OpdPatientFilter.DoneToday
                atPharmacy -> OpdPatientFilter.AtPharmacy
                labPending -> OpdPatientFilter.AwaitingLabs
                dto.queueStatus == "waiting" -> OpdPatientFilter.Waiting
                dto.queueStatus == "with_nurse" -> OpdPatientFilter.NeedsVitals
                dto.queueStatus in listOf("ready_for_doctor", "with_doctor") &&
                    !dto.documentationComplete -> OpdPatientFilter.WithClinician
                else -> OpdPatientFilter.Waiting
            }
        }

        fun from(vwp: VisitWithPatient): OpdPatientRow {
            val v = vwp.visit
            val p = vwp.patient
            val name = listOfNotNull(p.firstName, p.lastName)
                .joinToString(" ")
                .ifBlank { p.displayName ?: p.whatsappNumber ?: "Unknown" }
            return OpdPatientRow(
                patientId = p.id,
                visitId = v.id,
                patientName = name,
                sex = p.sex,
                ageLabel = p.dateOfBirth?.let { formatAgeFromDob(it) },
                chiefComplaint = v.chiefComplaint,
                checkedInAt = v.checkedInAt,
                priority = v.priority,
                queueStatus = v.queueStatus,
                bucket = deriveBucket(v),
            )
        }

        private fun deriveBucket(v: com.karibuhealth.app.data.local.db.entity.VisitEntity): OpdPatientFilter {
            val hasLabs = !v.testsOrdered.isNullOrBlank()
            val labPending = v.labStatus in listOf("pending", "running")
            val atPharmacy = v.pharmacyOrderSubmittedAt != null &&
                v.dispensingStatus !in listOf("dispensed")
            val done = v.documentationComplete &&
                (v.status in listOf("sent", "completed") || v.queueStatus == "completed")

            return when {
                done -> OpdPatientFilter.DoneToday
                atPharmacy -> OpdPatientFilter.AtPharmacy
                hasLabs && labPending -> OpdPatientFilter.AwaitingLabs
                v.queueStatus == "waiting" -> OpdPatientFilter.Waiting
                v.queueStatus == "with_nurse" -> OpdPatientFilter.NeedsVitals
                v.queueStatus in listOf("ready_for_doctor", "with_doctor") &&
                    !v.documentationComplete -> OpdPatientFilter.WithClinician
                v.documentationComplete -> OpdPatientFilter.DoneToday
                else -> OpdPatientFilter.Waiting
            }
        }

        private fun formatAgeFromDob(isoDate: String): String? {
            return try {
                val dob = java.time.LocalDate.parse(isoDate)
                val period = java.time.Period.between(dob, java.time.LocalDate.now())
                when {
                    period.years > 0 -> "${period.years}y"
                    period.months > 0 -> "${period.months}m"
                    else -> "${period.days}d"
                }
            } catch (_: Exception) {
                null
            }
        }
    }
}
