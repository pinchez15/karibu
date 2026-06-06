package com.karibuhealth.app.data.local.db.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * A postnatal round for the mother or the (nested) newborn (migration 057).
 * Append-only; offline-first via the outbox. Newborn danger signs are evaluated
 * on-device from these values plus the delivery's birth weight.
 */
@Entity(
    tableName = "postnatal_observations",
    indices = [Index(value = ["admission_id", "observed_at"])],
)
data class PostnatalObservationEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "admission_id") val admissionId: String,
    @ColumnInfo(name = "clinic_id") val clinicId: String,
    @ColumnInfo(name = "patient_id") val patientId: String,
    val subject: String, // mother | newborn
    @ColumnInfo(name = "observed_at") val observedAt: String,
    @ColumnInfo(name = "temp_c") val tempC: Double? = null,
    @ColumnInfo(name = "pulse_bpm") val pulseBpm: Int? = null,
    @ColumnInfo(name = "resp_rate") val respRate: Int? = null,
    @ColumnInfo(name = "bp_systolic") val bpSystolic: Int? = null,
    @ColumnInfo(name = "bp_diastolic") val bpDiastolic: Int? = null,
    val bleeding: String? = null,
    @ColumnInfo(name = "fundus_firm") val fundusFirm: Boolean? = null,
    @ColumnInfo(name = "feeding_well") val feedingWell: Boolean? = null,
    @ColumnInfo(name = "not_feeding") val notFeeding: Boolean = false,
    val convulsions: Boolean = false,
    val jaundice: Boolean = false,
    val note: String? = null,
    @ColumnInfo(name = "is_synced") val isSynced: Boolean = true,
)
