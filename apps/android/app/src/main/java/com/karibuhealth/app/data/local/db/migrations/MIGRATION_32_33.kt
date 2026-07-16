package com.karibuhealth.app.data.local.db.migrations

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

/**
 * v32 -> v33: PHARM-4 structured prescribing (server migration 107 mirror).
 *
 * Strictly additive, all-nullable columns on `prescription_orders`:
 *   - structured course-of-treatment fields (frequency_code, frequency_per_day,
 *     duration_days, dose_amount, dose_unit, strength_amount, strength_unit,
 *     form, order_mode, quantity_source, dispense_unit)
 *   - quantity_dispensed_so_far — the cumulative dispensed balance the Android
 *     dispenser reads from `prescription_orders_with_dispensed` to default the
 *     remaining quantity (spec R2 remainder unblock).
 *
 * Old rows keep NULLs for every new column and still read/sync in the legacy
 * *_text shape (offline queued orders in the old shape sync unchanged). No
 * table rebuild, no data rewrite — SQLite back-fills the added columns with NULL.
 */
val MIGRATION_32_33 = object : Migration(32, 33) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE prescription_orders ADD COLUMN frequency_code TEXT")
        db.execSQL("ALTER TABLE prescription_orders ADD COLUMN frequency_per_day INTEGER")
        db.execSQL("ALTER TABLE prescription_orders ADD COLUMN duration_days INTEGER")
        db.execSQL("ALTER TABLE prescription_orders ADD COLUMN dose_amount REAL")
        db.execSQL("ALTER TABLE prescription_orders ADD COLUMN dose_unit TEXT")
        db.execSQL("ALTER TABLE prescription_orders ADD COLUMN strength_amount REAL")
        db.execSQL("ALTER TABLE prescription_orders ADD COLUMN strength_unit TEXT")
        db.execSQL("ALTER TABLE prescription_orders ADD COLUMN form TEXT")
        db.execSQL("ALTER TABLE prescription_orders ADD COLUMN order_mode TEXT")
        db.execSQL("ALTER TABLE prescription_orders ADD COLUMN quantity_source TEXT")
        db.execSQL("ALTER TABLE prescription_orders ADD COLUMN dispense_unit TEXT")
        db.execSQL("ALTER TABLE prescription_orders ADD COLUMN quantity_dispensed_so_far REAL")
    }
}
