package com.karibuhealth.app.data.local.db.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * A locally-cached inpatient admission (migration 053). Unlike the prior
 * online-only admit, this is written to Room first so the 2am no-signal labour
 * admission succeeds and the patient appears on the ward census immediately,
 * syncing via the outbox when a connection returns.
 *
 * Patient name / dob / sex are denormalised so the census renders offline
 * without a join to the patients cache.
 */
@Entity(
    tableName = "admissions",
    indices = [
        Index("clinic_id"),
        Index("patient_id"),
        Index(value = ["clinic_id", "status", "admitted_at"]),
    ],
)
data class AdmissionEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "clinic_id") val clinicId: String,
    @ColumnInfo(name = "patient_id") val patientId: String,
    @ColumnInfo(name = "patient_name") val patientName: String? = null,
    @ColumnInfo(name = "date_of_birth") val dateOfBirth: String? = null,
    val sex: String? = null,
    val ward: String = "general",
    @ColumnInfo(name = "bed_label") val bedLabel: String? = null,
    @ColumnInfo(name = "admission_type") val admissionType: String? = null,
    @ColumnInfo(name = "chief_complaint") val chiefComplaint: String? = null,
    @ColumnInfo(name = "weight_kg") val weightKg: Double? = null,
    @ColumnInfo(name = "provisional_dx") val provisionalDx: String? = null,
    // Minimal maternity fields — never gate the admission write.
    val gravida: Int? = null,
    val para: Int? = null,
    val edd: String? = null,
    @ColumnInfo(name = "gestation_weeks") val gestationWeeks: Int? = null,
    @ColumnInfo(name = "hiv_status") val hivStatus: String? = null,
    @ColumnInfo(name = "presenting_status") val presentingStatus: String? = null,
    @ColumnInfo(name = "admitted_at") val admittedAt: String,
    val status: String = "active",
    @ColumnInfo(name = "is_synced") val isSynced: Boolean = true,
)
