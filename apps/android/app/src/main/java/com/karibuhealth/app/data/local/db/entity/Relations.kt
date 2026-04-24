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
    @Relation(parentColumn = "id", entityColumn = "visit_id")
    val patientNote: PatientNoteEntity?,
)
