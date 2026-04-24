package com.karibuhealth.app.data.remote.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ClinicDto(
    val id: String,
    val name: String,
    val slug: String,
    @SerialName("clerk_organization_id") val clerkOrganizationId: String? = null,
    val timezone: String = "Africa/Kampala",
    @SerialName("is_active") val isActive: Boolean = true,
    @SerialName("created_at") val createdAt: String = "",
    @SerialName("updated_at") val updatedAt: String = "",
)

@Serializable
data class StaffDto(
    val id: String,
    @SerialName("clerk_user_id") val clerkUserId: String,
    @SerialName("clinic_id") val clinicId: String,
    val email: String,
    @SerialName("display_name") val displayName: String,
    val role: String,
    @SerialName("is_active") val isActive: Boolean = true,
    @SerialName("deactivated_at") val deactivatedAt: String? = null,
    @SerialName("created_at") val createdAt: String = "",
    @SerialName("updated_at") val updatedAt: String = "",
)

@Serializable
data class PatientDto(
    val id: String,
    @SerialName("clinic_id") val clinicId: String,
    @SerialName("patient_id") val patientId: Long? = null,
    @SerialName("patient_number") val patientNumber: String? = null,
    @SerialName("first_name") val firstName: String? = null,
    @SerialName("last_name") val lastName: String? = null,
    @SerialName("display_name") val displayName: String? = null,
    @SerialName("whatsapp_number") val whatsappNumber: String? = null,
    @SerialName("date_of_birth") val dateOfBirth: String? = null,
    val sex: String? = null,
    @SerialName("created_at") val createdAt: String = "",
    @SerialName("updated_at") val updatedAt: String = "",
)

@Serializable
data class PatientCreateDto(
    val id: String,
    @SerialName("clinic_id") val clinicId: String,
    @SerialName("first_name") val firstName: String? = null,
    @SerialName("last_name") val lastName: String? = null,
    @SerialName("whatsapp_number") val whatsappNumber: String? = null,
    @SerialName("date_of_birth") val dateOfBirth: String? = null,
    val sex: String? = null,
)

@Serializable
data class VisitDto(
    val id: String,
    @SerialName("clinic_id") val clinicId: String,
    @SerialName("patient_id") val patientId: String,
    @SerialName("doctor_id") val doctorId: String? = null,
    @SerialName("nurse_id") val nurseId: String? = null,
    val status: String = "pending",
    @SerialName("queue_status") val queueStatus: String = "waiting",
    @SerialName("queue_position") val queuePosition: Int? = null,
    val priority: String = "normal",
    @SerialName("chief_complaint") val chiefComplaint: String? = null,
    @SerialName("checked_in_at") val checkedInAt: String? = null,
    @SerialName("review_status") val reviewStatus: String = "pending",
    @SerialName("reviewed_by") val reviewedBy: String? = null,
    @SerialName("reviewed_at") val reviewedAt: String? = null,
    val diagnosis: String? = null,
    val medications: String? = null,
    @SerialName("follow_up_instructions") val followUpInstructions: String? = null,
    @SerialName("tests_ordered") val testsOrdered: String? = null,
    @SerialName("visit_date") val visitDate: String = "",
    @SerialName("created_at") val createdAt: String = "",
    @SerialName("updated_at") val updatedAt: String = "",
    @SerialName("finalized_at") val finalizedAt: String? = null,
    @SerialName("error_message") val errorMessage: String? = null,
    @SerialName("error_at") val errorAt: String? = null,
)

@Serializable
data class VisitCreateDto(
    val id: String,
    @SerialName("clinic_id") val clinicId: String,
    @SerialName("patient_id") val patientId: String,
    @SerialName("doctor_id") val doctorId: String? = null,
    @SerialName("chief_complaint") val chiefComplaint: String? = null,
    @SerialName("visit_date") val visitDate: String,
)

@Serializable
data class ProviderNoteDto(
    val id: String,
    @SerialName("visit_id") val visitId: String,
    val transcript: String? = null,
    @SerialName("note_content") val noteContent: String? = null,
    @SerialName("structured_data") val structuredData: String? = null,
    val status: String = "draft",
    @SerialName("created_at") val createdAt: String = "",
    @SerialName("updated_at") val updatedAt: String = "",
    @SerialName("finalized_at") val finalizedAt: String? = null,
    @SerialName("finalized_by") val finalizedBy: String? = null,
)

@Serializable
data class PatientNoteDto(
    val id: String,
    @SerialName("visit_id") val visitId: String,
    val content: String? = null,
    val language: String = "en",
    val status: String = "draft",
    @SerialName("created_at") val createdAt: String = "",
    @SerialName("updated_at") val updatedAt: String = "",
)

@Serializable
data class PaymentDto(
    val id: String,
    @SerialName("visit_id") val visitId: String,
    @SerialName("clinic_id") val clinicId: String,
    @SerialName("patient_id") val patientId: String,
    @SerialName("amount_ugx") val amountUgx: Int,
    @SerialName("payment_method") val paymentMethod: String,
    val status: String,
    @SerialName("receipt_number") val receiptNumber: String,
    @SerialName("service_type") val serviceType: String? = null,
    val notes: String? = null,
    @SerialName("collected_by") val collectedBy: String,
    @SerialName("created_at") val createdAt: String = "",
    @SerialName("updated_at") val updatedAt: String = "",
)

@Serializable
data class PaymentCreateDto(
    val id: String,
    @SerialName("visit_id") val visitId: String,
    @SerialName("clinic_id") val clinicId: String,
    @SerialName("patient_id") val patientId: String,
    @SerialName("amount_ugx") val amountUgx: Int,
    @SerialName("payment_method") val paymentMethod: String,
    val status: String = "paid",
    @SerialName("service_type") val serviceType: String? = null,
    val notes: String? = null,
    @SerialName("collected_by") val collectedBy: String,
)
