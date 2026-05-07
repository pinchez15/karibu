package com.karibuhealth.app.data.local.db.migrations

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

// v4 -> v5: pharmacy + lab MVP. Read-only on Android — these columns are
// written on the web by dispenser/lab_tech and synced back via the regular
// visit refresh path so the clinician sees outcomes in their visit details.
// Strictly additive.
val MIGRATION_4_5 = object : Migration(4, 5) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE visits ADD COLUMN dispensing_status TEXT NOT NULL DEFAULT 'not_started'")
        db.execSQL("ALTER TABLE visits ADD COLUMN dispense_notes TEXT")
        db.execSQL("ALTER TABLE visits ADD COLUMN dispensed_at TEXT")
        db.execSQL("ALTER TABLE visits ADD COLUMN dispensed_by TEXT")
        db.execSQL("ALTER TABLE visits ADD COLUMN lab_status TEXT NOT NULL DEFAULT 'not_ordered'")
        db.execSQL("ALTER TABLE visits ADD COLUMN lab_results TEXT")
        db.execSQL("ALTER TABLE visits ADD COLUMN lab_abnormal INTEGER NOT NULL DEFAULT 0")
        db.execSQL("ALTER TABLE visits ADD COLUMN lab_completed_at TEXT")
        db.execSQL("ALTER TABLE visits ADD COLUMN lab_completed_by TEXT")
    }
}

// v3 -> v4: offline-first foundation. Strictly additive.
//
// Adds:
//   - patient_vitals table for longitudinal vitals (inpatient maternal pattern)
//   - visits.department (server-side since migration 024; mirrored locally)
//   - visits.documentation_complete + documentation_completed_at
//   - patient_notes.source (discriminator for clinician_fallback vs ai_generated)
//
// All ALTER TABLE ADD COLUMN calls are NOT NULL DEFAULT-safe; SQLite back-fills
// existing rows with the default.
val MIGRATION_3_4 = object : Migration(3, 4) {
    override fun migrate(db: SupportSQLiteDatabase) {
        // 1. visits.department
        db.execSQL("ALTER TABLE visits ADD COLUMN department TEXT NOT NULL DEFAULT 'opd'")

        // 2. visits.documentation_complete + documentation_completed_at
        db.execSQL("ALTER TABLE visits ADD COLUMN documentation_complete INTEGER NOT NULL DEFAULT 0")
        db.execSQL("ALTER TABLE visits ADD COLUMN documentation_completed_at TEXT")

        // 3. patient_notes.source
        db.execSQL("ALTER TABLE patient_notes ADD COLUMN source TEXT NOT NULL DEFAULT 'ai_generated'")

        // 4. patient_vitals
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS patient_vitals (
                id TEXT NOT NULL PRIMARY KEY,
                patient_id TEXT NOT NULL,
                visit_id TEXT,
                recorded_at TEXT NOT NULL,
                recorded_by TEXT,
                weight_kg REAL,
                height_cm REAL,
                temp_c REAL,
                bp_systolic INTEGER,
                bp_diastolic INTEGER,
                pulse_bpm INTEGER,
                resp_rate INTEGER,
                spo2_pct INTEGER,
                muac_cm REAL,
                notes TEXT,
                is_synced INTEGER NOT NULL DEFAULT 1
            )
            """.trimIndent(),
        )
        db.execSQL(
            "CREATE INDEX IF NOT EXISTS index_patient_vitals_patient_id_recorded_at " +
                "ON patient_vitals(patient_id, recorded_at)",
        )
        db.execSQL(
            "CREATE INDEX IF NOT EXISTS index_patient_vitals_visit_id " +
                "ON patient_vitals(visit_id)",
        )
    }
}

// v2 -> v3: dictation-only product pivot.
//
// What v2 had that v3 doesn't:
//   - audio_uploads table (entire ambient-recording pipeline gone)
//   - patient_consents table (no DPPA cross-border consent flow)
//   - visits.consent_recording, consent_timestamp, consent_verified, consent_id
//   - visits.source_language (no Sunbird local-language transcription path)
//   - visits.audio_deleted_at, retention_expires_at
//   - visits.audio_local_path, audio_uploaded (local-only fields)
//   - provider_notes.transcript_original, transcript_english,
//     transcription_provider, transcription_confidence, diarization_output,
//     audio_trimmed
//   - clinics.whatsapp_phone_number, whatsapp_business_account_id
//   - VisitStatus values 'recording' / 'uploading' / 'processing' (collapsed
//     to 'pending')
//
// SQLite can't DROP COLUMN (well, recent versions can but Room doesn't ship
// that), so for each affected table we create a new shape, copy the columns
// that survive, drop the old, rename. Indexes are recreated with Room's
// default naming convention (index_<table>_<col>...) so they match what the
// @Entity declarations expect on the next open.
val MIGRATION_2_3 = object : Migration(2, 3) {
    override fun migrate(db: SupportSQLiteDatabase) {
        // 1. Drop tables that are gone entirely.
        db.execSQL("DROP TABLE IF EXISTS audio_uploads")
        db.execSQL("DROP TABLE IF EXISTS patient_consents")

        // 2. Rebuild `clinics` without WhatsApp columns.
        db.execSQL(
            """
            CREATE TABLE clinics_new (
                id TEXT NOT NULL PRIMARY KEY,
                name TEXT NOT NULL,
                slug TEXT NOT NULL,
                clerk_organization_id TEXT,
                timezone TEXT NOT NULL,
                is_active INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """.trimIndent(),
        )
        db.execSQL(
            """
            INSERT INTO clinics_new (id, name, slug, clerk_organization_id, timezone, is_active, created_at, updated_at)
            SELECT id, name, slug, clerk_organization_id, timezone, is_active, created_at, updated_at
            FROM clinics
            """.trimIndent(),
        )
        db.execSQL("DROP TABLE clinics")
        db.execSQL("ALTER TABLE clinics_new RENAME TO clinics")

        // 3. Rebuild `visits` without audio + consent + source_language fields.
        //    Old statuses recording/uploading/processing collapse to 'pending'.
        db.execSQL(
            """
            CREATE TABLE visits_new (
                id TEXT NOT NULL PRIMARY KEY,
                clinic_id TEXT NOT NULL,
                patient_id TEXT NOT NULL,
                doctor_id TEXT,
                nurse_id TEXT,
                status TEXT NOT NULL,
                queue_status TEXT NOT NULL,
                queue_position INTEGER,
                priority TEXT NOT NULL,
                chief_complaint TEXT,
                checked_in_at TEXT,
                review_status TEXT NOT NULL,
                reviewed_by TEXT,
                reviewed_at TEXT,
                diagnosis TEXT,
                medications TEXT,
                follow_up_instructions TEXT,
                tests_ordered TEXT,
                visit_date TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                finalized_at TEXT,
                error_message TEXT,
                error_at TEXT,
                is_synced INTEGER NOT NULL DEFAULT 1
            )
            """.trimIndent(),
        )
        db.execSQL(
            """
            INSERT INTO visits_new (
                id, clinic_id, patient_id, doctor_id, nurse_id,
                status, queue_status, queue_position, priority,
                chief_complaint, checked_in_at,
                review_status, reviewed_by, reviewed_at,
                diagnosis, medications, follow_up_instructions, tests_ordered,
                visit_date, created_at, updated_at,
                finalized_at, error_message, error_at, is_synced
            )
            SELECT
                id, clinic_id, patient_id, doctor_id, nurse_id,
                CASE WHEN status IN ('recording', 'uploading', 'processing') THEN 'pending' ELSE status END,
                queue_status, queue_position, priority,
                chief_complaint, checked_in_at,
                review_status, reviewed_by, reviewed_at,
                diagnosis, medications, follow_up_instructions, tests_ordered,
                visit_date, created_at, updated_at,
                finalized_at, error_message, error_at, is_synced
            FROM visits
            """.trimIndent(),
        )
        db.execSQL("DROP TABLE visits")
        db.execSQL("ALTER TABLE visits_new RENAME TO visits")
        db.execSQL("CREATE INDEX IF NOT EXISTS index_visits_clinic_id ON visits(clinic_id)")
        db.execSQL("CREATE INDEX IF NOT EXISTS index_visits_patient_id ON visits(patient_id)")
        db.execSQL("CREATE INDEX IF NOT EXISTS index_visits_doctor_id ON visits(doctor_id)")
        db.execSQL("CREATE INDEX IF NOT EXISTS index_visits_visit_date ON visits(visit_date)")
        db.execSQL("CREATE INDEX IF NOT EXISTS index_visits_clinic_id_visit_date ON visits(clinic_id, visit_date)")

        // 4. Rebuild `provider_notes` without long-form transcription columns.
        db.execSQL(
            """
            CREATE TABLE provider_notes_new (
                id TEXT NOT NULL PRIMARY KEY,
                visit_id TEXT NOT NULL,
                transcript TEXT,
                note_content TEXT,
                structured_data TEXT,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                finalized_at TEXT,
                finalized_by TEXT
            )
            """.trimIndent(),
        )
        db.execSQL(
            """
            INSERT INTO provider_notes_new (
                id, visit_id, transcript, note_content, structured_data,
                status, created_at, updated_at, finalized_at, finalized_by
            )
            SELECT
                id, visit_id, transcript, note_content, structured_data,
                status, created_at, updated_at, finalized_at, finalized_by
            FROM provider_notes
            """.trimIndent(),
        )
        db.execSQL("DROP TABLE provider_notes")
        db.execSQL("ALTER TABLE provider_notes_new RENAME TO provider_notes")
        db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS index_provider_notes_visit_id ON provider_notes(visit_id)")
    }
}
