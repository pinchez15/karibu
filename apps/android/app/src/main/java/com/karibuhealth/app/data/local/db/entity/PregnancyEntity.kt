package com.karibuhealth.app.data.local.db.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * A tracked pregnancy in the ANC registry (migration 059). Durable record for a
 * mother across the antenatal period; ANC contacts and the derived protocol
 * status hang off it. Patient name denormalised for the registry list.
 */
@Entity(
    tableName = "pregnancies",
    indices = [
        Index("patient_id"),
        Index(value = ["clinic_id", "status", "edd"]),
    ],
)
data class PregnancyEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "clinic_id") val clinicId: String,
    @ColumnInfo(name = "patient_id") val patientId: String,
    @ColumnInfo(name = "patient_name") val patientName: String? = null,
    val lmp: String? = null,
    val edd: String? = null,
    val gravida: Int? = null,
    val para: Int? = null,
    @ColumnInfo(name = "blood_group") val bloodGroup: String? = null,
    @ColumnInfo(name = "hiv_status") val hivStatus: String? = null,
    @ColumnInfo(name = "syphilis_status") val syphilisStatus: String? = null,
    @ColumnInfo(name = "hepb_status") val hepbStatus: String? = null,
    @ColumnInfo(name = "risk_notes") val riskNotes: String? = null,
    val status: String = "active",
    @ColumnInfo(name = "is_synced") val isSynced: Boolean = true,
)
