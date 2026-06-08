package com.karibuhealth.app.data.local.db.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * A typed, append-only inpatient progress note (migration 058). Offline-first;
 * the note IS the handover, so there is no dictation path. [authorName] is filled
 * from the server on refresh (null for a just-written local note).
 */
@Entity(
    tableName = "admission_notes",
    indices = [Index(value = ["admission_id", "created_at"])],
)
data class AdmissionNoteEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "admission_id") val admissionId: String,
    @ColumnInfo(name = "clinic_id") val clinicId: String,
    @ColumnInfo(name = "patient_id") val patientId: String,
    val note: String,
    @ColumnInfo(name = "author_name") val authorName: String? = null,
    @ColumnInfo(name = "created_at") val createdAt: String,
    @ColumnInfo(name = "is_synced") val isSynced: Boolean = true,
)
