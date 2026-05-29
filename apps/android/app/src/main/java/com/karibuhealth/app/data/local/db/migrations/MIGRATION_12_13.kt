package com.karibuhealth.app.data.local.db.migrations

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

/** v12 -> v13: clinic lab + formulary catalog cache (migration 048). */
val MIGRATION_12_13 = object : Migration(12, 13) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS clinic_lab_catalog (
                id TEXT NOT NULL PRIMARY KEY,
                clinic_id TEXT NOT NULL,
                test_name TEXT NOT NULL,
                code TEXT,
                category TEXT,
                display_order INTEGER NOT NULL DEFAULT 0,
                is_available INTEGER NOT NULL DEFAULT 1,
                notes TEXT
            )
            """.trimIndent(),
        )
        db.execSQL(
            "CREATE UNIQUE INDEX IF NOT EXISTS index_clinic_lab_catalog_clinic_id_test_name ON clinic_lab_catalog(clinic_id, test_name)",
        )
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS clinic_formulary_catalog (
                id TEXT NOT NULL PRIMARY KEY,
                clinic_id TEXT NOT NULL,
                drug_name TEXT NOT NULL,
                code TEXT,
                category TEXT,
                display_order INTEGER NOT NULL DEFAULT 0,
                is_available INTEGER NOT NULL DEFAULT 1,
                notes TEXT
            )
            """.trimIndent(),
        )
        db.execSQL(
            "CREATE UNIQUE INDEX IF NOT EXISTS index_clinic_formulary_catalog_clinic_id_drug_name ON clinic_formulary_catalog(clinic_id, drug_name)",
        )
    }
}
