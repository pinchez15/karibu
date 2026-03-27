package com.karibuhealth.app.data.remote.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ClinicDto(
    val id: String,
    val name: String,
    val slug: String,
    @SerialName("clerk_organization_id") val clerkOrganizationId: String? = null,
    @SerialName("whatsapp_phone_number") val whatsappPhoneNumber: String? = null,
    @SerialName("whatsapp_business_account_id") val whatsappBusinessAccountId: String? = null,
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
    @SerialName("patient_number") val patientNumber: String? = null,
    @SerialName("whatsapp_number") val whatsappNumber: String? = null,
    @SerialName("display_name") val displayName: String? = null,
    @SerialName("date_of_birth") val dateOfBirth: String? = null,
    val sex: String? = null,
    @SerialName("created_at") val createdAt: String = "",
    @SerialName("updated_at") val updatedAt: String = "",
)

@Serializable
data class PatientCreateDto(
    val id: String,
    @SerialName("clinic_id") val clinicId: String,
    @SerialName("whatsapp_number") val whatsappNumber: String? = null,
    @SerialName("display_name") val displayName: String? = null,
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
    val status: String = "recording",
    @SerialName("queue_status") val queueStatus: String = "waiting",
    @SerialName("queue_position") val queuePosition: Int? = null,
    val priority: String = "normal",
    @SerialName("chief_complaint") val chiefComplaint: String? = null,
    @SerialName("checked_in_at") val checkedInAt: String? = null,
    @SerialName("consent_recording") val consentRecording: Boolean = false,
    @SerialName("consent_timestamp") val consentTimestamp: String? = null,
    @SerialName("source_language") val sourceLanguage: String = "eng",
    @SerialName("consent_verified") val consentVerified: Boolean = false,
    @SerialName("consent_id") val consentId: String? = null,
    @SerialName("review_status") val reviewStatus: String = "pending",
    @SerialName("reviewed_by") val reviewedBy: String? = null,
    @SerialName("reviewed_at") val reviewedAt: String? = null,
    @SerialName("audio_deleted_at") val audioDeletedAt: String? = null,
    @SerialName("retention_expires_at") val retentionExpiresAt: String? = null,
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
    @SerialName("consent_recording") val consentRecording: Boolean = false,
    @SerialName("source_language") val sourceLanguage: String = "eng",
    @SerialName("chief_complaint") val chiefComplaint: String? = null,
    @SerialName("visit_date") val visitDate: String,
)

@Serializable
data class AudioUploadDto(
    val id: String,
    @SerialName("visit_id") val visitId: String,
    @SerialName("storage_path") val storagePath: String? = null,
    @SerialName("file_size_bytes") val fileSizeBytes: Long? = null,
    @SerialName("duration_seconds") val durationSeconds: Int? = null,
    @SerialName("mime_type") val mimeType: String = "audio/m4a",
    @SerialName("uploaded_at") val uploadedAt: String? = null,
    @SerialName("transcription_started_at") val transcriptionStartedAt: String? = null,
    @SerialName("transcription_completed_at") val transcriptionCompletedAt: String? = null,
    val status: String = "pending",
    @SerialName("error_message") val errorMessage: String? = null,
    @SerialName("created_at") val createdAt: String = "",
    @SerialName("updated_at") val updatedAt: String = "",
)

@Serializable
data class AudioUploadCreateDto(
    val id: String,
    @SerialName("visit_id") val visitId: String,
    @SerialName("mime_type") val mimeType: String = "audio/m4a",
    val status: String = "pending",
)

@Serializable
data class ConsentDto(
    val id: String,
    @SerialName("patient_id") val patientId: String,
    @SerialName("visit_id") val visitId: String? = null,
    @SerialName("consent_type") val consentType: String,
    val granted: Boolean,
    @SerialName("granted_at") val grantedAt: String,
    @SerialName("granted_by") val grantedBy: String,
    @SerialName("guardian_name") val guardianName: String? = null,
    @SerialName("guardian_relationship") val guardianRelationship: String? = null,
    @SerialName("withdrawal_at") val withdrawalAt: String? = null,
    @SerialName("consent_method") val consentMethod: String,
    @SerialName("consent_language") val consentLanguage: String,
    @SerialName("ip_address") val ipAddress: String? = null,
    @SerialName("created_at") val createdAt: String = "",
)

@Serializable
data class ConsentCreateDto(
    val id: String,
    @SerialName("patient_id") val patientId: String,
    @SerialName("visit_id") val visitId: String? = null,
    @SerialName("consent_type") val consentType: String,
    val granted: Boolean,
    @SerialName("granted_at") val grantedAt: String,
    @SerialName("granted_by") val grantedBy: String,
    @SerialName("guardian_name") val guardianName: String? = null,
    @SerialName("guardian_relationship") val guardianRelationship: String? = null,
    @SerialName("consent_method") val consentMethod: String,
    @SerialName("consent_language") val consentLanguage: String,
)

@Serializable
data class ProviderNoteDto(
    val id: String,
    @SerialName("visit_id") val visitId: String,
    val transcript: String? = null,
    @SerialName("transcript_original") val transcriptOriginal: String? = null,
    @SerialName("transcript_english") val transcriptEnglish: String? = null,
    @SerialName("transcription_provider") val transcriptionProvider: String? = null,
    @SerialName("transcription_confidence") val transcriptionConfidence: Double? = null,
    @SerialName("diarization_output") val diarizationOutput: String? = null,
    @SerialName("audio_trimmed") val audioTrimmed: Boolean = false,
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
