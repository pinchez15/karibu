package com.karibuhealth.app.data.local.db.migrations

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

/** v11 -> v12: offline pharmacy stock cache (EHR pivot). */
val MIGRATION_11_12 = object : Migration(11, 12) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS pharmacy_stock_items (
                id TEXT NOT NULL PRIMARY KEY,
                clinic_id TEXT NOT NULL,
                drug_code TEXT NOT NULL,
                drug_name TEXT NOT NULL,
                formulation TEXT NOT NULL,
                strength TEXT,
                unit TEXT NOT NULL,
                quantity_on_hand REAL NOT NULL,
                low_stock_threshold REAL NOT NULL DEFAULT 10,
                active INTEGER NOT NULL DEFAULT 1,
                updated_at TEXT NOT NULL DEFAULT ''
            )
            """.trimIndent(),
        )
        db.execSQL(
            "CREATE INDEX IF NOT EXISTS index_pharmacy_stock_items_clinic_id ON pharmacy_stock_items(clinic_id)",
        )
    }
}
