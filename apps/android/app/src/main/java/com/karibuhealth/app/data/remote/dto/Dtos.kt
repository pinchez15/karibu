package com.karibuhealth.app.data.remote.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
data class ClinicWorkflowConfigDto(
    @SerialName("default_opd_filters") val defaultOpdFilters: List<String> = emptyList(),
    @SerialName("show_physical_queue_filter") val showPhysicalQueueFilter: Boolean = true,
    @SerialName("enabled_protocol_slugs") val enabledProtocolSlugs: List<String> = emptyList(),
)

@Serializable
data class ClinicDto(
    val id: String,
    val name: String,
    val slug: String,
    @SerialName("clerk_organization_id") val clerkOrganizationId: String? = null,
    val timezone: String = "Africa/Kampala",
    @SerialName("is_active") val isActive: Boolean = true,
    @SerialName("workflow_config") val workflowConfig: ClinicWorkflowConfigDto? = null,
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
    // Migration 038 identity precision + location columns.
    @SerialName("birth_year") val birthYear: Int? = null,
    @SerialName("approximate_age") val approximateAge: Int? = null,
    @SerialName("age_recorded_at") val ageRecordedAt: String? = null,
    @SerialName("dob_precision") val dobPrecision: String = "unknown",
    val village: String? = null,
    val parish: String? = null,
    val subcounty: String? = null,
    val district: String? = null,
    @SerialName("guardian_name") val guardianName: String? = null,
    @SerialName("national_id") val nationalId: String? = null,
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
    // Migration 038 identity precision + location columns.
    @SerialName("birth_year") val birthYear: Int? = null,
    @SerialName("approximate_age") val approximateAge: Int? = null,
    @SerialName("age_recorded_at") val ageRecordedAt: String? = null,
    @SerialName("dob_precision") val dobPrecision: String = "unknown",
    val village: String? = null,
    val parish: String? = null,
    val subcounty: String? = null,
    val district: String? = null,
    @SerialName("guardian_name") val guardianName: String? = null,
    @SerialName("national_id") val nationalId: String? = null,
)

@Serializable
data class RpcCreatePatientRequest(
    @SerialName("p_id") val id: String,
    @SerialName("p_clinic_id") val clinicId: String,
    @SerialName("p_first_name") val firstName: String? = null,
    @SerialName("p_last_name") val lastName: String? = null,
    @SerialName("p_whatsapp_number") val whatsappNumber: String? = null,
    @SerialName("p_date_of_birth") val dateOfBirth: String? = null,
    @SerialName("p_sex") val sex: String? = null,
    @SerialName("p_birth_year") val birthYear: Int? = null,
    @SerialName("p_approximate_age") val approximateAge: Int? = null,
    @SerialName("p_age_recorded_at") val ageRecordedAt: String? = null,
    @SerialName("p_dob_precision") val dobPrecision: String = "unknown",
    @SerialName("p_village") val village: String? = null,
    @SerialName("p_parish") val parish: String? = null,
    @SerialName("p_subcounty") val subcounty: String? = null,
    @SerialName("p_district") val district: String? = null,
    @SerialName("p_guardian_name") val guardianName: String? = null,
    @SerialName("p_national_id") val nationalId: String? = null,
    @SerialName("p_client_op_id") val clientOpId: String? = null,
)

fun PatientCreateDto.toRpcRequest(clientOpId: String? = null) = RpcCreatePatientRequest(
    id = id,
    clinicId = clinicId,
    firstName = firstName,
    lastName = lastName,
    whatsappNumber = whatsappNumber,
    dateOfBirth = dateOfBirth,
    sex = sex,
    birthYear = birthYear,
    approximateAge = approximateAge,
    ageRecordedAt = ageRecordedAt,
    dobPrecision = dobPrecision,
    village = village,
    parish = parish,
    subcounty = subcounty,
    district = district,
    guardianName = guardianName,
    nationalId = nationalId,
    clientOpId = clientOpId,
)

@Serializable
data class PharmacyStockItemDto(
    val id: String,
    @SerialName("clinic_id") val clinicId: String,
    @SerialName("drug_code") val drugCode: String,
    @SerialName("drug_name") val drugName: String,
    val formulation: String,
    val strength: String? = null,
    val unit: String,
    @SerialName("quantity_on_hand") val quantityOnHand: Double,
    @SerialName("low_stock_threshold") val lowStockThreshold: Double? = null,
    val active: Boolean = true,
    @SerialName("updated_at") val updatedAt: String = "",
)

// Return shape of rpc_find_duplicate_candidates / rpc_search_patients (migration
// 038). match_reasons is an ARRAY_REMOVE(...) result so SQL guarantees no NULLs
// inside, but we model it as List<String?> defensively in case Postgres returns
// SQL NULL elements through PostgREST.
@Serializable
data class DuplicateCandidateDto(
    val id: String,
    @SerialName("patient_id") val patientId: Long? = null,
    @SerialName("first_name") val firstName: String? = null,
    @SerialName("last_name") val lastName: String? = null,
    val sex: String? = null,
    @SerialName("date_of_birth") val dateOfBirth: String? = null,
    @SerialName("birth_year") val birthYear: Int? = null,
    @SerialName("approximate_age") val approximateAge: Int? = null,
    @SerialName("dob_precision") val dobPrecision: String = "unknown",
    val village: String? = null,
    val parish: String? = null,
    @SerialName("guardian_name") val guardianName: String? = null,
    @SerialName("national_id") val nationalId: String? = null,
    @SerialName("whatsapp_number") val whatsappNumber: String? = null,
    @SerialName("derived_age") val derivedAge: Int? = null,
    @SerialName("match_score") val matchScore: Float = 0f,
    @SerialName("match_reasons") val matchReasons: List<String?> = emptyList(),
)

// RPC parameter payloads for the two migration 038 search functions. Built as
// dedicated DTOs (not Map<String, Any?>) so kotlinx-serialization can drop
// NULLs cleanly without the Retrofit/Moshi `@JvmSuppressWildcards` ceremony.
@Serializable
data class FindDuplicateCandidatesRequest(
    @SerialName("p_clinic_id") val clinicId: String,
    @SerialName("p_first_name") val firstName: String,
    @SerialName("p_last_name") val lastName: String,
    @SerialName("p_village") val village: String? = null,
    @SerialName("p_parish") val parish: String? = null,
    @SerialName("p_age") val age: Int? = null,
    @SerialName("p_sex") val sex: String? = null,
    @SerialName("p_limit") val limit: Int? = null,
)

@Serializable
data class SearchPatientsRequest(
    @SerialName("p_clinic_id") val clinicId: String,
    @SerialName("p_query") val query: String? = null,
    @SerialName("p_village") val village: String? = null,
    @SerialName("p_parish") val parish: String? = null,
    @SerialName("p_national_id") val nationalId: String? = null,
    @SerialName("p_age_min") val ageMin: Int? = null,
    @SerialName("p_age_max") val ageMax: Int? = null,
    @SerialName("p_sex") val sex: String? = null,
    @SerialName("p_limit") val limit: Int? = null,
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
    @SerialName("pharmacy_order_submitted_at") val pharmacyOrderSubmittedAt: String? = null,
    @SerialName("pharmacy_order_submitted_by") val pharmacyOrderSubmittedBy: String? = null,
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
    // Migration 039: visit_id is now nullable (standalone notes for phone
    // calls, lab updates, etc.). patient_id is the durable record link.
    @SerialName("patient_id") val patientId: String,
    @SerialName("visit_id") val visitId: String? = null,
    val transcript: String? = null,
    @SerialName("note_content") val noteContent: String? = null,
    @SerialName("structured_data") val structuredData: String? = null,
    // Lifecycle: draft | signed | amended | voided.
    val status: String = "draft",
    // 'visit' | 'phone_call' | 'follow_up' | 'lab_update' | 'pharmacy_update' | 'general'
    val source: String = "visit",
    @SerialName("created_at") val createdAt: String = "",
    @SerialName("updated_at") val updatedAt: String = "",
    @SerialName("finalized_at") val finalizedAt: String? = null,
    @SerialName("finalized_by") val finalizedBy: String? = null,
    @SerialName("amended_at") val amendedAt: String? = null,
    @SerialName("amended_by") val amendedBy: String? = null,
    @SerialName("voided_at") val voidedAt: String? = null,
    @SerialName("voided_by") val voidedBy: String? = null,
    @SerialName("void_reason") val voidReason: String? = null,
    // Migration 042: authoring staff recorded on first INSERT by the server.
    @SerialName("created_by") val createdBy: String? = null,
    // Migration 044: cosign lifecycle.
    @SerialName("requires_cosign") val requiresCosign: Boolean = false,
    @SerialName("cosigned_at") val cosignedAt: String? = null,
    @SerialName("cosigned_by") val cosignedBy: String? = null,
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
// Migration 039 extends the RPC signature with optional p_patient_id +
// p_source. Existing queued payloads (without those fields) still decode and
// round-trip cleanly because both have defaults. visit_id is nullable now
// (standalone notes for phone calls, lab updates, etc.). transcript is also
// nullable; the server preserves the existing transcript when sent NULL.
@Serializable
data class ProviderNoteUpsertDto(
    @SerialName("p_id") val id: String,
    @SerialName("p_visit_id") val visitId: String? = null,
    @SerialName("p_transcript") val transcript: String? = null,
    @SerialName("p_status") val status: String = "draft",
    @SerialName("p_patient_id") val patientId: String? = null,
    @SerialName("p_source") val source: String? = null,
)

// Migration 039 lifecycle RPC payloads.
@Serializable
data class SignProviderNoteRequest(
    @SerialName("p_id") val id: String,
)

// Migration 044 signature: reason is required, optional p_note_content.
@Serializable
data class AmendProviderNoteRequest(
    @SerialName("p_id") val id: String,
    @SerialName("p_transcript") val transcript: String,
    @SerialName("p_reason") val reason: String,
    @SerialName("p_note_content") val noteContent: String? = null,
)

@Serializable
data class VoidProviderNoteRequest(
    @SerialName("p_id") val id: String,
    @SerialName("p_reason") val reason: String,
)

// Migration 044 — append-only addendum.
@Serializable
data class AddendProviderNoteRequest(
    @SerialName("p_id") val id: String,
    @SerialName("p_addendum_text") val addendumText: String,
)

// Migration 044 — attending counter-signs a mid-level provider's note.
@Serializable
data class CosignProviderNoteRequest(
    @SerialName("p_id") val id: String,
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

// SyncQueue payload for "upsert_visit_clinical_summary" via
// rpc_upsert_visit_clinical_summary. `structuredData` is a JSON string; the
// SQL function validates/casts it to jsonb before storing it.
@Serializable
data class VisitClinicalSummaryUpsertDto(
    @SerialName("p_visit_id") val visitId: String,
    @SerialName("p_diagnosis") val diagnosis: String? = null,
    @SerialName("p_medications") val medications: String? = null,
    @SerialName("p_follow_up_instructions") val followUpInstructions: String? = null,
    @SerialName("p_tests_ordered") val testsOrdered: String? = null,
    @SerialName("p_structured_data") val structuredData: String? = null,
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

// =============================================================================
// Phase 3 — patient timeline + latest vitals (migration 040)
// =============================================================================

// Request payload for rpc_get_patient_timeline. Cursor is exclusive: pass the
// oldest event_at from the previous page as `p_cursor` to fetch the next page.
@Serializable
data class GetPatientTimelineRequest(
    @SerialName("p_patient_id") val patientId: String,
    @SerialName("p_cursor") val cursor: String? = null,
    @SerialName("p_limit") val limit: Int? = null,
)

// One row from rpc_get_patient_timeline. event_data is an opaque JSON payload
// shaped per event type (visit | note | vital | payment). We keep it as a raw
// JsonObject here and unpack into typed sealed-class variants in the domain
// layer so the DTO stays a faithful mirror of the RPC return shape.
@Serializable
data class PatientTimelineEventDto(
    @SerialName("event_type") val eventType: String,
    @SerialName("event_at") val eventAt: String,
    @SerialName("event_id") val eventId: String,
    @SerialName("event_data") val eventData: JsonObject,
)

// Request payload for rpc_get_patient_latest_vitals.
@Serializable
data class GetPatientLatestVitalsRequest(
    @SerialName("p_patient_id") val patientId: String,
)

// =============================================================================
// Phase 5 — worklist RPCs (migration 041)
// =============================================================================
// All seven worklist RPCs share a clinic-id parameter; some add a department
// or other filter. Each RPC has a distinct RETURNS TABLE shape that's modelled
// here as its own DTO so kotlinx-serialization can decode the rows without a
// lossy "any optional" union.

// Departmental worklist — needs-vitals / needs-clinician.
@Serializable
data class WorklistRequest(
    @SerialName("p_clinic_id") val clinicId: String,
    @SerialName("p_department") val department: String? = null,
)

// Clinic-wide worklist — needs-lab / needs-pharmacy / needs-payment.
@Serializable
data class WorklistClinicOnlyRequest(
    @SerialName("p_clinic_id") val clinicId: String,
)

// rpc_worklist_my_drafts — Clerk-authenticated callers pass clinic-only;
// service-role callers must supply p_staff_id (Android only ever calls with
// a Clerk JWT, but we keep the optional field for future server-side
// shims).
@Serializable
data class MyDraftsRequest(
    @SerialName("p_clinic_id") val clinicId: String,
    @SerialName("p_staff_id") val staffId: String? = null,
)

// rpc_worklist_care_tasks — supports filtering by role / assignee / type.
@Serializable
data class CareTasksWorklistRequest(
    @SerialName("p_clinic_id") val clinicId: String,
    @SerialName("p_assignee_role") val assigneeRole: String? = null,
    @SerialName("p_assignee_id") val assigneeId: String? = null,
    @SerialName("p_task_type") val taskType: String? = null,
)

@Serializable
data class NeedsVitalsRow(
    @SerialName("visit_id") val visitId: String,
    @SerialName("patient_id") val patientId: String,
    @SerialName("patient_name") val patientName: String? = null,
    val sex: String? = null,
    @SerialName("derived_age") val derivedAge: Int? = null,
    @SerialName("chief_complaint") val chiefComplaint: String? = null,
    @SerialName("queue_status") val queueStatus: String? = null,
    @SerialName("checked_in_at") val checkedInAt: String? = null,
)

@Serializable
data class NeedsClinicianRow(
    @SerialName("visit_id") val visitId: String,
    @SerialName("patient_id") val patientId: String,
    @SerialName("patient_name") val patientName: String? = null,
    val sex: String? = null,
    @SerialName("derived_age") val derivedAge: Int? = null,
    @SerialName("chief_complaint") val chiefComplaint: String? = null,
    @SerialName("queue_status") val queueStatus: String? = null,
    val priority: String? = null,
    @SerialName("doctor_id") val doctorId: String? = null,
    @SerialName("checked_in_at") val checkedInAt: String? = null,
    @SerialName("wait_minutes") val waitMinutes: Int? = null,
)

@Serializable
data class NeedsLabRow(
    @SerialName("visit_id") val visitId: String,
    @SerialName("patient_id") val patientId: String,
    @SerialName("patient_name") val patientName: String? = null,
    val sex: String? = null,
    @SerialName("derived_age") val derivedAge: Int? = null,
    @SerialName("chief_complaint") val chiefComplaint: String? = null,
    @SerialName("lab_status") val labStatus: String? = null,
    @SerialName("doctor_id") val doctorId: String? = null,
    @SerialName("visit_date") val visitDate: String? = null,
)

@Serializable
data class NeedsPharmacyRow(
    @SerialName("visit_id") val visitId: String,
    @SerialName("patient_id") val patientId: String,
    @SerialName("patient_name") val patientName: String? = null,
    val sex: String? = null,
    @SerialName("derived_age") val derivedAge: Int? = null,
    val medications: String? = null,
    @SerialName("dispensing_status") val dispensingStatus: String? = null,
    @SerialName("doctor_id") val doctorId: String? = null,
    @SerialName("visit_date") val visitDate: String? = null,
)

@Serializable
data class NeedsPaymentRow(
    @SerialName("visit_id") val visitId: String,
    @SerialName("patient_id") val patientId: String,
    @SerialName("patient_name") val patientName: String? = null,
    val sex: String? = null,
    @SerialName("derived_age") val derivedAge: Int? = null,
    val diagnosis: String? = null,
    @SerialName("visit_date") val visitDate: String? = null,
    @SerialName("documentation_completed_at") val documentationCompletedAt: String? = null,
)

@Serializable
data class MyDraftsRow(
    @SerialName("note_id") val noteId: String,
    @SerialName("patient_id") val patientId: String,
    @SerialName("patient_name") val patientName: String? = null,
    @SerialName("visit_id") val visitId: String? = null,
    val source: String? = null,
    @SerialName("transcript_preview") val transcriptPreview: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
)

@Serializable
data class CareTaskRow(
    @SerialName("task_id") val taskId: String,
    @SerialName("patient_id") val patientId: String,
    @SerialName("patient_name") val patientName: String? = null,
    @SerialName("visit_id") val visitId: String? = null,
    @SerialName("task_type") val taskType: String,
    val title: String? = null,
    val description: String? = null,
    @SerialName("assignee_role") val assigneeRole: String? = null,
    @SerialName("assignee_id") val assigneeId: String? = null,
    @SerialName("due_at") val dueAt: String? = null,
    val status: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
)

// Mirrors the rpc_get_patient_latest_vitals row exactly. Every field is
// nullable because each vital is resolved independently and may never have
// been measured. RPC functions that RETURN TABLE come back as a JSON array
// from PostgREST even when the function returns a single row.
@Serializable
data class PatientLatestVitalsDto(
    @SerialName("weight_kg") val weightKg: Double? = null,
    @SerialName("weight_kg_at") val weightKgAt: String? = null,
    @SerialName("height_cm") val heightCm: Double? = null,
    @SerialName("height_cm_at") val heightCmAt: String? = null,
    @SerialName("temp_c") val tempC: Double? = null,
    @SerialName("temp_c_at") val tempCAt: String? = null,
    @SerialName("bp_systolic") val bpSystolic: Int? = null,
    @SerialName("bp_diastolic") val bpDiastolic: Int? = null,
    @SerialName("bp_at") val bpAt: String? = null,
    @SerialName("pulse_bpm") val pulseBpm: Int? = null,
    @SerialName("pulse_bpm_at") val pulseBpmAt: String? = null,
    @SerialName("resp_rate") val respRate: Int? = null,
    @SerialName("resp_rate_at") val respRateAt: String? = null,
    @SerialName("spo2_pct") val spo2Pct: Int? = null,
    @SerialName("spo2_pct_at") val spo2PctAt: String? = null,
    @SerialName("muac_cm") val muacCm: Double? = null,
    @SerialName("muac_cm_at") val muacCmAt: String? = null,
)

// Mirrors ai_review_suggestions from migration 033.
@Serializable
data class AiReviewSuggestionDto(
    val id: String,
    @SerialName("visit_id") val visitId: String,
    @SerialName("suggestion_type") val suggestionType: String,
    val question: String,
    val reasoning: String,
    val confidence: String,
    val phase: String? = "draft",
    @SerialName("display_tier") val displayTier: String? = "timeline",
    @SerialName("citation_ids") val citationIds: List<Long>? = null,
    @SerialName("clinician_response") val clinicianResponse: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
)

@Serializable
data class VisitCriticalAlertDto(
    val id: String,
    @SerialName("visit_id") val visitId: String,
    @SerialName("rule_slug") val ruleSlug: String,
    @SerialName("confirm_question") val confirmQuestion: String,
    @SerialName("clinical_prompt") val clinicalPrompt: String,
    @SerialName("library_slug") val librarySlug: String? = null,
    @SerialName("clinician_response") val clinicianResponse: String? = null,
)

@Serializable
data class UpsertCriticalAlertRequest(
    @SerialName("p_visit_id") val visitId: String,
    @SerialName("p_rule_slug") val ruleSlug: String,
    @SerialName("p_confirm_question") val confirmQuestion: String,
    @SerialName("p_clinical_prompt") val clinicalPrompt: String,
    @SerialName("p_library_slug") val librarySlug: String? = null,
)

@Serializable
data class RecordCriticalAlertResponseRequest(
    @SerialName("p_alert_id") val alertId: String,
    @SerialName("p_response") val response: String,
)

@Serializable
data class CmeModuleDto(
    val id: String,
    val slug: String,
    val title: String,
    val description: String? = null,
    @SerialName("display_order") val displayOrder: Int = 0,
)

@Serializable
data class StartConsultRequest(
    @SerialName("p_visit_id") val visitId: String,
    @SerialName("p_redacted_snapshot") val redactedSnapshot: kotlinx.serialization.json.JsonObject,
)

@Serializable
data class ConsultThreadListItemDto(
    @SerialName("thread_id") val threadId: String,
    @SerialName("visit_id") val visitId: String,
    val status: String,
    @SerialName("updated_at") val updatedAt: String? = null,
    @SerialName("read_only") val readOnly: Boolean = false,
)

@Serializable
data class RecordReviewResponseRequest(
    @SerialName("p_suggestion_id") val suggestionId: String,
    @SerialName("p_response") val response: String,
)

// EHR pivot RPCs (migration 045)
@Serializable
data class SubmitPharmacyOrderRequest(
    @SerialName("p_visit_id") val visitId: String,
    @SerialName("p_medications") val medications: String,
    @SerialName("p_client_op_id") val clientOpId: String? = null,
)

@Serializable
data class RecordPaymentRpcRequest(
    @SerialName("p_id") val id: String,
    @SerialName("p_visit_id") val visitId: String,
    @SerialName("p_clinic_id") val clinicId: String,
    @SerialName("p_patient_id") val patientId: String,
    @SerialName("p_amount_ugx") val amountUgx: Int,
    @SerialName("p_payment_method") val paymentMethod: String,
    @SerialName("p_status") val status: String = "paid",
    @SerialName("p_service_type") val serviceType: String? = null,
    @SerialName("p_notes") val notes: String? = null,
    @SerialName("p_collected_by") val collectedBy: String,
    @SerialName("p_client_op_id") val clientOpId: String? = null,
)

@Serializable
data class RecordPaymentRpcResponse(
    val id: String? = null,
    @SerialName("receipt_number") val receiptNumber: String? = null,
)

@Serializable
data class StartLabRequest(
    @SerialName("p_visit_id") val visitId: String,
    @SerialName("p_client_op_id") val clientOpId: String? = null,
)

@Serializable
data class RecordLabResultRequest(
    @SerialName("p_visit_id") val visitId: String,
    @SerialName("p_result") val result: String,
    @SerialName("p_abnormal") val abnormal: Boolean = false,
    @SerialName("p_client_op_id") val clientOpId: String? = null,
)

@Serializable
data class SetDispensingStatusRequest(
    @SerialName("p_visit_id") val visitId: String,
    @SerialName("p_status") val status: String,
    @SerialName("p_notes") val notes: String? = null,
    @SerialName("p_client_op_id") val clientOpId: String? = null,
)

@Serializable
data class RecordDispenseRequest(
    @SerialName("p_visit_id") val visitId: String,
    @SerialName("p_status") val status: String,
    @SerialName("p_notes") val notes: String? = null,
    @SerialName("p_movements") val movements: String = "[]",
    @SerialName("p_client_op_id") val clientOpId: String? = null,
)

// Migration 048 — atomic sign + summary + documentation complete.
@Serializable
data class FinalizeClinicalEncounterRequest(
    @SerialName("p_note_id") val noteId: String,
    @SerialName("p_visit_id") val visitId: String,
    @SerialName("p_patient_id") val patientId: String,
    @SerialName("p_transcript") val transcript: String,
    @SerialName("p_patient_summary") val patientSummary: String,
    @SerialName("p_diagnosis") val diagnosis: String? = null,
    @SerialName("p_medications") val medications: String? = null,
    @SerialName("p_follow_up_instructions") val followUpInstructions: String? = null,
    @SerialName("p_tests_ordered") val testsOrdered: String? = null,
    @SerialName("p_structured_data") val structuredData: String? = null,
    @SerialName("p_client_op_id") val clientOpId: String? = null,
)

// Migration 048 — clinic-scoped lab + formulary catalog (rpc_get_clinic_catalog).
@Serializable
data class GetClinicCatalogRequest(
    @SerialName("p_clinic_id") val clinicId: String,
)

@Serializable
data class ClinicCatalogDto(
    val labs: List<ClinicLabCatalogItemDto> = emptyList(),
    val formulary: List<ClinicFormularyItemDto> = emptyList(),
)

@Serializable
data class ClinicLabCatalogItemDto(
    @SerialName("test_name") val testName: String,
    val code: String? = null,
    val category: String? = null,
    @SerialName("display_order") val displayOrder: Int = 0,
    @SerialName("is_available") val isAvailable: Boolean = true,
    val notes: String? = null,
)

@Serializable
data class ClinicFormularyItemDto(
    @SerialName("drug_name") val drugName: String,
    val code: String? = null,
    val category: String? = null,
    @SerialName("display_order") val displayOrder: Int = 0,
    @SerialName("is_available") val isAvailable: Boolean = true,
    val notes: String? = null,
)

@Serializable
data class GetOpdPatientsTodayRequest(
    @SerialName("p_clinic_id") val clinicId: String,
    @SerialName("p_filter") val filter: String? = null,
)

@Serializable
data class OpdPatientTodayDto(
    @SerialName("patient_id") val patientId: String,
    @SerialName("patient_name") val patientName: String? = null,
    val sex: String? = null,
    @SerialName("derived_age") val derivedAge: Int? = null,
    @SerialName("visit_id") val visitId: String,
    @SerialName("chief_complaint") val chiefComplaint: String? = null,
    @SerialName("queue_status") val queueStatus: String,
    @SerialName("lab_status") val labStatus: String,
    @SerialName("dispensing_status") val dispensingStatus: String,
    @SerialName("documentation_complete") val documentationComplete: Boolean = false,
    @SerialName("pharmacy_order_submitted_at") val pharmacyOrderSubmittedAt: String? = null,
    @SerialName("note_status") val noteStatus: String? = null,
    @SerialName("visit_date") val visitDate: String,
)

@Serializable
data class AdmitPatientRequest(
    @SerialName("p_patient_id") val patientId: String,
    @SerialName("p_ward_label") val wardLabel: String? = null,
    @SerialName("p_chief_complaint") val chiefComplaint: String? = null,
    @SerialName("p_client_op_id") val clientOpId: String? = null,
)

@Serializable
data class ActivateClinicalProtocolRequest(
    @SerialName("p_patient_id") val patientId: String,
    @SerialName("p_protocol_slug") val protocolSlug: String,
    @SerialName("p_visit_id") val visitId: String? = null,
    @SerialName("p_client_op_id") val clientOpId: String? = null,
)

@Serializable
data class RequestDraftAiAssistRequest(
    @SerialName("p_visit_id") val visitId: String,
    @SerialName("p_sections_snapshot") val sectionsSnapshot: String? = null,
)

@Serializable
data class CreateReferralRequest(
    @SerialName("p_id") val id: String,
    @SerialName("p_clinic_id") val clinicId: String,
    @SerialName("p_patient_id") val patientId: String,
    @SerialName("p_visit_id") val visitId: String? = null,
    @SerialName("p_from_department") val fromDepartment: String = "opd",
    @SerialName("p_to_facility") val toFacility: String,
    @SerialName("p_urgency") val urgency: String,
    @SerialName("p_reason") val reason: String,
    @SerialName("p_clinical_summary") val clinicalSummary: String? = null,
    @SerialName("p_transport_mode") val transportMode: String? = null,
    @SerialName("p_client_op_id") val clientOpId: String? = null,
)

@Serializable
data class ReferralTodayRowDto(
    val id: String,
    @SerialName("patient_id") val patientId: String,
    @SerialName("visit_id") val visitId: String? = null,
    @SerialName("patient_name") val patientName: String? = null,
    @SerialName("to_facility") val toFacility: String,
    val urgency: String,
    val reason: String,
    @SerialName("clinical_summary") val clinicalSummary: String? = null,
    @SerialName("transport_mode") val transportMode: String? = null,
    val status: String,
    @SerialName("created_at") val createdAt: String,
)

@Serializable
data class ListReferralsTodayRequest(
    @SerialName("p_clinic_id") val clinicId: String,
)

// ── Region outbreak protocols (migration 052) ──────────────────────────────
// The clinic reads its active region-scoped protocols (e.g. ebola) on refresh
// and gates outbreak clinical-decision-support on them.

@Serializable
data class ActiveProtocolsRequest(
    @SerialName("p_clinic_id") val clinicId: String,
)

@Serializable
data class ActiveProtocolDto(
    @SerialName("protocol") val protocol: String,
    @SerialName("scope_type") val scopeType: String,
    @SerialName("scope_value") val scopeValue: String,
    @SerialName("note") val note: String? = null,
    @SerialName("activated_at") val activatedAt: String? = null,
)
