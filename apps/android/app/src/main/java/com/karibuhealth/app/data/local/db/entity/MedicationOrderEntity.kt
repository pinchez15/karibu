package com.karibuhealth.app.data.local.db.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * An inpatient medication order (migration 054). The ward's record of what was
 * ordered; pharmacy ownership of stock is deliberately separate. Offline-first:
 * orders are written to Room first and synced via the outbox.
 */
@Entity(
    tableName = "medication_orders",
    indices = [Index(value = ["admission_id", "active"])],
)
data class MedicationOrderEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "admission_id") val admissionId: String,
    @ColumnInfo(name = "clinic_id") val clinicId: String,
    @ColumnInfo(name = "patient_id") val patientId: String,
    @ColumnInfo(name = "drug_name") val drugName: String,
    val dose: String? = null,
    val route: String? = null,
    val frequency: String? = null,
    val instructions: String? = null,
    val active: Boolean = true,
    @ColumnInfo(name = "created_at") val createdAt: String,
    @ColumnInfo(name = "is_synced") val isSynced: Boolean = true,
)
