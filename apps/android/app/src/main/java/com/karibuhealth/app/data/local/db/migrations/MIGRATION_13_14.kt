package com.karibuhealth.app.data.local.db.migrations

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

/** v13 -> v14: cache clinics.workflow_config for queue demotion + protocol slugs. */
val MIGRATION_13_14 = object : Migration(13, 14) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            "ALTER TABLE clinics ADD COLUMN workflow_config_json TEXT",
        )
    }
}
