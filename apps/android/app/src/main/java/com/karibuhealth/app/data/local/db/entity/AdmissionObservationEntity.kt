package com.karibuhealth.app.data.local.db.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * One append-only rounds observation against an admission (migration 053).
 * The id is client-generated so a replayed sync op is a no-op upsert, never a
 * duplicate round. [observedAt] is the device-local time of the round and is
 * back-dateable for rounds first written on paper during a blackout.
 */
@Entity(
    tableName = "admission_observations",
    indices = [
        Index(value = ["admission_id", "observed_at"]),
    ],
)
data class AdmissionObservationEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "admission_id") val admissionId: String,
    @ColumnInfo(name = "clinic_id") val clinicId: String,
    @ColumnInfo(name = "patient_id") val patientId: String,
    @ColumnInfo(name = "observed_at") val observedAt: String,
    @ColumnInfo(name = "temp_c") val tempC: Double? = null,
    @ColumnInfo(name = "pulse_bpm") val pulseBpm: Int? = null,
    @ColumnInfo(name = "resp_rate") val respRate: Int? = null,
    @ColumnInfo(name = "bp_systolic") val bpSystolic: Int? = null,
    @ColumnInfo(name = "bp_diastolic") val bpDiastolic: Int? = null,
    @ColumnInfo(name = "spo2_pct") val spo2Pct: Int? = null,
    val avpu: String? = null,
    @ColumnInfo(name = "imci_not_feeding") val imciNotFeeding: Boolean = false,
    @ColumnInfo(name = "imci_vomiting_everything") val imciVomitingEverything: Boolean = false,
    @ColumnInfo(name = "imci_convulsions") val imciConvulsions: Boolean = false,
    @ColumnInfo(name = "imci_lethargic_unconscious") val imciLethargicUnconscious: Boolean = false,
    val note: String? = null,
    @ColumnInfo(name = "is_synced") val isSynced: Boolean = true,
)
