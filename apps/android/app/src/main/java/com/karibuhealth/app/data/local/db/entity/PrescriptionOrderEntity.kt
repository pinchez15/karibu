package com.karibuhealth.app.data.local.db.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * OPD structured prescription line (migration 064 mirror). Distinct from
 * [MedicationOrderEntity] which is the inpatient ward table (`medication_orders`).
 */
@Entity(
    tableName = "prescription_orders",
    indices = [Index(value = ["visit_id", "sort_order"])],
)
data class PrescriptionOrderEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "visit_id") val visitId: String,
    @ColumnInfo(name = "clinic_id") val clinicId: String,
    @ColumnInfo(name = "patient_id") val patientId: String,
    @ColumnInfo(name = "sort_order") val sortOrder: Int = 0,
    @ColumnInfo(name = "medication_code") val medicationCode: String? = null,
    @ColumnInfo(name = "free_text_name") val freeTextName: String? = null,
    @ColumnInfo(name = "dose_text") val doseText: String? = null,
    @ColumnInfo(name = "route_text") val routeText: String? = null,
    @ColumnInfo(name = "frequency_text") val frequencyText: String? = null,
    @ColumnInfo(name = "duration_text") val durationText: String? = null,
    @ColumnInfo(name = "quantity_prescribed") val quantityPrescribed: Double? = null,
    @ColumnInfo(name = "quantity_unit") val quantityUnit: String? = null,
    val status: String = "ordered",
    val notes: String? = null,
    // PHARM-4 (migration 107 mirror): structured course-of-treatment fields.
    // Additive + nullable — old rows read back with NULLs. See MIGRATION_32_33.
    @ColumnInfo(name = "frequency_code") val frequencyCode: String? = null,
    @ColumnInfo(name = "frequency_per_day") val frequencyPerDay: Int? = null,
    @ColumnInfo(name = "duration_days") val durationDays: Int? = null,
    @ColumnInfo(name = "dose_amount") val doseAmount: Double? = null,
    @ColumnInfo(name = "dose_unit") val doseUnit: String? = null,
    @ColumnInfo(name = "strength_amount") val strengthAmount: Double? = null,
    @ColumnInfo(name = "strength_unit") val strengthUnit: String? = null,
    @ColumnInfo(name = "form") val form: String? = null,
    @ColumnInfo(name = "order_mode") val orderMode: String? = null,
    @ColumnInfo(name = "quantity_source") val quantitySource: String? = null,
    @ColumnInfo(name = "dispense_unit") val dispenseUnit: String? = null,
    // PHARM-5 R2: cumulative dispensed-so-far, hydrated from the view on pull.
    @ColumnInfo(name = "quantity_dispensed_so_far") val quantityDispensedSoFar: Double? = null,
)
