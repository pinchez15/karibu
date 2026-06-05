package com.karibuhealth.app.data.local.db.migrations

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

/** v14 -> v15: local referrals cache for HCIII transfer handoffs. */
val MIGRATION_14_15 = object : Migration(14, 15) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS referrals (
                id TEXT NOT NULL PRIMARY KEY,
                clinic_id TEXT NOT NULL,
                patient_id TEXT NOT NULL,
                visit_id TEXT,
                from_department TEXT NOT NULL,
                to_facility TEXT NOT NULL,
                urgency TEXT NOT NULL,
                reason TEXT NOT NULL,
                clinical_summary TEXT,
                transport_mode TEXT,
                referred_by TEXT,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                patient_name TEXT,
                is_synced INTEGER NOT NULL DEFAULT 1
            )
            """.trimIndent(),
        )
        db.execSQL("CREATE INDEX IF NOT EXISTS index_referrals_clinic_id ON referrals(clinic_id)")
        db.execSQL("CREATE INDEX IF NOT EXISTS index_referrals_patient_id ON referrals(patient_id)")
        db.execSQL(
            "CREATE INDEX IF NOT EXISTS index_referrals_clinic_id_created_at ON referrals(clinic_id, created_at)",
        )
    }
}
