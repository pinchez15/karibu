package com.karibuhealth.app.data.local.db.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "iv_infusion_checks",
    indices = [Index(value = ["infusion_id", "checked_at"])],
)
data class IvInfusionCheckEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "infusion_id") val infusionId: String,
    @ColumnInfo(name = "admission_id") val admissionId: String,
    @ColumnInfo(name = "clinic_id") val clinicId: String,
    @ColumnInfo(name = "checked_at") val checkedAt: String,
    @ColumnInfo(name = "drip_running") val dripRunning: Boolean = true,
    @ColumnInfo(name = "site_ok") val siteOk: Boolean = true,
    val note: String? = null,
    @ColumnInfo(name = "is_synced") val isSynced: Boolean = true,
)
