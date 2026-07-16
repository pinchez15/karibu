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
        // PHARM-5 (R2): a `partial` visit still owes a balance, so it must stay in the
        // working (InProgress) queue and NEVER route to DoneToday — even when a
        // `dispensedAt` timestamp is present from the first partial dispense. Only fully
        // `dispensed` and terminal `out_of_stock` move to DoneToday.
        // Mirrors validators/prescription.ts pharmacyTabForVisit (partial -> in_progress).
        // See docs/workplans/2026-07-16-pharmacy-rework/spec.md (Revisions v2, R2).
        dispensingStatus == "partial" -> PharmacyQueueTab.InProgress
        dispensingStatus in listOf("dispensed", "out_of_stock") &&
            !dispensedAt.isNullOrBlank() -> PharmacyQueueTab.DoneToday
        dispensingStatus == "not_started" || dispensingStatus.isNullOrBlank() -> PharmacyQueueTab.Waiting
        dispensingStatus == "in_progress" ||
            dispensingStatus == "out_of_stock" -> PharmacyQueueTab.InProgress
        else -> PharmacyQueueTab.Waiting
    }
}

/**
 * Mirrors the server function `aggregate_visit_dispensing_status`
 * (packages/supabase/migrations/094_wp1_close_the_loops.sql:16-65) for offline preview.
 *
 * PHARM-5: this mirror consumes per-line statuses. Under the PHARM-5 backend, the server
 * now DERIVES the per-line status from cumulative `prescribed_equivalent` vs
 * `quantity_prescribed` (migration 106): `SUM >= quantity_prescribed` -> `dispensed`,
 * `0 < SUM < prescribed` -> `partially_dispensed`. This mirror does not do that per-line
 * derivation itself — it only rolls line statuses up to a visit status — so it stays in
 * agreement as long as it treats a `partially_dispensed` line as a still-open "partial"
 * visit (not a terminal one), which it does. Verified line-for-line against migration 094;
 * do not let it drift (three mirrors already exist: SQL / validators/prescription.ts / here).
 */
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
