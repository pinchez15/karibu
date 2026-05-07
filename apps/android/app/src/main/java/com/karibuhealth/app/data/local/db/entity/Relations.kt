package com.karibuhealth.app.data.local.db.entity

import androidx.room.Embedded
import androidx.room.Relation

data class VisitWithPatient(
    @Embedded val visit: VisitEntity,
    @Relation(
        parentColumn = "patient_id",
        entityColumn = "id",
    )
    val patient: PatientEntity,
)

data class VisitWithDetails(
    @Embedded val visit: VisitEntity,
    @Relation(parentColumn = "patient_id", entityColumn = "id")
    val patient: PatientEntity,
    @Relation(parentColumn = "id", entityColumn = "visit_id")
    val providerNote: ProviderNoteEntity?,
    // Up to two rows per visit since migration 032 (clinician_fallback +
    // ai_generated). Callers split by `source`.
    @Relation(parentColumn = "id", entityColumn = "visit_id")
    val patientNotes: List<PatientNoteEntity> = emptyList(),
) {
    val clinicianPatientNote: PatientNoteEntity?
        get() = patientNotes.firstOrNull { it.source == "clinician_fallback" }
            ?: patientNotes.firstOrNull()
    val aiPatientNote: PatientNoteEntity?
        get() = patientNotes.firstOrNull { it.source == "ai_generated" }
}
