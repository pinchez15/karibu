package com.karibuhealth.app.ui.orders

import com.karibuhealth.app.ui.components.KhStatusKind

internal fun labStatusLabel(status: String): String = when (status) {
    "pending" -> "Pending"
    "running" -> "Running"
    "done", "complete" -> "Complete"
    "not_ordered" -> "Not ordered"
    else -> status.replace('_', ' ').replaceFirstChar { it.uppercase() }
}

internal fun labStatusKind(status: String): KhStatusKind = when (status) {
    "done", "complete" -> KhStatusKind.Sent
    "running", "pending" -> KhStatusKind.Lab
    else -> KhStatusKind.Waiting
}

internal fun dispensingStatusLabel(status: String, hasOrder: Boolean): String = when {
    !hasOrder -> ""
    status == "not_started" -> "Awaiting dispense"
    status == "in_progress" -> "Dispensing"
    status == "partial" -> "Partial dispense"
    status == "dispensed" || status == "complete" -> "Dispensed"
    status == "out_of_stock" -> "Out of stock"
    else -> status.replace('_', ' ').replaceFirstChar { it.uppercase() }
}

internal fun dispensingStatusKind(status: String): KhStatusKind = when (status) {
    "dispensed", "complete" -> KhStatusKind.Signed
    "in_progress", "partial" -> KhStatusKind.PendingReview
    "out_of_stock" -> KhStatusKind.Errored
    else -> KhStatusKind.Waiting
}
