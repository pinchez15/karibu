package com.karibuhealth.app.data.local.db.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * A maternity delivery record with the nested newborn outcome (migration 056).
 * One per admission. Offline-first; synced via the outbox. The newborn is kept
 * inside the delivery (sex/weight/outcome/resus), not as a separate admission.
 */
@Entity(
    tableName = "deliveries",
    indices = [Index(value = ["admission_id"], unique = true)],
)
data class DeliveryEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "admission_id") val admissionId: String,
    @ColumnInfo(name = "clinic_id") val clinicId: String,
    @ColumnInfo(name = "patient_id") val patientId: String,
    @ColumnInfo(name = "delivered_at") val deliveredAt: String,
    val mode: String? = null,
    @ColumnInfo(name = "oxytocin_given") val oxytocinGiven: Boolean = false,
    @ColumnInfo(name = "blood_loss_ml") val bloodLossMl: Int? = null,
    @ColumnInfo(name = "placenta_complete") val placentaComplete: Boolean? = null,
    val outcome: String? = null,
    @ColumnInfo(name = "baby_sex") val babySex: String? = null,
    @ColumnInfo(name = "birth_weight_g") val birthWeightG: Int? = null,
    @ColumnInfo(name = "apgar_1") val apgar1: Int? = null,
    @ColumnInfo(name = "apgar_5") val apgar5: Int? = null,
    @ColumnInfo(name = "resuscitation_done") val resuscitationDone: Boolean = false,
    @ColumnInfo(name = "vitamin_k_given") val vitaminKGiven: Boolean = false,
    @ColumnInfo(name = "early_breastfeeding") val earlyBreastfeeding: Boolean = false,
    val notes: String? = null,
    @ColumnInfo(name = "is_synced") val isSynced: Boolean = true,
)
