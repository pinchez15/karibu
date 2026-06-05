package com.karibuhealth.app.data.local.db.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "referrals",
    indices = [
        Index("clinic_id"),
        Index("patient_id"),
        Index(value = ["clinic_id", "created_at"]),
    ],
)
data class ReferralEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "clinic_id") val clinicId: String,
    @ColumnInfo(name = "patient_id") val patientId: String,
    @ColumnInfo(name = "visit_id") val visitId: String?,
    @ColumnInfo(name = "from_department") val fromDepartment: String,
    @ColumnInfo(name = "to_facility") val toFacility: String,
    val urgency: String,
    val reason: String,
    @ColumnInfo(name = "clinical_summary") val clinicalSummary: String?,
    @ColumnInfo(name = "transport_mode") val transportMode: String?,
    @ColumnInfo(name = "referred_by") val referredBy: String?,
    val status: String = "active",
    @ColumnInfo(name = "created_at") val createdAt: String,
    @ColumnInfo(name = "updated_at") val updatedAt: String,
    @ColumnInfo(name = "patient_name") val patientName: String? = null,
    @ColumnInfo(name = "is_synced") val isSynced: Boolean = true,
)
