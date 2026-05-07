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
    val department: String = "opd",
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
    @SerialName("documentation_complete") val documentationComplete: Boolean = false,
    @SerialName("documentation_completed_at") val documentationCompletedAt: String? = null,
    @SerialName("ai_structure_status") val aiStructureStatus: String = "not_started",
    @SerialName("ai_structure_started_at") val aiStructureStartedAt: String? = null,
    @SerialName("ai_structure_completed_at") val aiStructureCompletedAt: String? = null,
    @SerialName("ai_structure_error") val aiStructureError: String? = null,
    @SerialName("ai_structure_attempts") val aiStructureAttempts: Int = 0,
    @SerialName("dispensing_status") val dispensingStatus: String = "not_started",
    @SerialName("dispense_notes") val dispenseNotes: String? = null,
    @SerialName("dispensed_at") val dispensedAt: String? = null,
    @SerialName("dispensed_by") val dispensedBy: String? = null,
    @SerialName("lab_status") val labStatus: String = "not_ordered",
    @SerialName("lab_results") val labResults: String? = null,
    @SerialName("lab_abnormal") val labAbnormal: Boolean = false,
    @SerialName("lab_completed_at") val labCompletedAt: String? = null,
    @SerialName("lab_completed_by") val labCompletedBy: String? = null,
)

// Used as the payload for sync queue entries of type "create_visit". The
// SECURITY DEFINER RPC `rpc_create_visit` accepts the same parameter shape;
// SyncEngine deserializes this and calls the RPC.
@Serializable
data class VisitCreateDto(
    val id: String,
    @SerialName("clinic_id") val clinicId: String,
    @SerialName("patient_id") val patientId: String,
    @SerialName("doctor_id") val doctorId: String? = null,
    @SerialName("chief_complaint") val chiefComplaint: String? = null,
    @SerialName("visit_date") val visitDate: String,
    val department: String = "opd",
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
    val source: String = "ai_generated",
    @SerialName("created_at") val createdAt: String = "",
    @SerialName("updated_at") val updatedAt: String = "",
)

@Serializable
data class PatientVitalsDto(
    val id: String,
    @SerialName("patient_id") val patientId: String,
    @SerialName("visit_id") val visitId: String? = null,
    @SerialName("recorded_at") val recordedAt: String,
    @SerialName("recorded_by") val recordedBy: String? = null,
    @SerialName("weight_kg") val weightKg: Double? = null,
    @SerialName("height_cm") val heightCm: Double? = null,
    @SerialName("temp_c") val tempC: Double? = null,
    @SerialName("bp_systolic") val bpSystolic: Int? = null,
    @SerialName("bp_diastolic") val bpDiastolic: Int? = null,
    @SerialName("pulse_bpm") val pulseBpm: Int? = null,
    @SerialName("resp_rate") val respRate: Int? = null,
    @SerialName("spo2_pct") val spo2Pct: Int? = null,
    @SerialName("muac_cm") val muacCm: Double? = null,
    val notes: String? = null,
)

// SyncQueue payload for "insert_patient_vitals" — matches rpc_insert_patient_vitals
// parameter shape (p_id, p_patient_id, etc.).
@Serializable
data class PatientVitalsCreateDto(
    @SerialName("p_id") val id: String,
    @SerialName("p_patient_id") val patientId: String,
    @SerialName("p_visit_id") val visitId: String? = null,
    @SerialName("p_weight_kg") val weightKg: Double? = null,
    @SerialName("p_height_cm") val heightCm: Double? = null,
    @SerialName("p_temp_c") val tempC: Double? = null,
    @SerialName("p_bp_systolic") val bpSystolic: Int? = null,
    @SerialName("p_bp_diastolic") val bpDiastolic: Int? = null,
    @SerialName("p_pulse_bpm") val pulseBpm: Int? = null,
    @SerialName("p_resp_rate") val respRate: Int? = null,
    @SerialName("p_spo2_pct") val spo2Pct: Int? = null,
    @SerialName("p_muac_cm") val muacCm: Double? = null,
    @SerialName("p_notes") val notes: String? = null,
    @SerialName("p_recorded_at") val recordedAt: String,
)

// SyncQueue payload for "create_visit" via rpc_create_visit. Mirrors the
// PostgREST RPC parameter naming convention (p_*).
@Serializable
data class VisitCreateRpcDto(
    @SerialName("p_id") val id: String,
    @SerialName("p_clinic_id") val clinicId: String,
    @SerialName("p_patient_id") val patientId: String,
    @SerialName("p_doctor_id") val doctorId: String? = null,
    @SerialName("p_chief_complaint") val chiefComplaint: String? = null,
    @SerialName("p_visit_date") val visitDate: String,
    @SerialName("p_department") val department: String = "opd",
)

// SyncQueue payload for "upsert_provider_note" via rpc_upsert_provider_note.
@Serializable
data class ProviderNoteUpsertDto(
    @SerialName("p_id") val id: String,
    @SerialName("p_visit_id") val visitId: String,
    @SerialName("p_transcript") val transcript: String,
    @SerialName("p_status") val status: String = "draft",
)

// SyncQueue payload for "upsert_patient_note_summary" via rpc_upsert_patient_note_summary.
@Serializable
data class PatientNoteSummaryUpsertDto(
    @SerialName("p_id") val id: String,
    @SerialName("p_visit_id") val visitId: String,
    @SerialName("p_content") val content: String,
)

// SyncQueue payload for "mark_documentation_complete" via rpc_mark_documentation_complete.
@Serializable
data class MarkDocumentationCompleteDto(
    @SerialName("p_visit_id") val visitId: String,
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
