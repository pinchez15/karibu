package com.karibuhealth.app.data.local.db.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * A recorded Ebola/VHF screening (migration 060). Persisted so a suspect case is
 * an auditable record (isolation / notification / referral), not a transient
 * popup, and so the interruptive banner survives reopening the visit.
 */
@Entity(
    tableName = "ebola_screenings",
    indices = [Index(value = ["visit_id", "created_at"])],
)
data class EbolaScreeningEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "clinic_id") val clinicId: String,
    @ColumnInfo(name = "patient_id") val patientId: String,
    @ColumnInfo(name = "visit_id") val visitId: String? = null,
    @ColumnInfo(name = "temp_c") val tempC: Double? = null,
    @ColumnInfo(name = "epi_contact") val epiContact: Boolean = false,
    @ColumnInfo(name = "unexplained_bleeding") val unexplainedBleeding: Boolean = false,
    val symptoms: String? = null,
    @ColumnInfo(name = "is_suspect") val isSuspect: Boolean = false,
    @ColumnInfo(name = "action_taken") val actionTaken: String? = null,
    @ColumnInfo(name = "created_at") val createdAt: String,
    @ColumnInfo(name = "is_synced") val isSynced: Boolean = true,
)
