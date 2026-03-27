package com.karibuhealth.app.data.local.db.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(tableName = "clinics")
data class ClinicEntity(
    @PrimaryKey val id: String,
    val name: String,
    val slug: String,
    @ColumnInfo(name = "clerk_organization_id") val clerkOrganizationId: String?,
    @ColumnInfo(name = "whatsapp_phone_number") val whatsappPhoneNumber: String?,
    @ColumnInfo(name = "whatsapp_business_account_id") val whatsappBusinessAccountId: String?,
    val timezone: String,
    @ColumnInfo(name = "is_active") val isActive: Boolean,
    @ColumnInfo(name = "created_at") val createdAt: String,
    @ColumnInfo(name = "updated_at") val updatedAt: String,
)

@Entity(
    tableName = "staff",
    indices = [
        Index("clinic_id"),
        Index("clerk_user_id", unique = true),
    ],
)
data class StaffEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "clerk_user_id") val clerkUserId: String,
    @ColumnInfo(name = "clinic_id") val clinicId: String,
    val email: String,
    @ColumnInfo(name = "display_name") val displayName: String,
    val role: String, // admin, doctor, nurse
    @ColumnInfo(name = "is_active") val isActive: Boolean,
    @ColumnInfo(name = "deactivated_at") val deactivatedAt: String?,
    @ColumnInfo(name = "created_at") val createdAt: String,
    @ColumnInfo(name = "updated_at") val updatedAt: String,
)

@Entity(
    tableName = "patients",
    indices = [
        Index("clinic_id"),
        Index(value = ["clinic_id", "whatsapp_number"], unique = true),
    ],
)
data class PatientEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "clinic_id") val clinicId: String,
    @ColumnInfo(name = "patient_id") val patientId: Long? = null,
    @ColumnInfo(name = "patient_number") val patientNumber: String?,
    @ColumnInfo(name = "first_name") val firstName: String?,
    @ColumnInfo(name = "last_name") val lastName: String?,
    @ColumnInfo(name = "display_name") val displayName: String?,
    @ColumnInfo(name = "whatsapp_number") val whatsappNumber: String?,
    @ColumnInfo(name = "date_of_birth") val dateOfBirth: String?,
    val sex: String?, // M, F
    @ColumnInfo(name = "created_at") val createdAt: String,
    @ColumnInfo(name = "updated_at") val updatedAt: String,
    // Local-only fields
    @ColumnInfo(name = "is_synced") val isSynced: Boolean = true,
    @ColumnInfo(name = "local_created_at") val localCreatedAt: Long? = null,
)

@Entity(
    tableName = "visits",
    indices = [
        Index("clinic_id"),
        Index("patient_id"),
        Index("doctor_id"),
        Index("visit_date"),
        Index(value = ["clinic_id", "visit_date"]),
    ],
)
data class VisitEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "clinic_id") val clinicId: String,
    @ColumnInfo(name = "patient_id") val patientId: String,
    @ColumnInfo(name = "doctor_id") val doctorId: String?,
    @ColumnInfo(name = "nurse_id") val nurseId: String?,
    val status: String, // VisitStatus
    @ColumnInfo(name = "queue_status") val queueStatus: String, // QueueStatus
    @ColumnInfo(name = "queue_position") val queuePosition: Int?,
    val priority: String, // VisitPriority
    @ColumnInfo(name = "chief_complaint") val chiefComplaint: String?,
    @ColumnInfo(name = "checked_in_at") val checkedInAt: String?,
    @ColumnInfo(name = "consent_recording") val consentRecording: Boolean,
    @ColumnInfo(name = "consent_timestamp") val consentTimestamp: String?,
    @ColumnInfo(name = "source_language") val sourceLanguage: String,
    @ColumnInfo(name = "consent_verified") val consentVerified: Boolean,
    @ColumnInfo(name = "consent_id") val consentId: String?,
    @ColumnInfo(name = "review_status") val reviewStatus: String,
    @ColumnInfo(name = "reviewed_by") val reviewedBy: String?,
    @ColumnInfo(name = "reviewed_at") val reviewedAt: String?,
    @ColumnInfo(name = "audio_deleted_at") val audioDeletedAt: String?,
    @ColumnInfo(name = "retention_expires_at") val retentionExpiresAt: String?,
    val diagnosis: String?,
    val medications: String?,
    @ColumnInfo(name = "follow_up_instructions") val followUpInstructions: String?,
    @ColumnInfo(name = "tests_ordered") val testsOrdered: String?,
    @ColumnInfo(name = "visit_date") val visitDate: String,
    @ColumnInfo(name = "created_at") val createdAt: String,
    @ColumnInfo(name = "updated_at") val updatedAt: String,
    @ColumnInfo(name = "finalized_at") val finalizedAt: String?,
    @ColumnInfo(name = "error_message") val errorMessage: String?,
    @ColumnInfo(name = "error_at") val errorAt: String?,
    // Local-only fields
    @ColumnInfo(name = "is_synced") val isSynced: Boolean = true,
    @ColumnInfo(name = "audio_local_path") val audioLocalPath: String? = null,
    @ColumnInfo(name = "audio_uploaded") val audioUploaded: Boolean = false,
)

@Entity(
    tableName = "audio_uploads",
    indices = [Index("visit_id", unique = true)],
)
data class AudioUploadEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "visit_id") val visitId: String,
    @ColumnInfo(name = "storage_path") val storagePath: String?,
    @ColumnInfo(name = "file_size_bytes") val fileSizeBytes: Long?,
    @ColumnInfo(name = "duration_seconds") val durationSeconds: Int?,
    @ColumnInfo(name = "mime_type") val mimeType: String,
    @ColumnInfo(name = "uploaded_at") val uploadedAt: String?,
    @ColumnInfo(name = "transcription_started_at") val transcriptionStartedAt: String?,
    @ColumnInfo(name = "transcription_completed_at") val transcriptionCompletedAt: String?,
    val status: String, // AudioUploadStatus
    @ColumnInfo(name = "error_message") val errorMessage: String?,
    @ColumnInfo(name = "created_at") val createdAt: String,
    @ColumnInfo(name = "updated_at") val updatedAt: String,
    // Local-only
    @ColumnInfo(name = "local_file_path") val localFilePath: String? = null,
)

@Entity(
    tableName = "patient_consents",
    indices = [
        Index("patient_id"),
        Index("visit_id"),
    ],
)
data class PatientConsentEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "patient_id") val patientId: String,
    @ColumnInfo(name = "visit_id") val visitId: String?,
    @ColumnInfo(name = "consent_type") val consentType: String, // ConsentType
    val granted: Boolean,
    @ColumnInfo(name = "granted_at") val grantedAt: String,
    @ColumnInfo(name = "granted_by") val grantedBy: String, // ConsentGrantedBy
    @ColumnInfo(name = "guardian_name") val guardianName: String?,
    @ColumnInfo(name = "guardian_relationship") val guardianRelationship: String?,
    @ColumnInfo(name = "withdrawal_at") val withdrawalAt: String?,
    @ColumnInfo(name = "consent_method") val consentMethod: String, // ConsentMethod
    @ColumnInfo(name = "consent_language") val consentLanguage: String,
    @ColumnInfo(name = "ip_address") val ipAddress: String?,
    @ColumnInfo(name = "created_at") val createdAt: String,
    // Local-only
    @ColumnInfo(name = "is_synced") val isSynced: Boolean = true,
)

@Entity(
    tableName = "provider_notes",
    indices = [Index("visit_id", unique = true)],
)
data class ProviderNoteEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "visit_id") val visitId: String,
    val transcript: String?,
    @ColumnInfo(name = "transcript_original") val transcriptOriginal: String?,
    @ColumnInfo(name = "transcript_english") val transcriptEnglish: String?,
    @ColumnInfo(name = "transcription_provider") val transcriptionProvider: String?,
    @ColumnInfo(name = "transcription_confidence") val transcriptionConfidence: Double?,
    @ColumnInfo(name = "diarization_output") val diarizationOutput: String?,
    @ColumnInfo(name = "audio_trimmed") val audioTrimmed: Boolean,
    @ColumnInfo(name = "note_content") val noteContent: String?,
    @ColumnInfo(name = "structured_data") val structuredData: String?,
    val status: String, // NoteStatus
    @ColumnInfo(name = "created_at") val createdAt: String,
    @ColumnInfo(name = "updated_at") val updatedAt: String,
    @ColumnInfo(name = "finalized_at") val finalizedAt: String?,
    @ColumnInfo(name = "finalized_by") val finalizedBy: String?,
)

@Entity(
    tableName = "patient_notes",
    indices = [Index("visit_id", unique = true)],
)
data class PatientNoteEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "visit_id") val visitId: String,
    val content: String?,
    val language: String,
    val status: String, // NoteStatus
    @ColumnInfo(name = "created_at") val createdAt: String,
    @ColumnInfo(name = "updated_at") val updatedAt: String,
)

@Entity(
    tableName = "payments",
    indices = [
        Index("visit_id"),
        Index("clinic_id"),
    ],
)
data class PaymentEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "visit_id") val visitId: String,
    @ColumnInfo(name = "clinic_id") val clinicId: String,
    @ColumnInfo(name = "patient_id") val patientId: String,
    @ColumnInfo(name = "amount_ugx") val amountUgx: Int,
    @ColumnInfo(name = "payment_method") val paymentMethod: String, // PaymentMethod
    val status: String, // PaymentStatus
    @ColumnInfo(name = "receipt_number") val receiptNumber: String,
    @ColumnInfo(name = "service_type") val serviceType: String?,
    val notes: String?,
    @ColumnInfo(name = "collected_by") val collectedBy: String,
    @ColumnInfo(name = "created_at") val createdAt: String,
    @ColumnInfo(name = "updated_at") val updatedAt: String,
    // Local-only
    @ColumnInfo(name = "is_synced") val isSynced: Boolean = true,
)

@Entity(tableName = "sync_queue")
data class SyncQueueEntry(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "operation_type") val operationType: String,
    @ColumnInfo(name = "entity_type") val entityType: String,
    @ColumnInfo(name = "entity_id") val entityId: String,
    val payload: String, // JSON
    val status: String, // pending, in_progress, completed, failed
    val attempts: Int = 0,
    @ColumnInfo(name = "max_attempts") val maxAttempts: Int = 5,
    @ColumnInfo(name = "last_error") val lastError: String? = null,
    @ColumnInfo(name = "created_at") val createdAt: Long,
    @ColumnInfo(name = "next_retry_at") val nextRetryAt: Long? = null,
    @ColumnInfo(name = "depends_on") val dependsOn: String? = null,
    @ColumnInfo(name = "server_entity_id") val serverEntityId: String? = null,
)
