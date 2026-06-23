package com.karibuhealth.app.domain.model

// Phase 5 — Patient-centred architecture worklists (migration 041).
//
// The seven worklists power the operational pull-list UI: needs-vitals,
// needs-clinician, needs-lab, needs-pharmacy, needs-payment, my-drafts, and
// open care-tasks. Each list is a thin projection of its RPC row — typed
// here so the UI never has to walk DTO classes directly.
//
// Domain types are kept as immutable data classes (not a sealed hierarchy)
// because each worklist row carries a different shape, and the consumer
// UI renders each list against its own card layout. Mapping happens in the
// repository's @DataDto.toDomain() extension functions.

/** Row in the "needs vitals" worklist — patient checked in today, no vitals yet. */
data class NeedsVitalsItem(
    val visitId: String,
    val patientId: String,
    val patientName: String,
    val sex: String?,
    val derivedAge: Int?,
    val chiefComplaint: String?,
    val queueStatus: String?,
    val checkedInAt: String?,
)

/** Row in the "needs clinician" worklist — visits ready for a doctor today. */
data class NeedsClinicianItem(
    val visitId: String,
    val patientId: String,
    val patientName: String,
    val sex: String?,
    val derivedAge: Int?,
    val chiefComplaint: String?,
    val queueStatus: String?,
    val priority: String?,
    val doctorId: String?,
    val checkedInAt: String?,
    val waitMinutes: Int?,
)

/** Row in the "needs lab" worklist — visits with pending/running lab work. */
data class NeedsLabItem(
    val visitId: String,
    val patientId: String,
    val patientName: String,
    val sex: String?,
    val derivedAge: Int?,
    val chiefComplaint: String?,
    val diagnosis: String? = null,
    val testsOrdered: String? = null,
    val tests: List<LabTestResultRow> = emptyList(),
    val labStatus: String?,
    val doctorId: String?,
    val visitDate: String?,
)

/** Row in the "needs pharmacy" worklist — documented visits awaiting dispense. */
data class NeedsPharmacyItem(
    val visitId: String,
    val patientId: String,
    val patientName: String,
    val sex: String?,
    val derivedAge: Int?,
    val medications: String?,
    val dispensingStatus: String?,
    val doctorId: String?,
    val visitDate: String?,
    val prescriptionLines: List<PrescriptionOrderLine> = emptyList(),
    val dispensedAt: String? = null,
)

/** Row in the "needs payment" worklist — sent visits awaiting payment. */
data class NeedsPaymentItem(
    val visitId: String,
    val patientId: String,
    val patientName: String,
    val sex: String?,
    val derivedAge: Int?,
    val diagnosis: String?,
    val visitDate: String?,
    val documentationCompletedAt: String?,
)

/** Row in the "my drafts" worklist — provider_notes still in draft. */
data class MyDraftItem(
    val noteId: String,
    val patientId: String,
    val patientName: String,
    val visitId: String?,
    val source: String?,
    val transcriptPreview: String?,
    val updatedAt: String?,
)

/** Row in the "care tasks" worklist — open follow-up tasks. */
data class CareTaskItem(
    val taskId: String,
    val patientId: String,
    val patientName: String,
    val visitId: String?,
    val taskType: String,
    val title: String,
    val description: String?,
    val assigneeRole: String?,
    val assigneeId: String?,
    val dueAt: String?,
    val status: String,
    val createdAt: String?,
)
