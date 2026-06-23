package com.karibuhealth.app.data.local.db.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "iv_infusions",
    indices = [Index(value = ["admission_id", "active"])],
)
data class IvInfusionEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "admission_id") val admissionId: String,
    @ColumnInfo(name = "clinic_id") val clinicId: String,
    @ColumnInfo(name = "patient_id") val patientId: String,
    @ColumnInfo(name = "fluid_type") val fluidType: String,
    val additive: String? = null,
    @ColumnInfo(name = "volume_ml") val volumeMl: Int,
    @ColumnInfo(name = "rate_ml_hr") val rateMlHr: Int? = null,
    @ColumnInfo(name = "drops_per_min") val dropsPerMin: Int? = null,
    @ColumnInfo(name = "started_at") val startedAt: String,
    @ColumnInfo(name = "stopped_at") val stoppedAt: String? = null,
    val active: Boolean = true,
    @ColumnInfo(name = "site_location") val siteLocation: String? = null,
    val notes: String? = null,
    @ColumnInfo(name = "is_synced") val isSynced: Boolean = true,
)
