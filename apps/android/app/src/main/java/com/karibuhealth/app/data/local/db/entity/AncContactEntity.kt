package com.karibuhealth.app.data.local.db.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/** One ANC contact (visit) against a pregnancy (migration 059). Append-only. */
@Entity(
    tableName = "anc_contacts",
    indices = [Index(value = ["pregnancy_id", "contact_date"])],
)
data class AncContactEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "pregnancy_id") val pregnancyId: String,
    @ColumnInfo(name = "clinic_id") val clinicId: String,
    @ColumnInfo(name = "patient_id") val patientId: String,
    @ColumnInfo(name = "contact_number") val contactNumber: Int? = null,
    @ColumnInfo(name = "contact_date") val contactDate: String,
    @ColumnInfo(name = "gestation_weeks") val gestationWeeks: Int? = null,
    @ColumnInfo(name = "bp_systolic") val bpSystolic: Int? = null,
    @ColumnInfo(name = "bp_diastolic") val bpDiastolic: Int? = null,
    @ColumnInfo(name = "weight_kg") val weightKg: Double? = null,
    @ColumnInfo(name = "fundal_height_cm") val fundalHeightCm: Int? = null,
    @ColumnInfo(name = "fetal_heart_rate") val fetalHeartRate: Int? = null,
    @ColumnInfo(name = "urine_protein") val urineProtein: String? = null,
    val hb: Double? = null,
    @ColumnInfo(name = "iptp_given") val iptpGiven: Boolean = false,
    @ColumnInfo(name = "ifas_given") val ifasGiven: Boolean = false,
    @ColumnInfo(name = "td_given") val tdGiven: Boolean = false,
    val dewormed: Boolean = false,
    @ColumnInfo(name = "itn_given") val itnGiven: Boolean = false,
    val notes: String? = null,
    @ColumnInfo(name = "is_synced") val isSynced: Boolean = true,
)
