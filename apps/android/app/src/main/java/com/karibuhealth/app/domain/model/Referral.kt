package com.karibuhealth.app.domain.model

enum class ReferralUrgency(val label: String, val apiValue: String) {
    Routine("Routine", "routine"),
    Urgent("Urgent", "urgent"),
    Emergency("Emergency", "emergency"),
}

data class Referral(
    val id: String,
    val clinicId: String,
    val patientId: String,
    val visitId: String?,
    val patientName: String?,
    val fromDepartment: String,
    val toFacility: String,
    val urgency: ReferralUrgency,
    val reason: String,
    val clinicalSummary: String?,
    val transportMode: String?,
    val referredBy: String?,
    val status: String,
    val createdAt: String,
    val isSynced: Boolean,
)
