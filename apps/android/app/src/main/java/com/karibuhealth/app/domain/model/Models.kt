package com.karibuhealth.app.domain.model

import kotlinx.serialization.Serializable

// Enums matching TypeScript union types from packages/shared/src/types.ts.
//
// Visit lifecycle is dictation-first: clinician records the visit on paper /
// from memory, then dictates a summary into the phone after the patient leaves.
// Audio is short-form (<3 min) sent directly to OpenAI Whisper via the dictate
// edge function — never stored, never gated by patient consent. Status flow:
//   pending  -> visit created, no dictation yet
//   review   -> dictation done, AI structured note ready for clinician review
//   sent     -> clinician approved + printed
//   completed-> payment recorded, visit closed
//   error    -> something failed in the AI structuring step

// Legacy roles ('admin', 'doctor', 'nurse') stay valid for back-compat with the
// web app + Clerk webhook. HC III rollout adds clinical_officer/midwife/etc.
// alongside them. A future cleanup migration can rename 'doctor' once web
// catches up.
enum class StaffRole {
    admin,
    doctor,
    nurse,
    clinical_officer,
    midwife,
    nursing_assistant,
    records_officer,
    lab_tech,
    dispenser;

    val isLeadClinician: Boolean
        get() = this == doctor || this == clinical_officer || this == midwife || this == nurse || this == admin
}

enum class VisitStatus { pending, review, sent, completed, error }

enum class QueueStatus { waiting, with_nurse, ready_for_doctor, with_doctor, completed, cancelled }

enum class VisitPriority { low, normal, high, urgent }

enum class ReviewStatus { pending, pending_review, reviewed, rejected }

// Provider-note lifecycle (migration 039):
//   draft   -> editable autosave row, pre-Sign
//   signed  -> clinician tapped Sign; AI workflow can structure
//   amended -> post-sign edit (audit-preserved via finalized + amended cols)
//   voided  -> withdrawn (senior clinicians only); kept for audit
// `finalized` is no longer a valid value, but we keep `signed` aliasable via
// the runCatching path in the mappers so legacy rows downgrade gracefully.
// Migration 044 expanded the lifecycle to include cosigned + addended.
enum class NoteStatus { draft, signed, cosigned, addended, amended, voided }

enum class PaymentMethod { cash, mtn_momo, airtel_money }

enum class PaymentStatus { paid, pending, failed, waived }

// Domain models

data class ClinicWorkflowConfig(
    val defaultOpdFilters: List<String> = emptyList(),
    val showPhysicalQueueFilter: Boolean = true,
    val enabledProtocolSlugs: List<String> = emptyList(),
)

data class Clinic(
    val id: String,
    val name: String,
    val slug: String,
    val clerkOrganizationId: String?,
    val timezone: String,
    val isActive: Boolean,
    val district: String? = null,
    val workflowConfig: ClinicWorkflowConfig = ClinicWorkflowConfig(),
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
    val onboardingCompletedAt: String? = null,
    val createdAt: String,
    val updatedAt: String,
) {
    val needsOnboarding: Boolean get() = onboardingCompletedAt.isNullOrBlank()
}

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
    // Migration 038 identity precision + location columns.
    val birthYear: Int? = null,
    val approximateAge: Int? = null,
    val ageRecordedAt: String? = null,
    val dobPrecision: String = "unknown",
    val village: String? = null,
    val parish: String? = null,
    val subcounty: String? = null,
    val district: String? = null,
    val guardianName: String? = null,
    val guardianRelationship: String? = null,
    val nationalId: String? = null,
    val createdAt: String,
    val updatedAt: String,
    val isSynced: Boolean = true,
) {
    val fullName: String get() = listOfNotNull(firstName, lastName).joinToString(" ").ifBlank { displayName ?: "" }
}

// Lightweight projection of rpc_find_duplicate_candidates / rpc_search_patients
// for the new-visit duplicate-check UI. Only the fields the candidate card
// needs to render — the full Patient row is fetched from local cache (or
// future per-id endpoint) when the clinician picks one.
data class DuplicateCandidate(
    val id: String,
    val patientId: Long?,
    val firstName: String?,
    val lastName: String?,
    val sex: String?,
    val village: String?,
    val parish: String?,
    val nationalId: String?,
    val whatsappNumber: String?,
    val derivedAge: Int?,
    val matchScore: Float,
    val matchReasons: List<String>,
) {
    val fullName: String
        get() = listOfNotNull(firstName, lastName)
            .joinToString(" ")
            .trim()
            .ifBlank { "Unknown" }
}

enum class Department { opd, anc, maternity, family_planning, immunization }

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
    val department: Department = Department.opd,
    val reviewStatus: ReviewStatus,
    val reviewedBy: String?,
    val reviewedAt: String?,
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
    val documentationComplete: Boolean = false,
    val documentationCompletedAt: String? = null,
    val aiStructureStatus: String = "not_started",
    val aiStructureStartedAt: String? = null,
    val aiStructureCompletedAt: String? = null,
    val aiStructureError: String? = null,
    val aiStructureAttempts: Int = 0,
    val dispensingStatus: String = "not_started",
    val dispenseNotes: String? = null,
    val dispensedAt: String? = null,
    val dispensedBy: String? = null,
    val pharmacyOrderSubmittedAt: String? = null,
    val pharmacyOrderSubmittedBy: String? = null,
    val labStatus: String = "not_ordered",
    val labResults: String? = null,
    val labAbnormal: Boolean = false,
    val labCompletedAt: String? = null,
    val labCompletedBy: String? = null,
    val isSynced: Boolean = true,
)

data class ProviderNote(
    val id: String,
    // Migration 039: patient-first. patient_id is the durable record link;
    // visit_id is optional (standalone notes for phone calls, lab updates,
    // follow-ups, etc.).
    val patientId: String,
    val visitId: String?,
    // Raw dictation transcript from Whisper. Short-form (typically <3 min of
    // audio). The audio itself is never persisted — only this text.
    val transcript: String?,
    // SOAP-formatted note structured by the AI assistant from the transcript.
    val noteContent: String?,
    val structuredData: String?,
    val status: NoteStatus,
    // 'visit' | 'phone_call' | 'follow_up' | 'lab_update' | 'pharmacy_update' | 'general'
    val source: String = "visit",
    val createdAt: String,
    val updatedAt: String,
    // finalized_* columns are the canonical "signed" timestamps; renaming
    // would cascade everywhere. amended_*/voided_*/voidReason cover the
    // post-sign lifecycle transitions.
    val finalizedAt: String?,
    val finalizedBy: String?,
    val amendedAt: String? = null,
    val amendedBy: String? = null,
    val voidedAt: String? = null,
    val voidedBy: String? = null,
    val voidReason: String? = null,
    // Migration 042: staff_id of the clinician who first dictated/started the
    // note. Set by rpc_upsert_provider_note on INSERT; preserved on UPDATE.
    val createdBy: String? = null,
    // Migration 044: cosign lifecycle.
    val requiresCosign: Boolean = false,
    val cosignedAt: String? = null,
    val cosignedBy: String? = null,
)

enum class PatientNoteSource { ai_generated, clinician_fallback }

data class PatientNote(
    val id: String,
    val visitId: String,
    val content: String?,
    val language: String,
    val status: NoteStatus,
    val source: PatientNoteSource = PatientNoteSource.ai_generated,
    val createdAt: String,
    val updatedAt: String,
)

data class PatientVitals(
    val id: String,
    val patientId: String,
    val visitId: String?,
    val recordedAt: String,
    val recordedBy: String?,
    val weightKg: Double?,
    val heightCm: Double?,
    val tempC: Double?,
    val bpSystolic: Int?,
    val bpDiastolic: Int?,
    val pulseBpm: Int?,
    val respRate: Int?,
    val spo2Pct: Int?,
    val muacCm: Double?,
    val notes: String?,
    val isSynced: Boolean = true,
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

// =============================================================================
// Phase 3 — patient timeline + latest known vitals
// =============================================================================

/**
 * One event on the patient timeline. The RPC returns a chronological union of
 * visits / notes / vitals / payments; we parse the JSON event_data into a
 * typed sealed-class subtype so the UI can render each card type without
 * walking JsonObjects by hand.
 *
 * `eventAt` is the ISO-8601 timestamp the UI orders by and uses as the
 * pagination cursor for the next page.
 */
sealed class PatientTimelineEvent {
    abstract val eventId: String
    abstract val eventAt: String

    data class VisitEvent(
        override val eventId: String,
        override val eventAt: String,
        val visitId: String,
        val status: String,
        val queueStatus: String,
        val department: String,
        val chiefComplaint: String?,
        val diagnosis: String?,
        val medications: String?,
        val followUpInstructions: String?,
        val testsOrdered: String?,
        val dispensingStatus: String,
        val labStatus: String,
        val labAbnormal: Boolean,
        val documentationComplete: Boolean,
        val visitDate: String?,
        val doctorId: String?,
    ) : PatientTimelineEvent()

    data class NoteEvent(
        override val eventId: String,
        override val eventAt: String,
        val noteId: String,
        val visitId: String?,
        val status: String,
        // 'visit' | 'phone_call' | 'follow_up' | 'lab_update' | 'pharmacy_update' | 'general'
        val source: String,
        val transcriptPreview: String,
        val hasTranscript: Boolean,
        val signedAt: String?,
        val signedBy: String?,
        val amendedAt: String?,
        val updatedAt: String?,
    ) : PatientTimelineEvent()

    data class VitalEvent(
        override val eventId: String,
        override val eventAt: String,
        val vitalId: String,
        val visitId: String?,
        val recordedBy: String?,
        val weightKg: Double?,
        val heightCm: Double?,
        val tempC: Double?,
        val bpSystolic: Int?,
        val bpDiastolic: Int?,
        val pulseBpm: Int?,
        val respRate: Int?,
        val spo2Pct: Int?,
        val muacCm: Double?,
        val notes: String?,
    ) : PatientTimelineEvent()

    data class PaymentEvent(
        override val eventId: String,
        override val eventAt: String,
        val paymentId: String,
        val visitId: String?,
        val amountUgx: Int,
        val paymentMethod: String,
        val receiptNumber: String?,
        val serviceType: String?,
        val status: String,
        val collectedBy: String?,
    ) : PatientTimelineEvent()

    // Migration 042: care_tasks events surface on the timeline alongside
    // visits/notes/vitals/payments. Status is 'open' | 'in_progress' |
    // 'completed' | 'cancelled'. assigneeRole (when set) is one of the staff
    // role identifiers; assigneeId is omitted from the card UI for now —
    // resolving it to a display name would require an extra staff lookup.
    data class TaskEvent(
        override val eventId: String,
        override val eventAt: String,
        val taskId: String,
        val visitId: String?,
        // 'lab_followup' | 'phone_callback' | 'home_visit' |
        // 'medication_review' | 'referral_followup' | 'general'
        val taskType: String,
        val title: String,
        val description: String?,
        val assigneeRole: String?,
        val dueAt: String?,
        val status: String,
        val completedAt: String?,
    ) : PatientTimelineEvent()
}

/**
 * Per-field latest non-null vital for a patient. Each measurement is resolved
 * independently — weight may be from today, height from a month ago, BP from
 * last visit. Nullable types preserve "never measured" cleanly so the UI can
 * distinguish "not captured today" from "unknown".
 *
 * BP systolic/diastolic share `bpAt` because they're captured together.
 */
data class PatientLatestVitals(
    val weightKg: Double?,
    val weightKgAt: String?,
    val heightCm: Double?,
    val heightCmAt: String?,
    val tempC: Double?,
    val tempCAt: String?,
    val bpSystolic: Int?,
    val bpDiastolic: Int?,
    val bpAt: String?,
    val pulseBpm: Int?,
    val pulseBpmAt: String?,
    val respRate: Int?,
    val respRateAt: String?,
    val spo2Pct: Int?,
    val spo2PctAt: String?,
    val muacCm: Double?,
    val muacCmAt: String?,
)
