package com.karibuhealth.app.domain.model

import kotlinx.serialization.Serializable

// Enums matching TypeScript union types from packages/shared/src/types.ts

enum class StaffRole { admin, doctor, nurse }

enum class VisitStatus { recording, uploading, processing, review, sent, completed, error }

enum class QueueStatus { waiting, with_nurse, ready_for_doctor, with_doctor, completed, cancelled }

enum class VisitPriority { low, normal, high, urgent }

enum class SourceLanguage { eng, local }

enum class ReviewStatus { pending, pending_review, reviewed, rejected }

enum class AudioUploadStatus { pending, uploading, uploaded, transcribing, completed, failed }

enum class NoteStatus { draft, finalized }

enum class TranscriptionProvider { openai, sunbird }

enum class ConsentType { audio_recording, ai_processing, data_storage, cross_border_transfer, minor_guardian }

enum class ConsentMethod { verbal_recorded, written_paper, digital_whatsapp, digital_app }

enum class ConsentGrantedBy { patient, guardian, clinician_witnessed }

enum class PaymentMethod { cash, mtn_momo, airtel_money }

enum class PaymentStatus { paid, pending, failed, waived }

// Domain models

data class Clinic(
    val id: String,
    val name: String,
    val slug: String,
    val clerkOrganizationId: String?,
    val whatsappPhoneNumber: String?,
    val whatsappBusinessAccountId: String?,
    val timezone: String,
    val isActive: Boolean,
    val createdAt: String,
    val updatedAt: String,
)

data class Staff(
    val id: String,
    val clerkUserId: String,
    val clinicId: String,
    val email: String,
    val displayName: String,
    val role: StaffRole,
    val isActive: Boolean,
    val deactivatedAt: String?,
    val createdAt: String,
    val updatedAt: String,
)

data class Patient(
    val id: String,
    val clinicId: String,
    val patientId: Long?,
    val patientNumber: String?,
    val firstName: String?,
    val lastName: String?,
    val displayName: String?,
    val whatsappNumber: String?,
    val dateOfBirth: String?,
    val sex: String?,
    val createdAt: String,
    val updatedAt: String,
) {
    val fullName: String get() = listOfNotNull(firstName, lastName).joinToString(" ").ifBlank { displayName ?: "" }
}

data class Visit(
    val id: String,
    val clinicId: String,
    val patientId: String,
    val doctorId: String?,
    val nurseId: String?,
    val status: VisitStatus,
    val queueStatus: QueueStatus,
    val queuePosition: Int?,
    val priority: VisitPriority,
    val chiefComplaint: String?,
    val checkedInAt: String?,
    val consentRecording: Boolean,
    val consentTimestamp: String?,
    val sourceLanguage: SourceLanguage,
    val consentVerified: Boolean,
    val consentId: String?,
    val reviewStatus: ReviewStatus,
    val reviewedBy: String?,
    val reviewedAt: String?,
    val audioDeletedAt: String?,
    val retentionExpiresAt: String?,
    val diagnosis: String?,
    val medications: String?,
    val followUpInstructions: String?,
    val testsOrdered: String?,
    val visitDate: String,
    val createdAt: String,
    val updatedAt: String,
    val finalizedAt: String?,
    val errorMessage: String?,
    val errorAt: String?,
)

data class AudioUpload(
    val id: String,
    val visitId: String,
    val storagePath: String?,
    val fileSizeBytes: Long?,
    val durationSeconds: Int?,
    val mimeType: String,
    val uploadedAt: String?,
    val transcriptionStartedAt: String?,
    val transcriptionCompletedAt: String?,
    val status: AudioUploadStatus,
    val errorMessage: String?,
    val createdAt: String,
    val updatedAt: String,
)

data class ProviderNote(
    val id: String,
    val visitId: String,
    val transcript: String?,
    val transcriptOriginal: String?,
    val transcriptEnglish: String?,
    val transcriptionProvider: TranscriptionProvider?,
    val transcriptionConfidence: Double?,
    val diarizationOutput: String?,
    val audioTrimmed: Boolean,
    val noteContent: String?,
    val structuredData: String?,
    val status: NoteStatus,
    val createdAt: String,
    val updatedAt: String,
    val finalizedAt: String?,
    val finalizedBy: String?,
)

data class PatientNote(
    val id: String,
    val visitId: String,
    val content: String?,
    val language: String,
    val status: NoteStatus,
    val createdAt: String,
    val updatedAt: String,
)

data class PatientConsent(
    val id: String,
    val patientId: String,
    val visitId: String?,
    val consentType: ConsentType,
    val granted: Boolean,
    val grantedAt: String,
    val grantedBy: ConsentGrantedBy,
    val guardianName: String?,
    val guardianRelationship: String?,
    val withdrawalAt: String?,
    val consentMethod: ConsentMethod,
    val consentLanguage: String,
    val ipAddress: String?,
    val createdAt: String,
)

data class Payment(
    val id: String,
    val visitId: String,
    val clinicId: String,
    val patientId: String,
    val amountUgx: Int,
    val paymentMethod: PaymentMethod,
    val status: PaymentStatus,
    val receiptNumber: String,
    val serviceType: String?,
    val notes: String?,
    val collectedBy: String,
    val createdAt: String,
    val updatedAt: String,
)

data class QueueItem(
    val visitId: String,
    val patientId: String,
    val patientName: String?,
    val patientPhone: String,
    val queuePosition: Int,
    val queueStatus: QueueStatus,
    val priority: VisitPriority,
    val chiefComplaint: String?,
    val checkedInAt: String,
    val nurseId: String?,
    val nurseName: String?,
    val doctorId: String?,
    val doctorName: String?,
    val waitMinutes: Int,
)

// API request types

@Serializable
data class CreatePatientRequest(
    val first_name: String,
    val last_name: String,
    val whatsapp_number: String? = null,
    val date_of_birth: String? = null,
    val sex: String? = null,
)

@Serializable
data class CreateVisitRequest(
    val patient_id: String,
    val consent_recording: Boolean,
    val source_language: String? = null,
    val diagnosis: String? = null,
    val medications: String? = null,
    val follow_up_instructions: String? = null,
    val tests_ordered: String? = null,
)

@Serializable
data class CheckInRequest(
    val patient_id: String,
    val chief_complaint: String? = null,
    val priority: String? = null,
)

@Serializable
data class RecordPaymentRequest(
    val visit_id: String,
    val amount_ugx: Int,
    val payment_method: String,
    val service_type: String? = null,
    val notes: String? = null,
    val waived: Boolean? = null,
)
