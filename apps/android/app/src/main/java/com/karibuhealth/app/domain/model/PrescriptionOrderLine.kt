package com.karibuhealth.app.domain.model

data class PrescriptionOrderLine(
    val id: String,
    val medicationCode: String? = null,
    val freeTextName: String? = null,
    val doseText: String? = null,
    val routeText: String? = null,
    val frequencyText: String? = null,
    val durationText: String? = null,
    val quantityPrescribed: Double? = null,
    val quantityUnit: String? = null,
    val status: String = "ordered",
    val notes: String? = null,
    val sortOrder: Int = 0,
) {
    fun displayName(): String =
        freeTextName?.takeIf { it.isNotBlank() }
            ?: medicationCode?.takeIf { it.isNotBlank() }
            ?: "Medication"

    fun sigSummary(): String = listOfNotNull(
        doseText?.takeIf { it.isNotBlank() },
        routeText?.takeIf { it.isNotBlank() },
        frequencyText?.takeIf { it.isNotBlank() },
        durationText?.takeIf { it.isNotBlank() },
    ).joinToString(" · ")
}

enum class PharmacyQueueTab {
    Waiting,
    InProgress,
    DoneToday,
}

fun pharmacyTabForVisit(dispensingStatus: String?, dispensedAt: String?): PharmacyQueueTab {
    return when {
        dispensingStatus in listOf("dispensed", "partial", "out_of_stock") &&
            !dispensedAt.isNullOrBlank() -> PharmacyQueueTab.DoneToday
        dispensingStatus == "not_started" || dispensingStatus.isNullOrBlank() -> PharmacyQueueTab.Waiting
        dispensingStatus == "in_progress" ||
            dispensingStatus in listOf("partial", "out_of_stock") -> PharmacyQueueTab.InProgress
        else -> PharmacyQueueTab.Waiting
    }
}

/** Mirrors server aggregate_visit_dispensing_status for offline preview. */
fun aggregateDispensingStatus(lineStatuses: List<String>): String {
    if (lineStatuses.isEmpty()) return "not_started"
    val normalized = lineStatuses.map { status ->
        when (status) {
            "partially_dispensed" -> "partial"
            else -> status
        }
    }
    if (normalized.all { it == "dispensed" }) return "dispensed"
    if (normalized.all { it == "out_of_stock" }) return "out_of_stock"
    if (normalized.any { it == "dispensed" || it == "partial" }) return "partial"
    return "in_progress"
}
