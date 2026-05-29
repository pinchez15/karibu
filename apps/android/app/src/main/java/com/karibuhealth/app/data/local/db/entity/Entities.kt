package com.karibuhealth.app.data.local.db.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(tableName = "clinics")
data class ClinicEntity(
    @PrimaryKey val id: String,
    val name: String,
    val slug: String,
    @ColumnInfo(name = "clerk_organization_id") val clerkOrganizationId: String?,
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
    val role: String,
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
    // Column kept named whatsapp_number for backwards compat with the server
    // schema; semantically it is just the patient's phone number now.
    @ColumnInfo(name = "whatsapp_number") val whatsappNumber: String?,
    @ColumnInfo(name = "date_of_birth") val dateOfBirth: String?,
    val sex: String?,
    // Identity precision (migration 038). Year-only and approximate-age patients
    // are first-class — the clinician picks the precision in the new-visit form
    // and we record exactly what they know. Room doesn't enforce the
    // dob_precision consistency CHECK; the UI + server enforce it. SMALLINT on
    // the server maps to Int? here.
    @ColumnInfo(name = "birth_year") val birthYear: Int? = null,
    @ColumnInfo(name = "approximate_age") val approximateAge: Int? = null,
    @ColumnInfo(name = "age_recorded_at") val ageRecordedAt: String? = null,
    @ColumnInfo(name = "dob_precision") val dobPrecision: String = "unknown",
    // Location + secondary identifiers (migration 038). Ugandan administrative
    // hierarchy: village < parish < subcounty < district. Used as the primary
    // disambiguator when DOB and phone are unknown.
    val village: String? = null,
    val parish: String? = null,
    val subcounty: String? = null,
    val district: String? = null,
    @ColumnInfo(name = "guardian_name") val guardianName: String? = null,
    @ColumnInfo(name = "national_id") val nationalId: String? = null,
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
    val status: String,
    @ColumnInfo(name = "queue_status") val queueStatus: String,
    @ColumnInfo(name = "queue_position") val queuePosition: Int?,
    val priority: String,
    @ColumnInfo(name = "chief_complaint") val chiefComplaint: String?,
    @ColumnInfo(name = "checked_in_at") val checkedInAt: String?,
    // Department: opd | anc | maternity | family_planning | immunization.
    // Server-side since migration 024; mirrored locally in MIGRATION_3_4.
    val department: String = "opd",
    @ColumnInfo(name = "review_status") val reviewStatus: String,
    @ColumnInfo(name = "reviewed_by") val reviewedBy: String?,
    @ColumnInfo(name = "reviewed_at") val reviewedAt: String?,
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
    // Documentation completion (independent of AI/review state).
    // True once the clinician taps Save in the offline-first flow.
    @ColumnInfo(name = "documentation_complete") val documentationComplete: Boolean = false,
    @ColumnInfo(name = "documentation_completed_at") val documentationCompletedAt: String? = null,
    // AI structuring lifecycle — independent of `status`. Driven server-side by
    // the Inngest poll-ai-queue scheduler. Read-only on Android.
    @ColumnInfo(name = "ai_structure_status") val aiStructureStatus: String = "not_started",
    @ColumnInfo(name = "ai_structure_started_at") val aiStructureStartedAt: String? = null,
    @ColumnInfo(name = "ai_structure_completed_at") val aiStructureCompletedAt: String? = null,
    @ColumnInfo(name = "ai_structure_error") val aiStructureError: String? = null,
    @ColumnInfo(name = "ai_structure_attempts") val aiStructureAttempts: Int = 0,
    // Pharmacy MVP — workflow state for dispensing the clinician's `medications`
    // text. Set on the web by the dispenser; synced read-only to Android so
    // the clinician can see whether their orders were actually filled.
    @ColumnInfo(name = "dispensing_status") val dispensingStatus: String = "not_started",
    @ColumnInfo(name = "dispense_notes") val dispenseNotes: String? = null,
    @ColumnInfo(name = "dispensed_at") val dispensedAt: String? = null,
    @ColumnInfo(name = "dispensed_by") val dispensedBy: String? = null,
    @ColumnInfo(name = "pharmacy_order_submitted_at") val pharmacyOrderSubmittedAt: String? = null,
    @ColumnInfo(name = "pharmacy_order_submitted_by") val pharmacyOrderSubmittedBy: String? = null,
    // Lab MVP — workflow state for completing the clinician's `tests_ordered`
    // text. Set on the web by the lab tech; synced read-only to Android.
    @ColumnInfo(name = "lab_status") val labStatus: String = "not_ordered",
    @ColumnInfo(name = "lab_results") val labResults: String? = null,
    @ColumnInfo(name = "lab_abnormal") val labAbnormal: Boolean = false,
    @ColumnInfo(name = "lab_completed_at") val labCompletedAt: String? = null,
    @ColumnInfo(name = "lab_completed_by") val labCompletedBy: String? = null,
    // Local-only field
    @ColumnInfo(name = "is_synced") val isSynced: Boolean = true,
)

@Entity(
    tableName = "provider_notes",
    // Migration 7->8 (mirror of server migration 039): visit_id is optional;
    // unique-when-present is enforced via a partial unique index created
    // manually in MIGRATION_7_8 (Room can't express a partial unique index
    // via @Index, so the index_provider_notes_visit_id name has to match what
    // the migration creates so the schema verifier accepts it).
    indices = [
        Index(value = ["visit_id"], unique = true, name = "index_provider_notes_visit_id"),
        Index(value = ["patient_id", "updated_at"], name = "index_provider_notes_patient_id_updated_at"),
    ],
)
data class ProviderNoteEntity(
    @PrimaryKey val id: String,
    // Migration 039: provider_notes are patient-first. patient_id is the
    // durable record link; visit_id is optional (standalone notes for phone
    // calls, lab updates, follow-ups, etc.).
    @ColumnInfo(name = "patient_id") val patientId: String,
    @ColumnInfo(name = "visit_id") val visitId: String?,
    val transcript: String?,
    @ColumnInfo(name = "note_content") val noteContent: String?,
    @ColumnInfo(name = "structured_data") val structuredData: String?,
    val status: String,
    // 'visit' | 'phone_call' | 'follow_up' | 'lab_update' | 'pharmacy_update' | 'general'
    // Default 'visit' preserves the legacy visit-tied semantics. Room doesn't
    // enforce the CHECK constraint; the server is the source of truth.
    val source: String = "visit",
    @ColumnInfo(name = "created_at") val createdAt: String,
    @ColumnInfo(name = "updated_at") val updatedAt: String,
    // finalized_at / finalized_by stay as the canonical "signed" timestamps
    // (renaming would cascade across every Android + web caller). Lifecycle
    // is now draft -> signed -> amended | voided; amend/void columns below.
    @ColumnInfo(name = "finalized_at") val finalizedAt: String?,
    @ColumnInfo(name = "finalized_by") val finalizedBy: String?,
    @ColumnInfo(name = "amended_at") val amendedAt: String? = null,
    @ColumnInfo(name = "amended_by") val amendedBy: String? = null,
    @ColumnInfo(name = "voided_at") val voidedAt: String? = null,
    @ColumnInfo(name = "voided_by") val voidedBy: String? = null,
    @ColumnInfo(name = "void_reason") val voidReason: String? = null,
    // Migration 042: server-side rpc_upsert_provider_note now records the
    // authoring staff on first INSERT (preserved on subsequent UPDATEs).
    // Read-back only on Android — there's no client-side write path; the
    // mobile column exists so we can render "Authored by …" in future UI.
    @ColumnInfo(name = "created_by") val createdBy: String? = null,
    // Migration 044 — cosign lifecycle. Mid-level signers (nurse,
    // nursing_assistant) flip requires_cosign=true on sign; an attending then
    // calls rpc_cosign_provider_note to clear the flag and bump status to
    // 'cosigned'.
    @ColumnInfo(name = "requires_cosign", defaultValue = "0") val requiresCosign: Boolean = false,
    @ColumnInfo(name = "cosigned_at") val cosignedAt: String? = null,
    @ColumnInfo(name = "cosigned_by") val cosignedBy: String? = null,
)

@Entity(
    tableName = "patient_notes",
    // Two rows per visit allowed since migration 032: one
    // 'clinician_fallback' (the receipt-of-record) and one 'ai_generated'
    // (the AI plain-language summary). Composite unique enforces "at most
    // one row per (visit, source)".
    indices = [Index(value = ["visit_id", "source"], unique = true)],
)
data class PatientNoteEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "visit_id") val visitId: String,
    val content: String?,
    val language: String,
    val status: String,
    // 'ai_generated' | 'clinician_fallback'. Server default 'ai_generated' so
    // pre-029 rows on disk read as AI; new clinician fallback rows written
    // locally use 'clinician_fallback'.
    val source: String = "ai_generated",
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
    @ColumnInfo(name = "payment_method") val paymentMethod: String,
    val status: String,
    @ColumnInfo(name = "receipt_number") val receiptNumber: String,
    @ColumnInfo(name = "service_type") val serviceType: String?,
    val notes: String?,
    @ColumnInfo(name = "collected_by") val collectedBy: String,
    @ColumnInfo(name = "created_at") val createdAt: String,
    @ColumnInfo(name = "updated_at") val updatedAt: String,
    // Local-only
    @ColumnInfo(name = "is_synced") val isSynced: Boolean = true,
)

@Entity(
    tableName = "patient_vitals",
    indices = [
        Index(value = ["patient_id", "recorded_at"]),
        Index("visit_id"),
    ],
)
data class PatientVitalsEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "patient_id") val patientId: String,
    // Nullable: inpatient longitudinal readings can attach to a patient
    // without a single owning visit row.
    @ColumnInfo(name = "visit_id") val visitId: String?,
    @ColumnInfo(name = "recorded_at") val recordedAt: String,
    @ColumnInfo(name = "recorded_by") val recordedBy: String?,
    @ColumnInfo(name = "weight_kg") val weightKg: Double?,
    @ColumnInfo(name = "height_cm") val heightCm: Double?,
    @ColumnInfo(name = "temp_c") val tempC: Double?,
    @ColumnInfo(name = "bp_systolic") val bpSystolic: Int?,
    @ColumnInfo(name = "bp_diastolic") val bpDiastolic: Int?,
    @ColumnInfo(name = "pulse_bpm") val pulseBpm: Int?,
    @ColumnInfo(name = "resp_rate") val respRate: Int?,
    @ColumnInfo(name = "spo2_pct") val spo2Pct: Int?,
    @ColumnInfo(name = "muac_cm") val muacCm: Double?,
    val notes: String?,
    @ColumnInfo(name = "is_synced") val isSynced: Boolean = true,
)

@Entity(
    tableName = "pharmacy_stock_items",
    indices = [Index("clinic_id")],
)
data class PharmacyStockItemEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "clinic_id") val clinicId: String,
    @ColumnInfo(name = "drug_code") val drugCode: String,
    @ColumnInfo(name = "drug_name") val drugName: String,
    val formulation: String,
    val strength: String?,
    val unit: String,
    @ColumnInfo(name = "quantity_on_hand") val quantityOnHand: Double,
    @ColumnInfo(name = "low_stock_threshold") val lowStockThreshold: Double = 10.0,
    val active: Boolean = true,
    @ColumnInfo(name = "updated_at") val updatedAt: String = "",
)

@Entity(
    tableName = "clinic_lab_catalog",
    indices = [Index(value = ["clinic_id", "test_name"], unique = true)],
)
data class ClinicLabCatalogEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "clinic_id") val clinicId: String,
    @ColumnInfo(name = "test_name") val testName: String,
    val code: String? = null,
    val category: String? = null,
    @ColumnInfo(name = "display_order") val displayOrder: Int = 0,
    @ColumnInfo(name = "is_available") val isAvailable: Boolean = true,
    val notes: String? = null,
)

@Entity(
    tableName = "clinic_formulary_catalog",
    indices = [Index(value = ["clinic_id", "drug_name"], unique = true)],
)
data class ClinicFormularyCatalogEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "clinic_id") val clinicId: String,
    @ColumnInfo(name = "drug_name") val drugName: String,
    val code: String? = null,
    val category: String? = null,
    @ColumnInfo(name = "display_order") val displayOrder: Int = 0,
    @ColumnInfo(name = "is_available") val isAvailable: Boolean = true,
    val notes: String? = null,
)

@Entity(tableName = "sync_queue")
data class SyncQueueEntry(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "operation_type") val operationType: String,
    @ColumnInfo(name = "entity_type") val entityType: String,
    @ColumnInfo(name = "entity_id") val entityId: String,
    val payload: String,
    val status: String,
    val attempts: Int = 0,
    @ColumnInfo(name = "max_attempts") val maxAttempts: Int = 5,
    @ColumnInfo(name = "last_error") val lastError: String? = null,
    @ColumnInfo(name = "created_at") val createdAt: Long,
    @ColumnInfo(name = "next_retry_at") val nextRetryAt: Long? = null,
    @ColumnInfo(name = "depends_on") val dependsOn: String? = null,
    @ColumnInfo(name = "server_entity_id") val serverEntityId: String? = null,
)
