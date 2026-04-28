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

enum class NoteStatus { draft, finalized }

enum class PaymentMethod { cash, mtn_momo, airtel_money }

enum class PaymentStatus { paid, pending, failed, waived }

// Domain models

data class Clinic(
    val id: String,
    val name: String,
    val slug: String,
    val clerkOrganizationId: String?,
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
    val isSynced: Boolean = true,
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
    val isSynced: Boolean = true,
)

data class ProviderNote(
    val id: String,
    val visitId: String,
    // Raw dictation transcript from Whisper. Short-form (typically <3 min of
    // audio). The audio itself is never persisted — only this text.
    val transcript: String?,
    // SOAP-formatted note structured by the AI assistant from the transcript.
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
