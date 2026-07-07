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

fun pharmacyTabForVisit(dispensingStatus: String?, dispensedAt: String?): PharmacyQueueTab? {
    if (dispensingStatus == "returned") return null
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
    val active = lineStatuses.filter { it != "cancelled" }
    if (active.isEmpty()) return "not_started"
    val dispensed = active.count { it == "dispensed" }
    val oos = active.count { it == "out_of_stock" }
    val needsClar = active.count { it == "needs_clarification" }
    val open = active.count { it in listOf("ordered", "dispensing") }
    val partial = active.count { it == "partially_dispensed" }
    if (dispensed == active.size) return "dispensed"
    if (oos == active.size) return "out_of_stock"
    if (needsClar > 0 && open == 0) return "returned"
    if (dispensed > 0 || partial > 0 || oos > 0) return "partial"
    if (open > 0 || needsClar > 0) return "in_progress"
    return "in_progress"
}
