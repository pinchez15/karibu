package com.karibuhealth.app.data.local.db.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * One append-only drug-round entry (migration 054): a dose was Given, or
 * Not-given with an honest reason (stockout / refused / NBM / absent / other).
 * Client-generated id makes a replayed sync op a no-op upsert, never a duplicate.
 */
@Entity(
    tableName = "medication_administrations",
    indices = [
        Index(value = ["order_id", "administered_at"]),
        Index(value = ["admission_id", "administered_at"]),
    ],
)
data class MedicationAdministrationEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "order_id") val orderId: String,
    @ColumnInfo(name = "admission_id") val admissionId: String,
    @ColumnInfo(name = "clinic_id") val clinicId: String,
    val status: String, // given | not_given
    @ColumnInfo(name = "not_given_reason") val notGivenReason: String? = null,
    @ColumnInfo(name = "administered_at") val administeredAt: String,
    @ColumnInfo(name = "is_synced") val isSynced: Boolean = true,
)
